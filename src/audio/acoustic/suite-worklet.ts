import { JourneySynth, type Journey } from './journey';
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
  capture?: { left: Float32Array; right: Float32Array; first: number; written: number };
  constructor(options: { processorOptions: { program: Journey; wave: Float32Array; origin: number } }) {
    super();
    const p = options.processorOptions;
    this.origin = p.origin * sampleRate;
    this.synth = new JourneySynth(p.program, { sampleRate, startSeconds: 0, durationSeconds: p.program.timeline.durationSeconds, selection: 'combined', fade: false }, p.wave);
    this.port.onmessage = event => {
      if (event.data === 'stop') this.stopped = currentFrame;
      else if (Number.isInteger(event.data?.captureFrames) && event.data.captureFrames > 0 && event.data.captureFrames <= 2 * sampleRate) this.capture = { left: new Float32Array(event.data.captureFrames), right: new Float32Array(event.data.captureFrames), first: Math.round(currentFrame - this.origin), written: 0 };
    };
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const [left, right] = outputs[0];
    if (!left || !right) return false;
    const frame = Math.round(currentFrame - this.origin);
    this.began ??= currentFrame;
    const prefix = Math.min(left.length, Math.max(0, -frame));
    left.fill(0); right.fill(0);
    if (prefix < left.length) this.synth.block(left.subarray(prefix), right.subarray(prefix), frame + prefix);
    for (let i = 0; i < left.length; i++) {
      const t = (frame + i) / sampleRate;
      const envelope = Math.max(0, Math.min(1, t / 5, (this.synth.recipe.timeline.durationSeconds - t) / 180, (currentFrame + i - this.began) / (sampleRate * .05)));
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
