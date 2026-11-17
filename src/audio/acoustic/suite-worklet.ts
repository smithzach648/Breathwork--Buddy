import { JourneySynth, type Journey } from './journey';
import type { LayerMix } from './dsp';
declare const sampleRate: number;
declare const currentFrame: number;
declare class AudioWorkletProcessor { port: MessagePort; constructor(options?: unknown); }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;
/** The production adapter uses the unchanged JourneySynth, on the shared AudioContext clock. */
class SuiteProcessor extends AudioWorkletProcessor {
  synth: JourneySynth;
  origin: number;
  began?: number;
  stopped?: number;
  mix?:LayerMix;
  mixRamp?:{from:LayerMix;to:LayerMix;start:number;end:number};
  entrySeconds=5;
  smoothEntry=false;
  returnSeconds=180;
  capture?: { left: Float32Array; right: Float32Array; first: number; written: number };
  constructor(options: { processorOptions: { program: Journey; wave: Float32Array; origin: number; mix?:LayerMix;fades?:{entrySeconds:number;returnSeconds:number;smoothEntry?:boolean} } }) {
    super();
    const p = options.processorOptions;
    if(p.fades){if(!Number.isFinite(p.fades.entrySeconds)||p.fades.entrySeconds<.05||p.fades.entrySeconds>120||!Number.isFinite(p.fades.returnSeconds)||p.fades.returnSeconds<.05||p.fades.returnSeconds>180)throw new Error('Invalid sound fade.');this.smoothEntry=p.fades.smoothEntry===true;this.entrySeconds=p.fades.entrySeconds;this.returnSeconds=p.fades.returnSeconds;}
    if(p.mix&&(!Number.isFinite(p.mix.warm)||p.mix.warm<0||p.mix.warm>3||!Number.isFinite(p.mix.binaural)||p.mix.binaural<0||p.mix.binaural>4))throw new Error('Invalid listener layer gains');
    this.mix=p.mix;
    this.origin = p.origin * sampleRate;
    this.synth = new JourneySynth(p.program, { sampleRate, startSeconds: 0, durationSeconds: p.program.timeline.durationSeconds, selection: 'combined', fade: false }, p.wave);
    this.port.onmessage = event => {
      if (event.data === 'stop') this.stopped = currentFrame;
      else if(event.data?.mix){const m=event.data.mix;if(Number.isFinite(m.warm)&&m.warm>=0&&m.warm<=3&&Number.isFinite(m.binaural)&&m.binaural>=0&&m.binaural<=4)this.mixRamp={from:this.mixAt(currentFrame),to:{warm:m.warm,binaural:m.binaural},start:currentFrame,end:currentFrame+Math.round(sampleRate*.05)};}
      else if (Number.isInteger(event.data?.captureFrames) && event.data.captureFrames > 0 && event.data.captureFrames <= 2 * sampleRate) this.capture = { left: new Float32Array(event.data.captureFrames), right: new Float32Array(event.data.captureFrames), first: Math.round(currentFrame - this.origin), written: 0 };
    };
  }
  mixAt(frame:number):LayerMix {const r=this.mixRamp;if(!r)return this.mix??{warm:1,binaural:1};const u=Math.max(0,Math.min(1,(frame-r.start)/(r.end-r.start)));return {warm:r.from.warm+(r.to.warm-r.from.warm)*u,binaural:r.from.binaural+(r.to.binaural-r.from.binaural)*u};}
  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const [left, right] = outputs[0];
    if (!left || !right) return false;
    const frame = Math.round(currentFrame - this.origin);
    this.began ??= currentFrame;
    const prefix = Math.min(left.length, Math.max(0, -frame));
    left.fill(0); right.fill(0);
    let mix=this.mix;
    if(this.mixRamp){const r=this.mixRamp,at=currentFrame+prefix,start=this.mixAt(at),remaining=Math.max(0,r.end-at);mix=remaining?{...start,warmStep:(r.to.warm-start.warm)/remaining,binauralStep:(r.to.binaural-start.binaural)/remaining,rampFrames:remaining}:r.to;if(!remaining){this.mix=r.to;this.mixRamp=undefined;}}
    if (prefix < left.length) this.synth.block(left.subarray(prefix), right.subarray(prefix), frame + prefix, mix);
    for (let i = 0; i < left.length; i++) {
      const t = (frame + i) / sampleRate;
      const entry=Math.max(0,Math.min(1,t/this.entrySeconds));
      const envelope = Math.max(0, Math.min(1, this.smoothEntry?entry*entry*(3-2*entry):entry, (this.synth.recipe.timeline.durationSeconds - t) / this.returnSeconds, (currentFrame + i - this.began) / (sampleRate * .05)));
      const stop = this.stopped === undefined ? 1 : Math.max(0, 1 - (currentFrame + i - this.stopped) / (sampleRate * .05));
      // Undo only the laboratory's fixed trim; production applies its existing trim once downstream.
      left[i] *= 4 * envelope * stop; right[i] *= 4 * envelope * stop;
    }
    if (this.capture) {
      const c = this.capture, count = Math.min(left.length, c.left.length - c.written);
      c.left.set(left.subarray(0, count), c.written); c.right.set(right.subarray(0, count), c.written); c.written += count;
      if (c.written === c.left.length) { this.port.postMessage({ capture: true, left: c.left, right: c.right, firstFrame: c.first }, [c.left.buffer, c.right.buffer]); this.capture = undefined; }
    }
    if (frame >= this.synth.frames || this.stopped !== undefined && currentFrame >= this.stopped + sampleRate * .05) { this.port.postMessage({ ended: true }); return false; }
    return true;
  }
}
registerProcessor('meditation-suite-v1', SuiteProcessor);
