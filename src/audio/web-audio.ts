import type { Clock } from '../session/clock';
import type { StageAudio, SessionAudio } from '../session/audio-port';
import type { Preferences } from '../settings/preferences';
import { assetUrl, resolveAsset, audioCatalog, type AudioBus } from './catalog';
import { stageCues, type AudioCue } from './cues';
import { cueEnabled, guidanceCategory } from './guidance';
import { MeditationSignals, type AudioEnvironmentPort } from './meditation-signals';
import { createOutput } from './output';
import { JourneyAudio } from '../meditation-suite/audio';
import type { PracticeSnapshot } from '../session/config';
import {PRACTICE_NARRATION} from './practice-narration';
import {musicalPhase} from './practice-guidance';
import {scheduleSoftNote} from '../meditation-suite/instrument';
import {softNoteHz} from '../meditation-suite/tones';
import type { JourneyConfig } from '../meditation-suite/model';
import { APPROVED_NARRATION } from '../meditation-suite/voice-assets';
import { normalizeMix } from '../meditation-suite/mix';
import type {AcousticSelection} from '../meditation/acoustic-scenes';
import type {ListenerMix} from '../meditation-suite/mix';
interface Track {
    source: AudioBufferSourceNode | OscillatorNode;
    gain: GainNode;
    scope: StageAudio;
    continuesInto?: AudioCue['continuesInto'];
    cueId: string;
    when: number;
    end: number;
}
export interface AudioDiagnostics {
    acoustic?:ReturnType<JourneyAudio['diagnostics']>;
    journey?: ReturnType<JourneyAudio['diagnostics']>;
    scheduled: number;
    skipped: number;
    failures: readonly string[];
    playing: number;
    state: string;
}
export class BrowserAudio implements SessionAudio {
    private context: AudioContext | undefined;
    private buses: Partial<Record<AudioBus, GainNode>> = {};
    private loads = new Map<string, Promise<AudioBuffer | undefined>>();
    private tracks = new Set<Track>();
    private active: {
        scope: StageAudio;
        epoch: number;
        started: boolean;
    } | undefined;
    private epoch = 0;
    private offset = 0;
    private scheduled = 0;
    private skipped = 0;
    private failures = new Set<string>();
    private listeners = new Set<() => void>();
    private decoded = new Set<string>();
    readonly signals: MeditationSignals;
    readonly journeys: JourneyAudio;
    private journeySession?: string;
    private acousticSession?:string;
    private acousticStageId?:string;
    private sessionMixOverride?:ListenerMix;
    private mediaInput?: AudioNode;
    private narrationPreview?:AudioBufferSourceNode;
    private narrationPreviewGeneration=0;
    private practiceResumeNatural=false;
    constructor(private clock: Clock, private preferences: Preferences, private createContext = () => new AudioContext(), private fetcher: typeof fetch = (...args) => fetch(...args)) { this.signals = new MeditationSignals(clock,()=>this.environmentPort(),preferences,()=>this.load('signals.bowl')); this.journeys = new JourneyAudio(clock,()=>this.environmentPort(),(id,sha)=>this.load(id,sha),()=>this.notify()); }
    /** Independent stereo-capable buses connect before this shared Master gain. */
    environmentPort(): AudioEnvironmentPort | undefined { return this.context && this.buses.master ? { context: this.context, input: this.buses.master, mediaInput: this.mediaInput } : undefined; }
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    private notify() { this.listeners.forEach(listener => listener()); }
    diagnostics(): AudioDiagnostics { return { scheduled: this.scheduled, skipped: this.skipped, failures: [...this.failures], playing: this.tracks.size, state: this.context?.state || 'not initialized', ...(this.journeySession ? {journey:this.journeys.diagnostics()}: {}),...(this.acousticSession?{acoustic:this.journeys.diagnostics()}:{}) }; }
    /** Call directly in a user gesture; readiness is resolved before the session clock starts. */
    async unlock(preload=true) {
        try {
            if (!this.context) {
                this.context = this.createContext();
                this.buses.master = this.context.createGain();
                if(typeof this.context.createWaveShaper === 'function'){this.mediaInput=createOutput(this.context);this.buses.master.connect(this.mediaInput);}else this.buses.master.connect(this.context.destination);
                for (const bus of ['voice', 'breath'] as const) {
                    this.buses[bus] = this.context.createGain();
                    this.buses[bus]!.connect(this.buses.master);
                }
                this.setPreferences(this.preferences);
                this.context.addEventListener('statechange', () => {
                    if (this.context?.state === 'running') {
                        this.mapClock();
                        const scope = this.active?.scope;
                        if (scope && !this.active?.started)
                            this.enter({ ...scope, resuming: this.clock.now() - scope.start > 250 });
                    }
                    else { this.stopNarrationPreview();this.stopTracks(); this.signals.stop(); this.journeys.suspend(); if (this.active) this.active = { ...this.active, epoch: ++this.epoch, started: false }; }
                    this.notify();
                });
            }
            if (this.context.state !== 'running') await this.context.resume();
            this.mapClock();
            const scope = this.active?.scope;
            if (scope && !this.active?.started)
                // Initial resume also emits statechange, which marks the scope as resuming.
                // A newly started stage still needs its entry cues; later resumes skip them.
                this.enter({ ...scope, resuming: this.clock.now() - scope.start > 250 });
            if(preload)void Promise.all(audioCatalog.filter(a => (a.category === 'voice' || a.category === 'breath')&&!a.id.startsWith('suite.')&&!a.id.startsWith('practice.')).map(a => this.load(a.id)));
        }
        catch {
            this.failures.add('Audio unavailable');
            this.notify();
        }
    }
    private mapClock() {
        if (this.context)
            this.offset = this.context.currentTime - this.clock.now() / 1000;
    }
    setPreferences(preferences: Preferences) {
        const mixChanged=JSON.stringify(preferences.journeyMix)!==JSON.stringify(this.preferences.journeyMix);
        if(!this.preferences.guidance.breathSounds&&preferences.guidance.breathSounds&&this.active?.scope.stage.guidanceProfile)this.practiceResumeNatural=true;
        this.preferences = structuredClone(preferences);
        if(mixChanged)this.setJourneyMix(normalizeMix(preferences.journeyMix));
        if(!preferences.guidance.generalVoice||!preferences.volumes.voice||!preferences.volumes.master)this.stopNarrationPreview();
        this.journeys.setVoicePreferences(preferences.volumes.voice,preferences.guidance.generalVoice,preferences.guidance.ducking);
        this.signals.setPreferences(this.preferences);
        this.stopTracks(track => !cueEnabled(track.cueId, preferences));
        for (const bus of ['master', 'voice', 'breath'] as const) {
            const node = this.buses[bus];
            if (node && this.context)
                node.gain.setTargetAtTime(preferences.volumes[bus], this.context.currentTime, 0.015);
        }
        this.notify();
    }
    setJourneyMix(mix:import('../meditation-suite/mix').ListenerMix){if(this.active)this.sessionMixOverride=structuredClone(mix);this.journeys.setMix(mix);}
    load(id: string, expectedSha256?:string): Promise<AudioBuffer | undefined> {
        const cacheKey=expectedSha256?`${id}/${expectedSha256}`:id;
        const existing = this.loads.get(cacheKey);
        if (existing)
            return existing;
        const asset = resolveAsset(id);
        if (!asset || !this.context)
            return Promise.resolve(undefined);
        const context = this.context;
        const loading = (async () => {
            const abort = new AbortController();
            let timeout: ReturnType<typeof setTimeout> | undefined;
            try {
                const buffer = await Promise.race([
                    (async () => {
                        const response = await this.fetcher(assetUrl(asset), { signal: abort.signal });
                        if (!response.ok) throw new Error('Missing file');
                        const bytes=await response.arrayBuffer();
                        if(expectedSha256){const digest=await crypto.subtle.digest('SHA-256',bytes),actual=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');if(actual!==expectedSha256)throw new Error('Audio fingerprint mismatch');}
                        return context.decodeAudioData(bytes);
                    })(),
                    new Promise<never>((_, reject) => { timeout = setTimeout(() => { abort.abort(); reject(new Error('Audio load timed out')); }, 5000); }),
                ]);
                this.decoded.add(id);
                return buffer;
            }
            catch {
                this.failures.add(id);
                this.loads.delete(cacheKey);
                this.notify();
                return undefined;
            }
            finally { if (timeout) clearTimeout(timeout); }
        })();
        this.loads.set(cacheKey, loading);
        return loading;
    }
    beginSession(snapshot: PracticeSnapshot, start: number, sessionId: string) {
        this.practiceResumeNatural=false;
        this.acousticSession=undefined;this.acousticStageId=undefined;this.sessionMixOverride=undefined;
        this.journeySession = snapshot.config.kind === 'meditation-journey' ? sessionId : undefined;
        if(snapshot.config.kind === 'meditation-journey') this.journeys.begin(snapshot.config,start,sessionId);
        else this.journeys.stop();
    }
    async prepareJourney(config?:JourneyConfig) { this.stopNarrationPreview();await this.journeys.prepare(config); }
    async preparePractice(snapshot:PracticeSnapshot){
        const ids=new Set(snapshot.stages.flatMap(stage=>stageCues({sessionId:'prepare',stageId:'prepare',stage,start:0,deadline:stage.durationMs}).filter(c=>cueEnabled(c.id,this.preferences)).map(c=>c.id)));
        await Promise.all([...ids].map(async id=>{const asset=PRACTICE_NARRATION[id];if(asset)await this.load(id,asset.sha256);}));
        if(snapshot.stages.some(s=>!!s.soundRecipe?.acoustic))await this.journeys.prepare(undefined,true);
        if(snapshot.stages.some(s=>s.soundRecipe?.opening==='bowl'||s.soundRecipe?.closing==='bowl'))await this.load('signals.bowl');
    }
    async previewNarration(id:string){
        this.stopNarrationPreview();const generation=this.narrationPreviewGeneration;
        const asset=APPROVED_NARRATION[id];if(!asset||!this.preferences.guidance.generalVoice||!this.preferences.volumes.voice||!this.preferences.volumes.master)return false;
        await this.unlock(false);const buffer=await this.load(asset.assetId,asset.sha256);
        if(!buffer||!this.context||this.context.state!=='running'||generation!==this.narrationPreviewGeneration||Math.abs(buffer.duration-asset.decodedDurationSeconds)>1/buffer.sampleRate)return false;
        const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.buses.voice!);this.narrationPreview=source;
        source.onended=()=>{source.disconnect();if(this.narrationPreview===source)this.narrationPreview=undefined;};source.start();return true;
    }
    stopNarrationPreview(){++this.narrationPreviewGeneration;const source=this.narrationPreview;this.narrationPreview=undefined;if(source){try{source.stop();}catch{/* Already ended. */}source.disconnect();}}
    journeyNaturalBreathing() { this.journeys.breatheNaturally(); }
    captureJourney(seconds=1) { return this.journeys.capture(seconds); }
    enter(scope: StageAudio) {
        if (scope.stage.journeySection) {
            this.stopTracks(); this.signals.stop();
            this.active = {scope,epoch:++this.epoch,started:this.context?.state==='running'};
            this.journeys.play(!!scope.resuming);
            return;
        }
        const acoustic=scope.stage.phase==='meditation'?scope.stage.soundRecipe?.acoustic:undefined;
        if(acoustic){
            if(this.active?.started&&this.active.scope.stageId===scope.stageId)return;
            this.stopTracks();this.active={scope,epoch:++this.epoch,started:this.context?.state==='running'};
            this.signals.begin(scope.sessionId);this.signals.play(scope);
            if(this.acousticStageId!==scope.stageId){this.journeys.beginEnvironment(this.sessionMixOverride?{...acoustic,mix:this.sessionMixOverride}:acoustic,scope.stage.durationMs/1000,scope.start,scope.sessionId);this.acousticStageId=scope.stageId;}
            this.acousticSession=scope.sessionId;this.journeys.play(!!scope.resuming);return;
        }
        if(this.acousticStageId){this.journeys.stop();this.acousticStageId=undefined;this.acousticSession=undefined;}
        this.signals.begin(scope.sessionId);
        if(scope.stage.meditationPolicy==='silent')this.signals.stop(scope.sessionId);
        if (this.active?.started && this.active.scope.sessionId === scope.sessionId && this.active.scope.stageId === scope.stageId) return;
        this.stopTracks(track => !(track.scope.sessionId === scope.sessionId && track.continuesInto === scope.stage.phase && track.scope.deadline === scope.start));
        const epoch = ++this.epoch;
        this.active = { scope, epoch, started: false };
        if (!this.context || this.context.state !== 'running')
            return;
        this.active.started = true;
        this.signals.play(scope);
        if(scope.stage.guidanceProfile)this.schedulePracticeNotes(scope);
        for (const cue of stageCues(scope)) {
            if (!cueEnabled(cue.id, this.preferences)) continue;
            if (scope.resuming && cue.at <= this.clock.now() + 10)
                continue;
            void this.schedule(cue, scope, epoch);
        }
    }
    private current(scope: StageAudio, epoch: number) { return this.active?.epoch === epoch && this.active.scope.stageId === scope.stageId && this.active.scope.sessionId === scope.sessionId; }
    private schedulePracticeNotes(scope:StageAudio){
        const phase=musicalPhase(scope.stage.phase),context=this.context;
        if(!phase||!context||!this.preferences.guidance.breathSounds)return;
        if(scope.resuming)this.practiceResumeNatural=phase!=='inhale'||this.clock.now()-scope.start>100;
        else if(phase==='inhale')this.practiceResumeNatural=false;
        if(this.practiceResumeNatural)return;
        const seconds=scope.stage.durationMs/1000;if(!Number.isInteger(seconds)||seconds<1||seconds>20)return;
        for(let i=0;i<seconds;i++){
            const at=scope.start+i*1000;if(at<this.clock.now()-20||scope.resuming&&at<=this.clock.now()+10)continue;
            const when=Math.max(context.currentTime,this.offset+at/1000),{oscillator,gain}=scheduleSoftNote(context,this.buses.breath!,softNoteHz(phase,i,seconds),when,phase.startsWith('hold'),'felt');
            const track:Track={source:oscillator,gain,scope,cueId:'breath.soft-felt',when,end:when+.86};this.tracks.add(track);oscillator.onended=()=>{this.tracks.delete(track);oscillator.disconnect();gain.disconnect();this.notify();};this.scheduled++;
        }
        this.notify();
    }
    private async schedule(cue: AudioCue, scope: StageAudio, epoch: number) {
        const approved=PRACTICE_NARRATION[cue.id];
        const buffer = await this.load(cue.id,approved?.sha256);
        const context = this.context;
        if (!buffer || !context || context.state !== 'running' || !this.current(scope, epoch) || !cueEnabled(cue.id, this.preferences))
            return;
        const now = this.clock.now();
        // Do not replay overdue cues after loading, suspension, reconciliation, or restart.
        if (now - cue.at > 250 || now >= cue.until) {
            this.skipped++;
            this.notify();
            return;
        }
        const when = Math.max(context.currentTime, this.offset + cue.at / 1000);
        if(approved&&(Math.abs(buffer.duration-approved.durationSeconds)>1/buffer.sampleRate||buffer.duration>(cue.until-Math.max(now,cue.at))/1000-.02)){this.skipped++;this.notify();return;}
        const offset = approved?0:Math.max(0, (now - cue.at) / 1000);
        const duration = approved?buffer.duration:Math.min(buffer.duration - offset, (cue.until - Math.max(now, cue.at)) / 1000);
        if (duration <= 0)
            return;
        try {
            const source = context.createBufferSource();
            source.buffer = buffer;
            source.loop = false;
            const gain = context.createGain();
            source.connect(gain);
            gain.connect(this.buses[cue.breath ? 'breath' : 'voice']!);
            const fade = Math.min(cue.breath ? 0.06 : 0.015, duration / 2);
            gain.gain.setValueAtTime(0, when);
            gain.gain.linearRampToValueAtTime(1, when + Math.min(0.02, fade));
            gain.gain.setValueAtTime(1, when + duration - fade);
            gain.gain.linearRampToValueAtTime(0, when + duration);
            const track: Track = { source, gain, scope, continuesInto: cue.continuesInto, cueId: cue.id, when, end: when + duration };
            this.tracks.add(track);
            source.onended = () => { this.tracks.delete(track); source.disconnect(); gain.disconnect(); this.notify(); };
            source.start(when, offset, duration);
            source.stop(when + duration);
            this.scheduled++;
            this.notify();
        }
        catch {
            this.failures.add(cue.id);
            this.notify();
        }
    }
    private stopTracks(shouldStop: (track: Track) => boolean = () => true) {
        const context = this.context;
        for (const track of this.tracks) {
            if (!shouldStop(track))
                continue;
            try {
                if (context) {
                    track.gain.gain.cancelScheduledValues(context.currentTime);
                    track.gain.gain.setValueAtTime(0, context.currentTime);
                }
                // Immediate gain zero also suppresses sources scheduled to start in the future.
                track.source.stop();
            }
            catch { /* Already ended. */ }
            track.source.disconnect();
            track.gain.disconnect();
            this.tracks.delete(track);
        }
    }
    cancelStage(stageId: string) {
        this.signals.cancelStage(stageId);
        if(this.acousticStageId===stageId)this.journeys.suspend(true);
        if (this.active?.scope.stageId !== stageId)
            return;
        this.epoch++;
        this.active = undefined;
        this.stopTracks(track => !(track.scope.stageId === stageId && track.continuesInto));
        this.notify();
    }
    cancelSession(sessionId: string) {
        if(this.journeySession===sessionId||this.acousticSession===sessionId)this.journeys.suspend();
        this.signals.stop(sessionId);
        if (this.active?.scope.sessionId === sessionId) {
            this.epoch++;
            this.active = undefined;
        }
        this.stopTracks(track => track.scope.sessionId === sessionId);
        this.notify();
    }
    /** Visibility or audio suspension changes the clock mapping; engine truth does not pause. */
    resynchronize() { this.mapClock(); }
    completeStage(scope: StageAudio) { this.signals.play(scope,true); }
    finishSession(sessionId: string, outcome: 'completed' | 'cancelled') {
        if(this.journeySession===sessionId||this.acousticSession===sessionId)this.journeys.stop(outcome==='cancelled');
        this.acousticSession=undefined;this.acousticStageId=undefined;this.sessionMixOverride=undefined;
        this.signals.stop(sessionId,outcome === 'completed');
        if (this.active?.scope.sessionId === sessionId) { ++this.epoch; this.active = undefined; }
        this.stopTracks(track=>track.scope.sessionId === sessionId); this.notify();
    }
    startReady() { return this.context?.state==='running'&&(this.decoded.has('signals.bowl')||this.failures.has('signals.bowl'))&&(!this.preferences.guidance.generalVoice || this.decoded.has('voice.prepare') || this.failures.has('voice.prepare')); }
    async readyForStart() { await Promise.all([this.preferences.guidance.generalVoice?this.load('voice.prepare'):undefined,this.load('signals.bowl')]); }
    async previewSignal(recipe:import('../meditation/environment').SoundRecipe) {
        const now=this.clock.now();this.signals.begin('preview');
        this.signals.play({sessionId:'preview',stageId:'preview/'+now,start:now,deadline:now+15000,stage:{phase:'meditation',label:'Preview',durationMs:15000,round:0,totalRounds:0,cycle:0,totalCycles:0,soundRecipe:{...recipe,opening:recipe.closing!=='off'?recipe.closing:recipe.opening}}});
    }
    stopSignalPreview(){this.signals.stop('preview');}
    async previewAcoustic(selection:AcousticSelection,valid=()=>true){await this.journeys.prepare(undefined,true);if(!valid())return;this.journeys.beginEnvironment(selection,180,this.clock.now(),'preview-acoustic');this.acousticSession='preview-acoustic';this.journeys.play();}
    stopAcousticPreview(){if(this.acousticSession==='preview-acoustic'){this.journeys.stop(true);this.acousticSession=undefined;this.acousticStageId=undefined;}}
    debugState() { return { epoch: this.epoch, context: this.context?.state, generalVoice: this.preferences.guidance.generalVoice, active: this.active ? { ...this.active, scope: { ...this.active.scope } } : null, decoded: [...this.decoded], tracks: [...this.tracks].map(t => ({ cueId: t.cueId, sessionId: t.scope.sessionId, stageId: t.scope.stageId, when: t.when, end: t.end })), now: this.clock.now(), audioNow: this.context?.currentTime }; }
    voiceActive() { if (!this.preferences.volumes.master || !this.preferences.volumes.voice) return false; if(this.journeys.voiceActive())return true; const now = this.context?.currentTime ?? -1; return [...this.tracks].some(track => guidanceCategory(track.cueId) !== 'breath-sound' && now >= track.when && now < track.end); }
}
