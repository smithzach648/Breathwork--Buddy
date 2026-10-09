import type { Clock } from '../session/clock';
import type { StageAudio, SessionAudio } from '../session/audio-port';
import type { Preferences } from '../settings/preferences';
import { assetUrl, resolveAsset, audioCatalog, type AudioBus } from './catalog';
import { stageCues, type AudioCue } from './cues';
import { cueEnabled, guidanceCategory } from './guidance';
import { MeditationSignals, type AudioEnvironmentPort } from './meditation-signals';
import { createOutput } from './output';
interface Track {
    source: AudioBufferSourceNode;
    gain: GainNode;
    scope: StageAudio;
    continuesInto?: AudioCue['continuesInto'];
    cueId: string;
    when: number;
    end: number;
}
export interface AudioDiagnostics {
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
    private mediaInput?: AudioNode;
    constructor(private clock: Clock, private preferences: Preferences, private createContext = () => new AudioContext(), private fetcher: typeof fetch = (...args) => fetch(...args)) { this.signals = new MeditationSignals(clock,()=>this.environmentPort(),preferences); }
    /** Independent stereo-capable buses connect before this shared Master gain. */
    environmentPort(): AudioEnvironmentPort | undefined { return this.context && this.buses.master ? { context: this.context, input: this.buses.master, mediaInput: this.mediaInput } : undefined; }
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    private notify() { this.listeners.forEach(listener => listener()); }
    diagnostics(): AudioDiagnostics { return { scheduled: this.scheduled, skipped: this.skipped, failures: [...this.failures], playing: this.tracks.size, state: this.context?.state || 'not initialized' }; }
    /** Call directly in a user gesture; readiness is resolved before the session clock starts. */
    async unlock() {
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
                    else { this.stopTracks(); this.signals.stop(); if (this.active) this.active = { ...this.active, epoch: ++this.epoch, started: false }; }
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
            void Promise.all(audioCatalog.filter(a => a.category === 'voice' || a.category === 'breath').map(a => this.load(a.id)));
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
        this.preferences = structuredClone(preferences);
        this.signals.setPreferences(this.preferences);
        this.stopTracks(track => !cueEnabled(track.cueId, preferences));
        for (const bus of ['master', 'voice', 'breath'] as const) {
            const node = this.buses[bus];
            if (node && this.context)
                node.gain.setTargetAtTime(preferences.volumes[bus], this.context.currentTime, 0.015);
        }
        this.notify();
    }
    load(id: string): Promise<AudioBuffer | undefined> {
        const existing = this.loads.get(id);
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
                        return context.decodeAudioData(await response.arrayBuffer());
                    })(),
                    new Promise<never>((_, reject) => { timeout = setTimeout(() => { abort.abort(); reject(new Error('Audio load timed out')); }, 5000); }),
                ]);
                this.decoded.add(id);
                return buffer;
            }
            catch {
                this.failures.add(id);
                this.loads.delete(id);
                this.notify();
                return undefined;
            }
            finally { if (timeout) clearTimeout(timeout); }
        })();
        this.loads.set(id, loading);
        return loading;
    }
    enter(scope: StageAudio) {
        this.signals.begin(scope.sessionId);
        if (this.active?.started && this.active.scope.sessionId === scope.sessionId && this.active.scope.stageId === scope.stageId) return;
        this.stopTracks(track => !(track.scope.sessionId === scope.sessionId && track.continuesInto === scope.stage.phase && track.scope.deadline === scope.start));
        const epoch = ++this.epoch;
        this.active = { scope, epoch, started: false };
        if (!this.context || this.context.state !== 'running')
            return;
        this.active.started = true;
        this.signals.play(scope);
        for (const cue of stageCues(scope)) {
            if (!cueEnabled(cue.id, this.preferences)) continue;
            if (scope.resuming && cue.at <= this.clock.now() + 10)
                continue;
            void this.schedule(cue, scope, epoch);
        }
    }
    private current(scope: StageAudio, epoch: number) { return this.active?.epoch === epoch && this.active.scope.stageId === scope.stageId && this.active.scope.sessionId === scope.sessionId; }
    private async schedule(cue: AudioCue, scope: StageAudio, epoch: number) {
        const buffer = await this.load(cue.id);
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
        const offset = Math.max(0, (now - cue.at) / 1000);
        const duration = Math.min(buffer.duration - offset, (cue.until - Math.max(now, cue.at)) / 1000);
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
        if (this.active?.scope.stageId !== stageId)
            return;
        this.epoch++;
        this.active = undefined;
        this.stopTracks(track => !(track.scope.stageId === stageId && track.continuesInto));
        this.notify();
    }
    cancelSession(sessionId: string) {
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
        this.signals.stop(sessionId,outcome === 'completed');
        if (this.active?.scope.sessionId === sessionId) { ++this.epoch; this.active = undefined; }
        this.stopTracks(track=>track.scope.sessionId === sessionId); this.notify();
    }
    startReady() { return !this.preferences.guidance.generalVoice || this.context?.state === 'running' && (this.decoded.has('voice.prepare') || this.failures.has('voice.prepare')); }
    async readyForStart() { if (this.preferences.guidance.generalVoice) await this.load('voice.prepare'); }
    debugState() { return { epoch: this.epoch, context: this.context?.state, generalVoice: this.preferences.guidance.generalVoice, active: this.active ? { ...this.active, scope: { ...this.active.scope } } : null, decoded: [...this.decoded], tracks: [...this.tracks].map(t => ({ cueId: t.cueId, sessionId: t.scope.sessionId, stageId: t.scope.stageId, when: t.when, end: t.end })), now: this.clock.now(), audioNow: this.context?.currentTime }; }
    voiceActive() { if (!this.preferences.volumes.master || !this.preferences.volumes.voice) return false; const now = this.context?.currentTime ?? -1; return [...this.tracks].some(track => guidanceCategory(track.cueId) !== 'breath-sound' && now >= track.when && now < track.end); }
}
