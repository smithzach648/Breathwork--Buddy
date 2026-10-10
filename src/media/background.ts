import { backgroundWanted, meditationWindow } from '../meditation/policy';
import type { Preferences } from '../settings/preferences';
import { defaultPreferences } from '../settings/preferences';
import type { SessionState } from '../session/engine';
import { mediaLibrary, type MediaLibrary } from './library';
import { BackgroundGain } from './background-gain';
import type { AudioEnvironmentPort } from '../audio/meditation-signals';
import {environmentPlan} from '../meditation/environment';

export interface BackgroundState { source: string; name: string; playing: boolean; position: number; duration: number; error: string; preview: boolean; }
/** One streaming player. Fade timers affect presentation only, never session deadlines. */
export class BackgroundController {
    private audio: HTMLAudioElement;
    private preferences = defaultPreferences();
    private state: BackgroundState = { source: 'none', name: '', playing: false, position: 0, duration: 0, error: '', preview: false };
    private listeners = new Set<() => void>();
    private epoch = 0;
    private url?: { url: string; owned: boolean };
    private gain: BackgroundGain;
    private playGeneration = 0;
    private visible = true;
    private intent = false;
    private ended = false;
    private manualPause = false;
    private session?: SessionState;
    private sessionKey = '';
    private mediaNode?: MediaElementAudioSourceNode;
    private liveMusic=new Map<string,number>();
    private levelKey(){return meditationWindow(this.session)?.blockId||'foundation';}
    private switching = '';
    private install?: () => void;
    private prepared?:{url:string;owned:boolean};
    private discardPrepared(){if(this.prepared?.owned)URL.revokeObjectURL(this.prepared.url);this.prepared=undefined;this.install=undefined;}
    private noiseReady = () => true;
    setNoiseReady(check:()=>boolean) { this.noiseReady=check; }
    constructor(private library: Pick<MediaLibrary, 'resolve'> = mediaLibrary, createAudio = () => new Audio(), private output?: () => AudioEnvironmentPort | undefined) {
        this.audio = createAudio();
        this.audio.preload = 'metadata';
        this.gain = new BackgroundGain(this.audio, () => { if (!this.intent) this.audio.pause(); const install=this.install;this.install=undefined;install?.();this.publish(); });
        this.audio.addEventListener('timeupdate', () => this.publish());
        this.audio.addEventListener('play', () => this.publish());
        this.audio.addEventListener('pause', () => this.publish());
        this.audio.addEventListener('loadedmetadata', () => this.publish());
        this.audio.addEventListener('ended', () => { this.ended = true; this.intent = false; this.publish(); });
        this.audio.addEventListener('error', () => {
            // A queued error from an unloaded source must not overwrite the new source's status.
            if (!this.url || this.audio.currentSrc !== this.url.url) return;
            this.intent = false; this.state = { ...this.state, error: 'Background audio is unavailable. Practice continues normally.' }; this.publish();
        });
    }
    getState = () => this.state;
    getMode = () => this.preferences.background.mode;
    canPlay = () => this.session?.status !== 'running' || (environmentPlan(this.session)?environmentPlan(this.session)!.source!=='none':backgroundWanted(this.session,this.preferences));
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    private publish() {
        this.state = { ...this.state, playing: !this.audio.paused && !this.audio.ended, position: this.audio.currentTime || 0, duration: Number.isFinite(this.audio.duration) ? this.audio.duration : 0 };
        this.listeners.forEach(listener => listener());
    }
    diagnostics() { return { ...this.gain.diagnostics(), master: this.preferences.volumes.master, background: this.preferences.volumes.ambience, sourceGeneration: this.epoch, playGeneration: this.playGeneration, visible: this.visible, intent: this.intent, sessionId: this.session?.sessionId, stageId: this.session?.stageId, phase: this.session?.stage?.phase, position: this.audio.currentTime, paused: this.audio.paused }; }
    private clearSource() {
        const hadSource = !!this.url || !!this.audio.src;
        ++this.playGeneration; this.gain.reset(); if (!this.audio.paused) this.audio.pause(); this.audio.removeAttribute('src'); if (hadSource) this.audio.load();
        if (this.url?.owned) URL.revokeObjectURL(this.url.url);
        this.url = undefined; this.audio.currentTime = 0;
    }
    async select(source: string, preview = false) {
        const epoch = ++this.epoch;
        this.intent = false; this.clearSource(); this.ended = false; this.manualPause = false;
        this.state = { ...this.state, source, name: '', error: '', preview, position: 0, playing: false }; this.publish();
        if (source === 'none') return;
        try {
            const resolved = await this.library.resolve(source);
            if (epoch !== this.epoch) { if (resolved.owned) URL.revokeObjectURL(resolved.url); return; }
            this.url = resolved; this.audio.src = resolved.url; this.audio.loop = preview ? false : this.preferences.background.loop;
            this.state = { ...this.state, name: resolved.name }; this.publish();
            if (preview) this.play(); else this.follow();
        } catch (error) {
            if (epoch !== this.epoch) return;
            this.state = { ...this.state, error: error instanceof Error ? error.message : 'Background audio unavailable.' }; this.publish();
        }
    }
    setPreferences(preferences: Preferences) {
        const previous = this.preferences;
        if(this.session?.status==='running'&&previous.volumes.ambience!==preferences.volumes.ambience)this.liveMusic.set(this.levelKey(),preferences.volumes.ambience);
        this.preferences = structuredClone(preferences);
        if(!environmentPlan(this.session))this.gain.setBase(preferences.volumes.master * preferences.volumes.ambience, preferences.guidance.ducking);
        this.audio.loop = this.state.preview ? false : preferences.background.loop;
        if (this.session?.status==='running'&&this.session.snapshot?.meditationSound?.environment) { this.follow(); return; }
        if (previous.background.source !== preferences.background.source) { void this.select(preferences.background.source); return; }
        if (previous.background.mode !== preferences.background.mode || previous.meditation.music !== preferences.meditation.music) { this.manualPause = false; this.state = { ...this.state, preview: false }; this.follow(); }
    }
    setDucking(active: boolean) { this.gain.setVoice(active && this.intent && this.visible); }
    sync(session: SessionState) {
        this.session = session;
        const plan=environmentPlan(session);
        const key = `${session.sessionId}:${session.status}:${session.stageId}:${session.stage?.phase}`;
        if (key === this.sessionKey && !plan) return;
        const newSession = session.status === 'running' && (!this.sessionKey.startsWith(`${session.sessionId}:running:`));
        this.sessionKey = key;
        if (newSession) {
            this.liveMusic.clear();this.discardPrepared();this.switching='';this.manualPause = false; this.ended = false; this.gain.reset(); ++this.playGeneration;
            this.state = { ...this.state, preview: false };
            this.audio.pause(); this.audio.currentTime = 0;
            if (!plan && (this.state.source !== this.preferences.background.source || !this.url && this.preferences.background.source !== 'none')) void this.select(this.preferences.background.source);
        }
        if (session.status === 'cancelled' || session.status === 'idle') { this.stop(); return; }
        this.follow();
    }
    private follow() {
        const plan=environmentPlan(this.session);
        if(plan){
            this.gain.setBase(this.preferences.volumes.master*(this.liveMusic.get(this.levelKey())??plan.musicLevel),this.preferences.guidance.ducking);
            this.audio.loop=plan.loop;
            if(!this.visible||this.manualPause||this.ended&&this.state.source===plan.source)return;
            if(this.switching&&this.switching!==plan.source){++this.epoch;this.switching='';this.discardPrepared();}
            if(plan.source==='none'){
                if(plan.texture!=='off'&&!this.noiseReady())return;
                this.pause(false,plan.ramp*1000);return;
            }
            if(this.state.source!==plan.source||!this.url){
                if(this.switching===plan.source)return;
                const epoch=++this.epoch;this.switching=plan.source;this.discardPrepared();
                void this.library.resolve(plan.source).then(resolved=>{
                    if(epoch!==this.epoch||!this.visible||this.session?.status!=='running'||environmentPlan(this.session)?.source!==plan.source){if(resolved.owned)URL.revokeObjectURL(resolved.url);return;}
                    this.prepared=resolved;
                    const install=()=>{
                        if(epoch!==this.epoch){if(resolved.owned)URL.revokeObjectURL(resolved.url);return;}
                        this.prepared=undefined;this.clearSource();this.switching='';this.ended=false;this.url=resolved;this.audio.src=resolved.url;
                        this.state={...this.state,source:plan.source,name:resolved.name,error:'',preview:false};this.follow();
                    };
                    if(this.url&&!this.audio.paused){this.install=install;this.intent=false;++this.playGeneration;this.gain.pause(plan.ramp*500);}else install();
                }).catch(error=>{if(epoch===this.epoch){this.switching='';this.state={...this.state,error:error instanceof Error?error.message:'Background unavailable.'};this.manualPause=true;this.publish();}});
                return;
            }
            this.play(false);return;
        }
        const s = this.session, mode = this.preferences.background.mode;
        const wanted = !!s && !this.manualPause && !this.ended && backgroundWanted(s,this.preferences);
        if (wanted) this.play(false); else this.pause(false);
    }
    play(manual = true) {
        if (manual && !this.canPlay()) return;
        if (!this.url || !this.visible) return;
        const output = this.output?.();
        if (manual && output?.context.state === 'suspended') void output.context.resume().catch(() => { /* Autoplay errors remain presentation only. */ });
        if (!this.mediaNode && output?.mediaInput && output.context.createMediaElementSource) {
            // BackgroundGain already includes Master. Join the shared output limiter AFTER Master.
            this.mediaNode = output.context.createMediaElementSource(this.audio);
            this.mediaNode.connect(output.mediaInput);
        }
        if (manual) { this.manualPause = false; if (this.ended) this.audio.currentTime = 0; this.ended = false; }
        if (this.intent && !this.audio.paused) return;
        this.intent = true;
        const epoch = this.epoch;
        const playGeneration = ++this.playGeneration;
        void this.audio.play().then(() => {
            if (epoch !== this.epoch || playGeneration !== this.playGeneration) return;
            if (!this.intent || !this.visible) { this.audio.pause(); return; }
            this.state = { ...this.state, error: '' }; const window = meditationWindow(this.session),plan=environmentPlan(this.session); const lead = plan ? this.session?.elapsedMs===0 ? 700 : plan.ramp*1000 : window && this.session?.stage ? Math.max(700,window.fadeDeadline - this.session.stageStart! - this.session.stage.durationMs + this.session.remainingMs) : 700; this.gain.play(lead); this.publish();
        }).catch(() => { if (epoch === this.epoch && playGeneration === this.playGeneration) { this.intent = false; this.state = { ...this.state, error: 'Tap Play background to allow audio on this device. Practice continues normally.' }; this.publish(); } });
    }
    pause(manual = true, milliseconds=700) { if (manual) this.manualPause = true; if (!this.intent) return; this.intent = false; ++this.playGeneration; if (!this.audio.paused) this.gain.pause(milliseconds); }
    stop() { ++this.epoch; ++this.playGeneration; this.discardPrepared();this.switching='';this.intent = false; this.manualPause = true; this.gain.reset(); if (!this.audio.paused) this.audio.pause(); this.audio.currentTime = 0; this.publish(); }
    preview(source: string) { if (this.session?.status === 'running') return; void this.select(source, true); }
    visibilityChanged(visible: boolean) {
        this.visible = visible;
        if (!visible) { ++this.epoch;this.discardPrepared();this.switching='';++this.playGeneration; this.gain.reset(); this.audio.pause(); this.publish(); }
        else if (this.state.preview && this.intent) this.play(false); else this.follow();
    }
    removeSource(source: string) { if (this.state.source === source) { ++this.epoch; this.intent = false; this.clearSource(); this.state = { ...this.state, source: 'none', name: '', preview: false }; this.publish(); } }
    dispose() { ++this.epoch;this.discardPrepared(); this.intent = false; this.clearSource(); this.mediaNode?.disconnect(); this.listeners.clear(); }
}
