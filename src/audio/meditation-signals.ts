import type { StageAudio } from '../session/audio-port';
import type { Clock } from '../session/clock';
import type { Preferences } from '../settings/preferences';
export interface AudioEnvironmentPort { context: AudioContext; input: AudioNode; mediaInput?: AudioNode }
/** Recorded bowls and legacy chimes share one cancellable, bounded signal lifetime. */
export class MeditationSignals {
    private tracks = new Set<{ sessionId: string; stageId: string; ending: boolean; frozen?:boolean; oscillator: OscillatorNode | AudioBufferSourceNode; gain: GainNode }>();
    private played = new Set<string>();
    private preferences: Preferences;
    private session?: string;
    private generation=0;
    private liveLevel?:number;
    private cancelled=new Set<string>();
    constructor(private clock: Clock, private port: () => AudioEnvironmentPort | undefined, preferences: Preferences, private bowl?:()=>Promise<AudioBuffer|undefined>) { this.preferences = structuredClone(preferences); }
    setPreferences(p: Preferences) { if(this.session&&p.volumes.signals!==this.preferences.volumes.signals)this.liveLevel=p.volumes.signals;this.preferences = structuredClone(p); for (const track of [...this.tracks]) if (!p.volumes.master || this.liveLevel===0 || !track.frozen&&(!(track.ending ? p.meditation.completionSignal : p.meditation.openingSignal) || !p.volumes.signals)) this.remove(track); }
    begin(sessionId: string) { if (this.session !== sessionId) { this.stop(); this.played.clear();this.cancelled.clear();this.liveLevel=undefined; this.session = sessionId; } }
    play(scope: StageAudio, ending = false) {
        if (scope.stage.phase !== 'meditation' || scope.stage.meditationPolicy === 'silent' || scope.resuming) return;
        const at = ending ? scope.deadline : scope.start;
        if (this.clock.now() - at > 250 || this.clock.now() < at) return;
        const p = this.preferences;
        const recipe=scope.stage.soundRecipe;
        const kind=recipe ? ending?recipe.closing:recipe.opening : (ending?p.meditation.completionSignal:p.meditation.openingSignal)?p.meditation.signalKind||'legacy':'off';
        const level=this.liveLevel??recipe?.signalLevel??p.meditation.signalLevel??p.volumes.signals;
        if (kind==='off' || !level || !p.volumes.master) return;
        const port = this.port(); if (!port || port.context.state !== 'running' || !port.context.createOscillator) return;
        this.begin(scope.sessionId);
        const key = `${scope.stageId}/${ending ? 'end' : 'open'}`; if (this.played.has(key)) return; this.played.add(key);
        for(const track of [...this.tracks])this.remove(track);
        if(kind==='bowl'){
            const generation=this.generation;
            void this.bowl?.().then(buffer=>{
                if(!buffer||generation!==this.generation||this.session!==scope.sessionId||!ending&&this.cancelled.has(scope.stageId)||port.context.state!=='running'||this.clock.now()-at>250)return;
                const {context,input}=port,now=context.currentTime,source=context.createBufferSource(),gain=context.createGain();
                source.buffer=buffer;source.connect(gain);gain.connect(input);
                // Original peak is .01523. Fixed bounded playback gain preserves recorded dynamics.
                const amplitude=8*level;
                gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(amplitude,now+.008);
                gain.gain.setValueAtTime(amplitude,now+Math.max(.008,buffer.duration-.025));gain.gain.linearRampToValueAtTime(0,now+buffer.duration);
                const track={sessionId:scope.sessionId,stageId:scope.stageId,ending,frozen:!!recipe,oscillator:source,gain};this.tracks.add(track);
                source.onended=()=>{this.tracks.delete(track);source.disconnect();gain.disconnect();};source.start(now);source.stop(now+buffer.duration);
            }).catch(()=>{/* Device interruption cannot change session timing. */});return;
        }
        const { context, input } = port, now = context.currentTime;
        for (const frequency of [432,648]) {
            const oscillator = context.createOscillator(), gain = context.createGain(); oscillator.type = 'sine'; oscillator.frequency.value = frequency;
            oscillator.connect(gain); gain.connect(input);
            gain.gain.setValueAtTime(0,now); gain.gain.linearRampToValueAtTime(.045 * level,now+.08); gain.gain.exponentialRampToValueAtTime(.0001,now+1.15); gain.gain.linearRampToValueAtTime(0,now+1.2);
            const track = { sessionId: scope.sessionId, stageId: scope.stageId, ending, frozen:!!recipe, oscillator, gain }; this.tracks.add(track);
            oscillator.onended = () => { this.tracks.delete(track); oscillator.disconnect(); gain.disconnect(); };
            oscillator.start(now); oscillator.stop(now+1.2);
        }
    }
    private remove(track: { oscillator: OscillatorNode | AudioBufferSourceNode; gain: GainNode }) { const context = this.port()?.context; if (context) { track.gain.gain.cancelScheduledValues(context.currentTime); track.gain.gain.setValueAtTime(0,context.currentTime); } try { track.oscillator.stop(); } catch { /* already ended */ } track.oscillator.disconnect(); track.gain.disconnect(); this.tracks.delete(track as never); }
    cancelStage(id: string) { this.cancelled.add(id);for (const track of [...this.tracks]) if (track.stageId === id && !track.ending) this.remove(track); }
    stop(sessionId?: string, preserveEnding = false) { if(!preserveEnding&&(!sessionId||sessionId===this.session))++this.generation;for (const track of [...this.tracks]) if ((!sessionId || track.sessionId === sessionId) && !(preserveEnding && track.ending)) this.remove(track); }
    diagnostics() { return { activeNodes: this.tracks.size, signalEvents: this.played.size }; }
}
