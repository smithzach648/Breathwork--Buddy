import { BrowserTiming, type Clock, type Scheduler } from './clock';
import { createSnapshot, type PracticeConfig } from './config';
import { DeterministicSessionEngine, type SessionState } from './engine';
import { BrowserAudio, type AudioDiagnostics } from '../audio/web-audio';
import { defaultPreferences, type Preferences } from '../settings/preferences';
import { saveSessionResult } from '../storage/repositories';
import { WakeLockController } from './wake-lock';
import type { SessionResult } from '../types/domain';
import type { SessionAudio } from './audio-port';
import { BackgroundController } from '../media/background';
export interface RuntimeAudio extends SessionAudio {
    unlock(): Promise<void>;
    setPreferences(p: Preferences): void;
    resynchronize(): void;
    diagnostics(): AudioDiagnostics;
    subscribe(listener: () => void): () => void;
    voiceActive?(): boolean;
    startReady?(): boolean;
    readyForStart?(): Promise<void>;
}
export interface RuntimeState {
    session: SessionState;
    audio: AudioDiagnostics;
    saveError: string;
    saving: boolean;
    historyVersion: number;
    starting: boolean;
}
export function canActivateUpdate(status: SessionState['status']) { return status !== 'running'; }
export class PracticeRuntime {
    readonly engine: DeterministicSessionEngine;
    private listeners = new Set<() => void>();
    private seen = new Set<string>();
    private pending = new Set<string>();
    private unsaved = new Map<string, SessionResult>();
    private state: RuntimeState;
    private startGeneration = 0;
    constructor(clock: Clock, scheduler: Scheduler, readonly audio: RuntimeAudio, private wake: WakeLockController, private persist: (result: SessionResult) => Promise<unknown> = saveSessionResult, readonly background?: BackgroundController) {
        this.engine = new DeterministicSessionEngine(clock, scheduler, audio);
        this.state = { session: this.engine.getState(), audio: audio.diagnostics(), saveError: '', saving: false, historyVersion: 0, starting: false };
        this.engine.subscribe(() => {
            const session = this.engine.getState();
            this.wake.setSession(session.status === 'running' ? session.sessionId! : null);
            this.publish();
            if (session.result && !this.seen.has(session.result.id))
                void this.save(session.result);
        });
        audio.subscribe(() => this.publish());
    }
    getState = () => this.state;
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    private media(action: () => void) { try { action(); } catch { /* Long-media presentation can never interrupt session truth. */ } }
    private publish() { const session = this.engine.getState(); this.media(() => { this.background?.sync(session); this.background?.setDucking(this.audio.voiceActive?.() || false); }); this.state = { ...this.state, session, audio: this.audio.diagnostics(), saving: this.pending.size > 0 }; this.listeners.forEach(listener => listener()); }
    start(config: PracticeConfig) {
        if (this.state.starting || this.engine.getState().status === 'running') throw new Error('Finish or stop the current practice first.');
        const snapshot = createSnapshot(config);
        const generation = ++this.startGeneration;
        const ready = !this.audio.startReady || this.audio.startReady();
        const unlocking = this.audio.unlock();
        if (ready) { this.engine.start(snapshot); return; }
        this.state = { ...this.state, starting: true }; this.publish();
        return (async () => {
            try {
                await unlocking;
                await this.audio.readyForStart?.();
                if (generation !== this.startGeneration) return;
                this.engine.start(createSnapshot(snapshot.config));
            } finally { if (generation === this.startGeneration) { this.state = { ...this.state, starting: false }; this.publish(); } }
        })();
    }
    cancelStart() { ++this.startGeneration; this.state = { ...this.state, starting: false }; this.publish(); }
    preferencesChanged(p: Preferences) { this.audio.setPreferences(p); this.media(() => this.background?.setPreferences(p)); }
    visibilityChanged(visible: boolean) { if (!visible && this.state.starting) this.cancelStart(); this.audio.resynchronize(); this.engine.setVisible(visible); this.media(() => this.background?.visibilityChanged(visible)); this.wake.visibilityChanged(); }
    private async save(result: SessionResult) {
        if (this.pending.has(result.id))
            return;
        this.seen.add(result.id);
        this.pending.add(result.id);
        this.publish();
        try {
            await this.persist(structuredClone(result));
            this.unsaved.delete(result.id);
            this.state = { ...this.state, historyVersion: this.state.historyVersion + 1, saveError: this.unsaved.size ? 'Some session results could not be saved.' : '' };
        }
        catch {
            this.unsaved.set(result.id, result);
            this.state = { ...this.state, saveError: 'Your session result could not be saved on this device.' };
        }
        finally {
            this.pending.delete(result.id);
            this.publish();
        }
    }
    retrySaving() { for (const result of this.unsaved.values())
        void this.save(result); }
}
export function createBrowserRuntime() {
    const timing = new BrowserTiming();
    const audio = new BrowserAudio(timing, defaultPreferences());
    const wake = new WakeLockController(typeof navigator !== 'undefined' && 'wakeLock' in navigator ? () => navigator.wakeLock.request('screen') : undefined, () => document.visibilityState === 'visible');
    return new PracticeRuntime(timing, timing, audio, wake, saveSessionResult, new BackgroundController());
}
