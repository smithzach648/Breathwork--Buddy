import { Synth, type RenderOptions } from './dsp';
import type { Recipe } from './model';
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  port: MessagePort;
  constructor(options?: unknown);
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;
class LaboratoryProcessor extends AudioWorkletProcessor {
  synth: Synth;
  frame = 0;
  stopFrame = Infinity;
  finished = false;
  capture?: {
    left: Float32Array;
    right: Float32Array;
    first: number;
    written: number;
  };
  constructor(options: {
    processorOptions: {
      recipe: Recipe;
      options: RenderOptions;
      wave: Float32Array;
    };
  }) {
    super();
    const p = options.processorOptions;
    this.synth = new Synth(p.recipe, {
      ...p.options,
      sampleRate
    }, p.wave);
    this.port.onmessage = event => {
      if (event.data === 'stop') this.stopFrame = Math.min(this.stopFrame, this.frame);else if (event.data?.captureFrames && Number.isInteger(event.data.captureFrames) && event.data.captureFrames <= 2 * sampleRate) this.capture = {
        left: new Float32Array(event.data.captureFrames),
        right: new Float32Array(event.data.captureFrames),
        first: this.frame,
        written: 0
      };
    };
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const [left, right] = outputs[0];
    if (!left || !right) return false;
    this.synth.block(left, right, this.frame);
    if (this.stopFrame !== Infinity) for (let i = 0; i < left.length; i++) {
      const fade = Math.max(0, 1 - (this.frame + i - this.stopFrame) / (sampleRate * this.synth.recipe.output.fadeSeconds));
      left[i] *= fade;
      right[i] *= fade;
    }
    if (this.capture) {
      const c = this.capture,
        count = Math.min(left.length, c.left.length - c.written);
      c.left.set(left.subarray(0, count), c.written);
      c.right.set(right.subarray(0, count), c.written);
      c.written += count;
      if (c.written === c.left.length) {
        this.port.postMessage({
          capture: true,
          left: c.left,
          right: c.right,
          firstFrame: c.first
        }, [c.left.buffer, c.right.buffer]);
        this.capture = undefined;
      }
    }
    this.frame += left.length;
    if (this.frame >= this.synth.frames || this.frame >= this.stopFrame + sampleRate * this.synth.recipe.output.fadeSeconds) {
      this.finished = true;
      this.port.postMessage({
        ended: true,
        frames: this.frame
      });
      return false;
    }
    return true;
  }
}
registerProcessor('acoustic-laboratory-v1', LaboratoryProcessor);
