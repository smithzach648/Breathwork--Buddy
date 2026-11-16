import workletUrl from '../audio/acoustic/suite-worklet.ts?worker&url';
import type { AudioEnvironmentPort } from '../audio/meditation-signals';
import type { Clock } from '../session/clock';
import type { JourneyConfig } from './model';
import { JOURNEY_AUDIO_ASSETS, nextInhale, timeline } from './model';
import { journeyNotes, bowlTimes } from './tones';
import { NARRATION_MANIFEST, narrationFits, type NarrationAsset } from './narration';

type Track = { source: OscillatorNode | AudioBufferSourceNode; gain: GainNode; kind: 'note' | 'bowl' | 'voice'; at: number; end: number; when:number };
export class JourneyAudio {
  private config?: JourneyConfig;
  private start = 0;
  private session?: string;
  private generation = 0;
  private node?: AudioWorkletNode;
  private buses?: { environment: GainNode; duck: GainNode; notes: GainNode; bowl: GainNode; voice: GainNode };
  private tracks = new Set<Track>();
  private soundedBowls = new Set<number>();
  private ready?: Promise<void>;
  private wave?: Float32Array;
  private bowl?: AudioBuffer;
  private voices = new Map<string, AudioBuffer>();
  private workletReady = false;
  private notesScheduled = 0;
  private bowlsScheduled = 0;
  private natural = false;
  private resumeNaturalUntil = 0;
  private active = false;
  private retirement: Promise<void> = Promise.resolve();
  private error = '';
  private capturePending?: { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
  constructor(private clock: Clock, private port: () => AudioEnvironmentPort | undefined, private load: (id: string) => Promise<AudioBuffer | undefined>, private changed: () => void, private makeNode = (context: AudioContext, options: AudioWorkletNodeOptions) => new AudioWorkletNode(context, 'meditation-suite-v1', options)) {}
  async prepare() {
    await this.retirement;
    if (this.ready) return this.ready;
    const context = this.port()?.context;
    if (!context || context.state !== 'running') return;
    this.error = '';
    this.ready = (async () => {
      try {
        if (!context.audioWorklet || ![44100, 48000].includes(context.sampleRate)) throw new Error('The continuous environment is unavailable on this device. Text and breathing tones still work.');
        await Promise.all([
          this.workletReady ? undefined : context.audioWorklet.addModule(workletUrl).then(() => { this.workletReady = true; }),
          this.wave ? undefined : new Promise<void>((resolve, reject) => {
            const worker = new Worker(new URL('../audio/acoustic/prepare-worker.ts', import.meta.url), { type: 'module' });
            const timer = setTimeout(() => { worker.terminate(); reject(new Error('Sound preparation took too long. Text and breathing tones still work.')); }, 15000);
            const finish = () => { clearTimeout(timer); worker.terminate(); };
            worker.onerror = () => { finish(); reject(new Error('The continuous environment could not be prepared. Text and tones still work.')); };
            worker.onmessage = event => { finish(); if (event.data.wave instanceof Float32Array) { this.wave = event.data.wave; resolve(); } else reject(new Error('Sound preparation failed. Text and tones still work.')); };
            worker.postMessage({ sampleRate: context.sampleRate, seed: 104729 });
          }),
          this.load(JOURNEY_AUDIO_ASSETS.bowl).then(buffer => { this.bowl = buffer; }),
          ...Object.values(NARRATION_MANIFEST.assets).map(async raw => { const asset = raw as NarrationAsset; if (asset.assetId) { const buffer = await this.load(asset.assetId); if (buffer) this.voices.set(asset.id, buffer); } }),
        ]);
      } catch (error) { this.error = error instanceof Error ? error.message : 'The environment is unavailable. Text and tones still work.'; }
      finally { this.ready = undefined; this.changed(); }
    })();
    return this.ready;
  }
  begin(config: JourneyConfig, start: number, session: string) {
    this.stop(); this.config = structuredClone(config); this.start = start; this.session = session;
    this.soundedBowls.clear();
    this.natural = false; this.notesScheduled = this.bowlsScheduled = 0; this.resumeNaturalUntil = 0;
  }
  play(resuming = false) {
    const config = this.config, port = this.port();
    if (!config || !port || port.context.state !== 'running' || this.active) return;
    const { context, input } = port, elapsed = Math.max(0, (this.clock.now() - this.start) / 1000);
    if (elapsed >= config.sound.timeline.durationSeconds) return;
    const token = ++this.generation, origin = context.currentTime - elapsed;
    this.active = true;
    if (resuming && elapsed >= 90 && elapsed < 270) this.resumeNaturalUntil = nextInhale(config, elapsed + .05);
    const environment = context.createGain(), duck = context.createGain(), notes = context.createGain(), bowl = context.createGain(), voice = context.createGain();
    environment.gain.value = config.levels.environment; notes.gain.value = config.levels.breathingTones; bowl.gain.value = config.levels.bowl; voice.gain.value = config.levels.voice;
    environment.connect(duck); duck.connect(input); notes.connect(input); bowl.connect(input); voice.connect(input);
    this.buses = { environment, duck, notes, bowl, voice };
    if (this.wave && this.workletReady) {
      try {
        const node = this.makeNode(context, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', processorOptions: { program: config.sound, wave: this.wave, origin } });
        this.node = node; node.connect(environment);
        node.port.onmessage = event => {
          if (event.data.capture && this.capturePending) { const pending = this.capturePending; this.capturePending = undefined; clearTimeout(pending.timer); pending.resolve({ ...event.data, sampleRate: context.sampleRate }); }
          if (event.data.ended) { node.disconnect(); node.port.close(); if (this.node === node) this.node = undefined; this.changed(); }
        };
        node.onprocessorerror = () => { if (token !== this.generation) return; node.disconnect(); node.port.close(); this.node = undefined; this.error = 'The sound environment stopped. Text and breathing tones continue; you can Stop at any time.'; this.changed(); };
      } catch { this.error = 'The continuous sound is unavailable. Text and breathing tones remain available.'; }
    }
    for (const event of journeyNotes(config)) {
      if (this.natural || event.at < this.resumeNaturalUntil || event.at < elapsed - .02) continue;
      const oscillator = context.createOscillator(), gain = context.createGain(), when = Math.max(context.currentTime, origin + event.at);
      oscillator.type = event.phase.startsWith('hold') ? 'sine' : 'triangle'; oscillator.frequency.setValueAtTime(event.hz, when);
      oscillator.connect(gain); gain.connect(notes);
      this.envelope(gain, when, event.duration, event.phase.startsWith('hold') ? .075 : .12);
      this.track(oscillator, gain, 'note', event.at, event.at + event.duration, when);
      oscillator.start(when); oscillator.stop(when + event.duration); this.notesScheduled++;
    }
    for (const at of bowlTimes(config)) {
      if (!this.bowl || this.soundedBowls.has(at) || at < elapsed) continue;
      this.buffer(this.bowl, bowl, 'bowl', at, origin, 8); this.bowlsScheduled++;
    }
    // Empty asset IDs are intentional: text remains fully functional with no generation service.
    for (const { stage, start, end } of timeline(config)) {
      const section = stage.journeySection!;
      const asset = NARRATION_MANIFEST.assets[section] as NarrationAsset, buffer = this.voices.get(asset.id);
      if (!buffer || config.guidance === 'familiar' && !['ecb', 'entry', 'return'].includes(section)) continue;
      if (section === 'breathwork') continue; // Version 1 reserves no spoken intro; never talk over paced cycles.
      const bowlAt = bowlTimes(config).includes(start) ? start : undefined;
      const at = start + (bowlAt === undefined ? 0 : 16);
      if (at < elapsed || !narrationFits({ ...asset, decodedDurationSeconds: buffer.duration }, { start: at, end }, bowlAt)) continue;
      this.buffer(buffer, voice, 'voice', at, origin, 1);
      duck.gain.setTargetAtTime(.65, origin + at, .08); duck.gain.setTargetAtTime(1, origin + at + buffer.duration, .2);
    }
    this.changed();
  }
  private envelope(gain: GainNode, at: number, seconds: number, level: number) {
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(level, at + Math.min(.025, seconds / 3));
    gain.gain.setValueAtTime(level, at + seconds - Math.min(.18, seconds / 3)); gain.gain.linearRampToValueAtTime(0, at + seconds);
  }
  private track(source: Track['source'], gain: GainNode, kind: Track['kind'], at: number, end: number, when:number) {
    const track = { source, gain, kind, at, end, when }; this.tracks.add(track);
    source.onended = () => { this.tracks.delete(track); source.disconnect(); gain.disconnect(); };
  }
  private buffer(buffer: AudioBuffer, bus: GainNode, kind: 'bowl' | 'voice', at: number, origin: number, level: number) {
    const context = this.port()!.context, when = Math.max(context.currentTime, origin + at), source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer; source.connect(gain); gain.connect(bus); this.envelope(gain, when, buffer.duration, level);
    this.track(source, gain, kind, at, at + buffer.duration, when); source.start(when); source.stop(when + buffer.duration);
  }
  breatheNaturally() { this.natural = true; this.clearTracks(track => track.kind === 'note'); this.changed(); }
  private clearTracks(predicate: (track: Track) => boolean = () => true) {
    for (const track of [...this.tracks]) if (predicate(track)) {
      const context = this.port()?.context;
      if (context) { track.gain.gain.cancelScheduledValues(context.currentTime); track.gain.gain.setValueAtTime(0, context.currentTime); }
      try { track.source.stop(); } catch { /* Already ended. */ }
      track.source.disconnect(); track.gain.disconnect(); this.tracks.delete(track);
    }
  }
  suspend(smooth = false) {
    ++this.generation; this.active = false;
    const context=this.port()?.context,node=this.node,buses=this.buses,tracks=[...this.tracks];
    for(const track of tracks)if(track.kind==='bowl'&&context&&context.currentTime>=track.when)this.soundedBowls.add(track.at);
    this.node=undefined;this.buses=undefined;
    const dispose=()=>{for(const track of tracks){try{track.source.stop();}catch{/* Already ended. */}track.source.disconnect();track.gain.disconnect();}node?.disconnect();node?.port.close();if(buses)Object.values(buses).forEach(bus=>bus.disconnect());};
    if(smooth&&context?.state==='running'&&(node||tracks.length)){
      for(const gain of [buses?.environment,...tracks.map(t=>t.gain)])if(gain){const p=gain.gain;if(p.cancelAndHoldAtTime)p.cancelAndHoldAtTime(context.currentTime);else{p.cancelScheduledValues(context.currentTime);p.setValueAtTime(p.value,context.currentTime);}p.linearRampToValueAtTime(0,context.currentTime+.05);}
      for(const track of tracks)try{track.source.stop(context.currentTime+.05);}catch{/* Already ended. */}
      node?.port.postMessage('stop');this.tracks.clear();
      this.retirement=new Promise<void>(resolve=>setTimeout(()=>{dispose();resolve();},80));
    }else{this.clearTracks();dispose();}
    if (this.capturePending) { clearTimeout(this.capturePending.timer); this.capturePending.reject(new Error('Capture cancelled')); this.capturePending = undefined; }
    this.changed();
  }
  stop(smooth = false) { this.suspend(smooth); this.config = undefined; this.session = undefined; }
  capture(seconds = 1) {
    return new Promise<unknown>((resolve, reject) => {
      const context = this.port()?.context;
      if (!this.node || !context || this.capturePending || seconds <= 0 || seconds > 2) { reject(new Error('Capture needs a playing journey and 0–2 seconds.')); return; }
      const timer = setTimeout(() => { this.capturePending = undefined; reject(new Error('Capture timed out')); }, 5000);
      this.capturePending = { resolve, reject, timer }; this.node.port.postMessage({ captureFrames: Math.round(context.sampleRate * seconds) });
    });
  }
  voiceActive() { const elapsed = (this.clock.now() - this.start) / 1000; return [...this.tracks].some(t => t.kind === 'voice' && elapsed >= t.at && elapsed < t.end); }
  diagnostics() { return { active: this.active, environmentGraphs: this.node ? 1 : 0, activeTracks: this.tracks.size, notesScheduled: this.notesScheduled, bowlsScheduled: this.bowlsScheduled, naturalBreathing: this.natural, naturalUntilSeconds: this.resumeNaturalUntil, sourceBytes: this.wave?.byteLength ?? 0, error: this.error, session: this.session }; }
}
