import type { Clock } from '../session/clock';
import type { StageAudio, SessionAudio } from '../session/audio-port';
import type { Preferences } from '../settings/preferences';
import { assetUrl, resolveAsset, audioCatalog, type AudioBus } from './catalog';
import { stageCues, type AudioCue } from './cues';
interface Track {
    source: AudioBufferSourceNode;
    gain: GainNode;
    scope: StageAudio;
    continuesInto?: AudioCue['continuesInto'];
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
    } | undefined;
    private epoch = 0;
    private offset = 0;
    private scheduled = 0;
    private skipped = 0;
    private failures = new Set<string>();
    private listeners = new Set<() => void>();
    constructor(private clock: Clock, private preferences: Preferences, private createContext = () => new AudioContext(), private fetcher: typeof fetch = (...args) => fetch(...args)) { }
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    private notify() { this.listeners.forEach(listener => listener()); }
    diagnostics(): AudioDiagnostics { return { scheduled: this.scheduled, skipped: this.skipped, failures: [...this.failures], playing: this.tracks.size, state: this.context?.state || 'not initialized' }; }
    /** Call directly in a user gesture. Session Start does not wait for downloads or resume. */
    async unlock() {
        try {
            if (!this.context) {
                this.context = this.createContext();
                this.buses.master = this.context.createGain();
                this.buses.master.connect(this.context.destination);
                for (const bus of ['voice', 'breath'] as const) {
                    this.buses[bus] = this.context.createGain();
                    this.buses[bus]!.connect(this.buses.master);
                }
                this.setPreferences(this.preferences);
                this.context.addEventListener('statechange', () => {
                    this.stopTracks();
                    if (this.context?.state === 'running') {
                        this.mapClock();
                        const scope = this.active?.scope;
                        if (scope)
                            this.enter({ ...scope, resuming: this.clock.now() - scope.start > 250 });
                    }
                    this.notify();
                });
            }
            await this.context.resume();
            this.mapClock();
            const scope = this.active?.scope;
            if (scope)
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
        for (const bus of ['master', 'voice', 'breath'] as const) {
            const node = this.buses[bus];
            if (node && this.context)
                node.gain.setTargetAtTime(preferences.volumes[bus], this.context.currentTime, 0.015);
        }
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
            try {
                const response = await this.fetcher(assetUrl(asset));
                if (!response.ok)
                    throw new Error('Missing file');
                return await context.decodeAudioData(await response.arrayBuffer());
            }
            catch {
                this.failures.add(id);
                this.loads.delete(id);
                this.notify();
                return undefined;
            }
        })();
        this.loads.set(id, loading);
        return loading;
    }
    enter(scope: StageAudio) {
        this.stopTracks(track => !(track.scope.sessionId === scope.sessionId && track.continuesInto === scope.stage.phase && track.scope.deadline === scope.start));
        const epoch = ++this.epoch;
        this.active = { scope, epoch };
        if (!this.context || this.context.state !== 'running')
            return;
        for (const cue of stageCues(scope)) {
            if (scope.resuming && cue.at <= this.clock.now() + 10)
                continue;
            void this.schedule(cue, scope, epoch);
        }
    }
    private current(scope: StageAudio, epoch: number) { return this.active?.epoch === epoch && this.active.scope.stageId === scope.stageId && this.active.scope.sessionId === scope.sessionId; }
    private async schedule(cue: AudioCue, scope: StageAudio, epoch: number) {
        const buffer = await this.load(cue.id);
        const context = this.context;
        if (!buffer || !context || context.state !== 'running' || !this.current(scope, epoch))
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
            const track: Track = { source, gain, scope, continuesInto: cue.continuesInto };
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
        if (this.active?.scope.stageId !== stageId)
            return;
        this.epoch++;
        this.active = undefined;
        this.stopTracks(track => !(track.scope.stageId === stageId && track.continuesInto));
        this.notify();
    }
    cancelSession(sessionId: string) {
        if (this.active?.scope.sessionId === sessionId) {
            this.epoch++;
            this.active = undefined;
        }
        this.stopTracks(track => track.scope.sessionId === sessionId);
        this.notify();
    }
    /** Visibility or audio suspension changes the clock mapping; engine truth does not pause. */
    resynchronize() { this.mapClock(); }
}
