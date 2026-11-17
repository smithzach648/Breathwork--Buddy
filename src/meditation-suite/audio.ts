import workletUrl from '../audio/acoustic/suite-worklet.ts?worker&url';
import type { AudioEnvironmentPort } from '../audio/meditation-signals';
import type { Clock } from '../session/clock';
import type { JourneyConfig } from './model';
import { JOURNEY_AUDIO_ASSETS, layerMix, effectiveMix, nextInhale, sectionWindow } from './model';
import { LAYER_GAIN,validMix,type ListenerMix } from './mix';
import { SHORT_CHIME } from './chime-asset';
import {acousticProgram,type AcousticSelection} from '../meditation/acoustic-scenes';
import type {Journey} from '../audio/acoustic/journey';
import { journeyNotes, bowlTimes } from './tones';
import { APPROVED_NARRATION, narrationPlan, validRecording, type ApprovedNarrationAsset } from './voice-narration';
import { scheduleSoftNote } from './instrument';

type Track = { source: OscillatorNode | AudioBufferSourceNode; gain: GainNode; kind: 'note' | 'bowl' | 'voice'; at: number; end: number; when:number;clipId?:string };
const isBreathIntro=(id:string)=>id.startsWith('suite.breath-')||id.startsWith('suite.breath.intro.');
export class JourneyAudio {
  private config?: JourneyConfig;
  private environment?:{program:Journey;fades:{entrySeconds:number;returnSeconds:number;smoothEntry?:boolean}};
  private liveMix?:ListenerMix;
  private mixChanged=false;
  private start = 0;
  private session?: string;
  private generation = 0;
  private node?: AudioWorkletNode;
  private buses?: { environment: GainNode; duck: GainNode; notes: GainNode; bowl: GainNode; voice: GainNode };
  private tracks = new Set<Track>();
  private soundedBowls = new Set<number>();
  private soundedVoices = new Set<string>();
  private skippedVoices:string[]=[];
  private voiceScale=1;
  private ducking=true;
  private ready?: Promise<void>;
  private wave?: Float32Array;
  private bowl?: AudioBuffer;
  private chime?: AudioBuffer;
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
  constructor(private clock: Clock, private port: () => AudioEnvironmentPort | undefined, private load: (id: string,sha256?:string) => Promise<AudioBuffer | undefined>, private changed: () => void, private makeNode = (context: AudioContext, options: AudioWorkletNodeOptions) => new AudioWorkletNode(context, 'meditation-suite-v1', options), private recordings:Readonly<Record<string,ApprovedNarrationAsset>>=APPROVED_NARRATION) {}
  async prepare(config?:JourneyConfig,environmentOnly=false):Promise<void> {
    await this.retirement;
    if (this.ready) { await this.ready;return this.prepare(config,environmentOnly); }
    const context = this.port()?.context;
    if (!context || context.state !== 'running') return;
    this.error = '';
    this.ready = (async () => {
      try {
        if (!context.audioWorklet || ![44100, 48000].includes(context.sampleRate)) throw new Error('The continuous environment is unavailable on this device. Text and breathing tones still work.');
        const selected=environmentOnly?new Set<string>():config?new Set(narrationPlan(config).map(c=>c.clip.id)):new Set(Object.keys(this.recordings));
        const voiceEnabled=(!config||config.levels.voice>0)&&this.voiceScale>0;
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
          environmentOnly?undefined:this.load(JOURNEY_AUDIO_ASSETS.bowl,config?.schemaVersion===3?config.audioAssets.bowlSha256:undefined).then(buffer => { this.bowl = buffer; }),
          config?.schemaVersion===3?this.load(SHORT_CHIME.assetId,SHORT_CHIME.sha256).then(buffer=>{if(buffer&&Math.abs(buffer.duration-SHORT_CHIME.durationSeconds)<=1/buffer.sampleRate)this.chime=buffer;}):undefined,
          ...Object.values(this.recordings).filter(asset=>voiceEnabled&&selected.has(asset.id)).map(async asset => { if(asset.approved!==true)return;const buffer=await this.load(asset.assetId,asset.sha256);if(buffer&&Math.abs(buffer.duration-asset.decodedDurationSeconds)<=1/buffer.sampleRate)this.voices.set(asset.id,buffer); }),
        ]);
      } catch (error) { this.error = error instanceof Error ? error.message : 'The environment is unavailable. Text and tones still work.'; }
      finally { this.ready = undefined; this.changed(); }
    })();
    return this.ready;
  }
  begin(config: JourneyConfig, start: number, session: string) {
    this.stop(); this.config = structuredClone(config); this.start = start; this.session = session;
    this.liveMix=effectiveMix(config);this.mixChanged=false;
    this.soundedBowls.clear();
    this.soundedVoices.clear();this.skippedVoices=[];
    this.natural = false; this.notesScheduled = this.bowlsScheduled = 0; this.resumeNaturalUntil = 0;
  }
  beginEnvironment(selection:AcousticSelection,seconds:number,start:number,session:string,entry?:{entrySeconds:number;smoothEntry?:boolean}){
    this.stop();this.environment={program:acousticProgram(selection,seconds),fades:{entrySeconds:entry?.entrySeconds??Math.min(20,seconds*.1),returnSeconds:Math.min(30,seconds*.15),smoothEntry:entry?.smoothEntry}};
    this.start=start;this.session=session;this.liveMix=structuredClone(selection.mix);this.mixChanged=true;
    this.soundedBowls.clear();this.soundedVoices.clear();this.skippedVoices=[];this.natural=false;this.notesScheduled=this.bowlsScheduled=this.resumeNaturalUntil=0;
  }
  setVoicePreferences(level:number,enabled:boolean,ducking:boolean) {
    this.voiceScale=enabled?level:0;this.ducking=ducking;
    const context=this.port()?.context;
    if(this.buses&&context){this.buses.voice.gain.setTargetAtTime((this.liveMix?.levels.voice??this.config?.levels.voice??1)*this.voiceScale,context.currentTime,.05);this.refreshDucking();if(this.voiceScale)void this.loadFutureVoices();}
  }
  setMix(mix:ListenerMix){
    if(!validMix(mix))throw new Error('Unsupported live sound mix.');
    if(!this.config&&!this.environment)return;
    this.liveMix=structuredClone(mix);this.mixChanged=true;
    const context=this.port()?.context,b=this.buses;
    if(context&&b){b.notes.gain.setTargetAtTime(mix.levels.breathingTones,context.currentTime,.05);b.bowl.gain.setTargetAtTime(mix.levels.bowl,context.currentTime,.05);b.voice.gain.setTargetAtTime(mix.levels.voice*this.voiceScale,context.currentTime,.05);this.node?.port.postMessage({mix:this.currentLayerMix()});this.refreshDucking();if(mix.levels.voice>0)void this.loadFutureVoices();}
    this.changed();
  }
  private currentLayerMix(){const m=this.liveMix;return this.mixChanged&&m?{warm:m.levels.warm*LAYER_GAIN.warm,binaural:m.levels.binaural*LAYER_GAIN.binaural}:this.config?layerMix(this.config):undefined;}
  private async loadFutureVoices(){
    const c=this.config,context=this.port()?.context,bus=this.buses?.voice,token=this.generation;
    if(!c||!context||!bus||!this.active||!this.voiceScale||!this.liveMix?.levels.voice)return;
    for(const cue of narrationPlan(c)){
      if(cue.at<=(this.clock.now()-this.start)/1000+.25||this.tracksHasVoice(cue.clip.id)||this.soundedVoices.has(cue.clip.id)||this.natural&&isBreathIntro(cue.clip.id))continue;
      const asset=this.recordings[cue.clip.id];if(!validRecording(cue,asset,c.audioAssets.voice)||c.audioAssets.voiceSha256?.[asset.assetId]!==asset.sha256)continue;
      const buffer=this.voices.get(asset.id)??await this.load(asset.assetId,asset.sha256);
      if(token!==this.generation||!this.active||!this.voiceScale||!this.liveMix?.levels.voice)return;
      if(!buffer||Math.abs(buffer.duration-asset.decodedDurationSeconds)>1/buffer.sampleRate)continue;
      this.voices.set(asset.id,buffer);
      if(cue.at<=(this.clock.now()-this.start)/1000+.05||this.tracksHasVoice(cue.clip.id))continue;
      this.buffer(buffer,bus,'voice',cue.at,context.currentTime-(this.clock.now()-this.start)/1000,1,cue.clip.id);
    }
    this.refreshDucking();
  }
  private tracksHasVoice(id:string){return [...this.tracks].some(t=>t.kind==='voice'&&t.clipId===id);}
  private refreshDucking(){
    const context=this.port()?.context,bus=this.buses?.duck;if(!context||!bus)return;
    const now=context.currentTime;bus.gain.cancelScheduledValues(now);bus.gain.setTargetAtTime(1,now,.05);
    if(!this.ducking||!this.voiceScale||!this.liveMix?.levels.voice)return;
    for(const track of this.tracks)if(track.kind==='voice'&&track.when+track.end-track.at>now){bus.gain.setTargetAtTime(.65,Math.max(now,track.when),.08);bus.gain.setTargetAtTime(1,track.when+track.end-track.at,.2);}
  }
  play(resuming = false) {
    if(this.environment){this.playEnvironment();return;}
    const config = this.config, port = this.port();
    if (!config || !port || port.context.state !== 'running' || this.active) return;
    const { context, input } = port, elapsed = Math.max(0, (this.clock.now() - this.start) / 1000);
    if (elapsed >= config.sound.timeline.durationSeconds) return;
    const token = ++this.generation, origin = context.currentTime - elapsed;
    this.active = true;
    const breathing=sectionWindow(config,'breathwork');
    if (resuming && elapsed >= breathing.start && elapsed < breathing.end) this.resumeNaturalUntil = nextInhale(config, elapsed + .05);
    const environment = context.createGain(), duck = context.createGain(), notes = context.createGain(), bowl = context.createGain(), voice = context.createGain();
    const levels=this.liveMix?.levels??config.levels;
    environment.gain.value = config.levels.environment; notes.gain.value = levels.breathingTones; bowl.gain.value = levels.bowl; voice.gain.value = levels.voice*this.voiceScale;
    environment.connect(duck); duck.connect(input); notes.connect(input); bowl.connect(input); voice.connect(input);
    this.buses = { environment, duck, notes, bowl, voice };
    if (this.wave && this.workletReady) {
      try {
        const node = this.makeNode(context, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', processorOptions: { program: config.sound, wave: this.wave, origin, mix:this.currentLayerMix() } });
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
      if(config.toneVersion==='soft-steps.2'){
        const when=Math.max(context.currentTime,origin+event.at),{oscillator,gain}=scheduleSoftNote(context,notes,event.hz,when,event.phase.startsWith('hold'));
        this.track(oscillator,gain,'note',event.at,event.at+event.duration,when);this.notesScheduled++;continue;
      }
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
    for(const at of config.preparation?.chimes??[]){
      if(!this.chime||this.soundedBowls.has(at)||at<elapsed)continue;
      this.buffer(this.chime,bowl,'bowl',at,origin,8);this.bowlsScheduled++;
    }
    // Missing/unapproved/oversize recordings never move the timeline or introduce live TTS.
    for (const cue of narrationPlan(config)) {
      const initialEntry=cue.at===0&&!resuming&&elapsed<.25;
      if(levels.voice===0||this.voiceScale===0||cue.at<elapsed&&!initialEntry||this.soundedVoices.has(cue.clip.id)||this.natural&&isBreathIntro(cue.clip.id))continue;
      const asset=this.recordings[cue.clip.id],buffer=this.voices.get(cue.clip.id);
      if(!asset||!validRecording(cue,asset,config.audioAssets.voice)||config.audioAssets.voiceSha256?.[asset.assetId]!==asset.sha256||!buffer){this.skippedVoices.push(cue.clip.id);continue;}
      this.buffer(buffer,voice,'voice',cue.at,origin,1,cue.clip.id);
      if(this.ducking){const when=Math.max(context.currentTime,origin+cue.at);duck.gain.setTargetAtTime(.65,when,.08);duck.gain.setTargetAtTime(1,when+buffer.duration,.2);}
    }
    this.changed();
  }
  private playEnvironment(){
    const p=this.environment,port=this.port();if(!p||!port||port.context.state!=='running'||this.active)return;
    const elapsed=(this.clock.now()-this.start)/1000;if(elapsed>=p.program.timeline.durationSeconds)return;
    const {context,input}=port,origin=context.currentTime-elapsed,token=++this.generation;
    const environment=context.createGain(),duck=context.createGain(),notes=context.createGain(),bowl=context.createGain(),voice=context.createGain();
    environment.connect(duck);duck.connect(input);notes.connect(input);bowl.connect(input);voice.connect(input);this.buses={environment,duck,notes,bowl,voice};this.active=true;
    if(!this.wave||!this.workletReady){this.error='The sound environment is unavailable. Your timer continues.';this.changed();return;}
    try{const node=this.makeNode(context,{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],channelCount:2,channelCountMode:'explicit',processorOptions:{program:p.program,wave:this.wave,origin,mix:this.currentLayerMix(),fades:p.fades}});this.node=node;node.connect(environment);
      node.port.onmessage=e=>{if(e.data.capture&&this.capturePending){const pending=this.capturePending;this.capturePending=undefined;clearTimeout(pending.timer);pending.resolve({...e.data,sampleRate:context.sampleRate});}if(e.data.ended){node.disconnect();node.port.close();if(this.node===node)this.node=undefined;this.changed();}};
      node.onprocessorerror=()=>{if(token!==this.generation)return;node.disconnect();node.port.close();this.node=undefined;this.error='The sound environment stopped. Your timer continues.';this.changed();};
    }catch{this.error='The sound environment is unavailable. Your timer continues.';}
    this.changed();
  }
  private envelope(gain: GainNode, at: number, seconds: number, level: number) {
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(level, at + Math.min(.025, seconds / 3));
    gain.gain.setValueAtTime(level, at + seconds - Math.min(.18, seconds / 3)); gain.gain.linearRampToValueAtTime(0, at + seconds);
  }
  private track(source: Track['source'], gain: GainNode, kind: Track['kind'], at: number, end: number, when:number,clipId?:string) {
    const track = { source, gain, kind, at, end, when,clipId }; this.tracks.add(track);
    source.onended = () => { this.tracks.delete(track); source.disconnect(); gain.disconnect(); };
  }
  private buffer(buffer: AudioBuffer, bus: GainNode, kind: 'bowl' | 'voice', at: number, origin: number, level: number,clipId?:string) {
    const context = this.port()!.context, when = Math.max(context.currentTime, origin + at), source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer; source.connect(gain); gain.connect(bus); this.envelope(gain, when, buffer.duration, level);
    this.track(source, gain, kind, at, at + buffer.duration, when,clipId); source.start(when); source.stop(when + buffer.duration);
  }
  breatheNaturally() { this.natural = true; this.clearTracks(track => track.kind === 'note'||track.kind==='voice'&&!!track.clipId&&isBreathIntro(track.clipId));this.refreshDucking();this.changed(); }
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
    for(const track of tracks)if(track.kind==='voice'&&track.clipId&&context&&context.currentTime>=track.when)this.soundedVoices.add(track.clipId);
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
  stop(smooth = false) { this.suspend(smooth); this.config = undefined;this.environment=undefined; this.session = undefined;this.liveMix=undefined;this.mixChanged=false; }
  capture(seconds = 1) {
    return new Promise<unknown>((resolve, reject) => {
      const context = this.port()?.context;
      if (!this.node || !context || this.capturePending || seconds <= 0 || seconds > 2) { reject(new Error('Capture needs a playing journey and 0–2 seconds.')); return; }
      const timer = setTimeout(() => { this.capturePending = undefined; reject(new Error('Capture timed out')); }, 5000);
      this.capturePending = { resolve, reject, timer }; this.node.port.postMessage({ captureFrames: Math.round(context.sampleRate * seconds) });
    });
  }
  voiceActive() { const elapsed = (this.clock.now() - this.start) / 1000; return [...this.tracks].some(t => t.kind === 'voice' && elapsed >= t.at && elapsed < t.end); }
  diagnostics() { return { active: this.active, environmentGraphs: this.node ? 1 : 0, activeTracks: this.tracks.size, notesScheduled: this.notesScheduled, bowlsScheduled: this.bowlsScheduled, naturalBreathing: this.natural, naturalUntilSeconds: this.resumeNaturalUntil, sourceBytes: this.wave?.byteLength ?? 0, error: this.error, session: this.session,skippedVoices:[...new Set(this.skippedVoices)],layerMix:this.currentLayerMix(),liveMix:this.liveMix?structuredClone(this.liveMix):undefined }; }
}
