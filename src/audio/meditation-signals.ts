import type { StageAudio } from '../session/audio-port';
import type { Clock } from '../session/clock';
import type { Preferences } from '../settings/preferences';
export interface AudioEnvironmentPort { context: AudioContext; input: AudioNode; mediaInput?: AudioNode }
/** Short synthetic chimes, scoped separately from speech; never own an exercise deadline. */
export class MeditationSignals {
    private tracks = new Set<{ sessionId: string; stageId: string; ending: boolean; oscillator: OscillatorNode; gain: GainNode }>();
    private played = new Set<string>();
    private preferences: Preferences;
    private session?: string;
    constructor(private clock: Clock, private port: () => AudioEnvironmentPort | undefined, preferences: Preferences) { this.preferences = preferences; }
    setPreferences(p: Preferences) { this.preferences = p; for (const track of [...this.tracks]) if (!(track.ending ? p.meditation.completionSignal : p.meditation.openingSignal) || !p.volumes.master || !p.volumes.signals) this.remove(track); }
    begin(sessionId: string) { if (this.session !== sessionId) { this.stop(); this.played.clear(); this.session = sessionId; } }
    play(scope: StageAudio, ending = false) {
        if (scope.stage.phase !== 'meditation' || scope.stage.meditationPolicy === 'silent' || scope.resuming) return;
        const at = ending ? scope.deadline : scope.start;
        if (this.clock.now() - at > 250 || this.clock.now() < at) return;
        const p = this.preferences;
        if (!(ending ? p.meditation.completionSignal : p.meditation.openingSignal) || !p.volumes.signals || !p.volumes.master) return;
        const port = this.port(); if (!port || port.context.state !== 'running' || !port.context.createOscillator) return;
        this.begin(scope.sessionId);
        const key = `${scope.stageId}/${ending ? 'end' : 'open'}`; if (this.played.has(key)) return; this.played.add(key);
        const { context, input } = port, now = context.currentTime;
        for (const frequency of [432,648]) {
            const oscillator = context.createOscillator(), gain = context.createGain(); oscillator.type = 'sine'; oscillator.frequency.value = frequency;
            oscillator.connect(gain); gain.connect(input);
            gain.gain.setValueAtTime(0,now); gain.gain.linearRampToValueAtTime(.045 * p.volumes.signals,now+.08); gain.gain.exponentialRampToValueAtTime(.0001,now+1.15); gain.gain.linearRampToValueAtTime(0,now+1.2);
            const track = { sessionId: scope.sessionId, stageId: scope.stageId, ending, oscillator, gain }; this.tracks.add(track);
            oscillator.onended = () => { this.tracks.delete(track); oscillator.disconnect(); gain.disconnect(); };
            oscillator.start(now); oscillator.stop(now+1.2);
        }
    }
    private remove(track: { oscillator: OscillatorNode; gain: GainNode }) { const context = this.port()?.context; if (context) { track.gain.gain.cancelScheduledValues(context.currentTime); track.gain.gain.setValueAtTime(0,context.currentTime); } try { track.oscillator.stop(); } catch { /* already ended */ } track.oscillator.disconnect(); track.gain.disconnect(); this.tracks.delete(track as never); }
    cancelStage(id: string) { for (const track of [...this.tracks]) if (track.stageId === id && !track.ending) this.remove(track); }
    stop(sessionId?: string, preserveEnding = false) { for (const track of [...this.tracks]) if ((!sessionId || track.sessionId === sessionId) && !(preserveEnding && track.ending)) this.remove(track); }
    diagnostics() { return { activeNodes: this.tracks.size, signalEvents: this.played.size }; }
}
