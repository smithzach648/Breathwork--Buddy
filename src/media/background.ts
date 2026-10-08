import type { Preferences } from '../settings/preferences';
import { defaultPreferences } from '../settings/preferences';
import type { SessionState } from '../session/engine';
import { mediaLibrary, type MediaLibrary } from './library';
import { BackgroundGain } from './background-gain';

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
    constructor(private library: Pick<MediaLibrary, 'resolve'> = mediaLibrary, createAudio = () => new Audio()) {
        this.audio = createAudio();
        this.audio.preload = 'metadata';
        this.gain = new BackgroundGain(this.audio, () => { if (!this.intent) this.audio.pause(); this.publish(); });
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
    canPlay = () => this.session?.status !== 'running' || this.preferences.background.mode === 'entire' || this.preferences.background.mode === 'retention' && (this.session.snapshot?.config.kind === 'hormesis' || this.session.stage?.blockKind === 'hormesis') && this.session.stage?.phase === 'retention';
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
        this.preferences = structuredClone(preferences);
        this.gain.setBase(preferences.volumes.master * preferences.volumes.ambience, preferences.guidance.ducking);
        this.audio.loop = this.state.preview ? false : preferences.background.loop;
        if (previous.background.source !== preferences.background.source) { void this.select(preferences.background.source); return; }
        if (previous.background.mode !== preferences.background.mode) { this.manualPause = false; this.state = { ...this.state, preview: false }; this.follow(); }
    }
    setDucking(active: boolean) { this.gain.setVoice(active && this.intent && this.visible); }
    sync(session: SessionState) {
        this.session = session;
        const key = `${session.sessionId}:${session.status}:${session.stage?.phase}`;
        if (key === this.sessionKey) return;
        const newSession = session.status === 'running' && (!this.sessionKey.startsWith(`${session.sessionId}:running:`));
        this.sessionKey = key;
        if (newSession) {
            this.manualPause = false; this.ended = false; this.gain.reset(); ++this.playGeneration;
            this.state = { ...this.state, preview: false };
            this.audio.pause(); this.audio.currentTime = 0;
            if (this.state.source !== this.preferences.background.source || !this.url && this.preferences.background.source !== 'none') void this.select(this.preferences.background.source);
        }
        if (session.status === 'cancelled' || session.status === 'idle') { this.stop(); return; }
        this.follow();
    }
    private follow() {
        const s = this.session, mode = this.preferences.background.mode;
        const wanted = !!s && !this.manualPause && !this.ended && (mode === 'entire' && s.status === 'running' || mode === 'retention' && s.status === 'running' && (s.snapshot?.config.kind === 'hormesis' || s.stage?.blockKind === 'hormesis') && s.stage?.phase === 'retention' || mode === 'after' && s.status === 'completed');
        if (wanted) this.play(false); else this.pause(false);
    }
    play(manual = true) {
        if (manual && !this.canPlay()) return;
        if (!this.url || !this.visible) return;
        if (manual) { this.manualPause = false; if (this.ended) this.audio.currentTime = 0; this.ended = false; }
        if (this.intent && !this.audio.paused) return;
        this.intent = true;
        const epoch = this.epoch;
        const playGeneration = ++this.playGeneration;
        void this.audio.play().then(() => {
            if (epoch !== this.epoch || playGeneration !== this.playGeneration) return;
            if (!this.intent || !this.visible) { this.audio.pause(); return; }
            this.state = { ...this.state, error: '' }; this.gain.play(); this.publish();
        }).catch(() => { if (epoch === this.epoch && playGeneration === this.playGeneration) { this.intent = false; this.state = { ...this.state, error: 'Tap Play background to allow audio on this device. Practice continues normally.' }; this.publish(); } });
    }
    pause(manual = true) { if (manual) this.manualPause = true; if (!this.intent) return; this.intent = false; ++this.playGeneration; if (!this.audio.paused) this.gain.pause(); }
    stop() { ++this.epoch; ++this.playGeneration; this.intent = false; this.manualPause = true; this.gain.reset(); if (!this.audio.paused) this.audio.pause(); this.audio.currentTime = 0; this.publish(); }
    preview(source: string) { if (this.session?.status === 'running') return; void this.select(source, true); }
    visibilityChanged(visible: boolean) {
        this.visible = visible;
        if (!visible) { ++this.playGeneration; this.gain.reset(); this.audio.pause(); this.publish(); }
        else if (this.state.preview && this.intent) this.play(false); else this.follow();
    }
    removeSource(source: string) { if (this.state.source === source) { ++this.epoch; this.intent = false; this.clearSource(); this.state = { ...this.state, source: 'none', name: '', preview: false }; this.publish(); } }
    dispose() { ++this.epoch; this.intent = false; this.clearSource(); this.listeners.clear(); }
}
