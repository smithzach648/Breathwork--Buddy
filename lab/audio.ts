import workletUrl from './worklet.ts?worker&url';
export { workletUrl };
import type { Recipe } from './model';
import type { RenderOptions, measure, spectrum } from './dsp';
export type RenderResult = {
  wav: ArrayBuffer;
  metrics: ReturnType<typeof measure>;
  spectra?: ReturnType<typeof spectrum>[];
  renderMilliseconds: number;
};
export function workerJob<T>(task: 'wave' | 'render', recipe: Recipe, options: RenderOptions, spectra = false, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Cancelled', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module'
    });
    const finish = () => {
      worker.terminate();
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      finish();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const timeout = setTimeout(() => {
      finish();
      reject(new Error('Sound preparation timed out. Try a shorter excerpt.'));
    }, 120000);
    signal?.addEventListener('abort', abort, {
      once: true
    });
    worker.onerror = e => {
      finish();
      reject(new Error(e.message || 'Sound worker failed.'));
    };
    worker.onmessage = e => {
      finish();
      if (e.data.error) reject(new Error(e.data.error));else resolve(e.data);
    };
    worker.postMessage({
      id: 1,
      task,
      recipe,
      options,
      spectra
    });
  });
}
export class Player {
  private context?: AudioContext;
  private node?: AudioWorkletNode;
  private analyser?: AnalyserNode;
  private preparing?: AbortController;
  private generation = 0;
  private state = 'Stopped';
  private count = 0;
  private retirement: Promise<void> = Promise.resolve();
  private captureResult?: {
    resolve: (r: {
      left: Float32Array;
      right: Float32Array;
      firstFrame: number;
      sampleRate: number;
    }) => void;
    reject: (e: Error) => void;
  };
  constructor(private update: (state: string) => void) {}
  private publish(state: string) {
    this.state = state;
    this.update(state);
  }
  diagnostics() {
    const pcm = new Float32Array(this.analyser?.fftSize ?? 0);
    this.analyser?.getFloatTimeDomainData(pcm);
    return {
      state: this.state,
      activeGraphs: this.count,
      contextState: this.context?.state ?? 'closed',
      generation: this.generation,
      measuredLiveRms: Math.sqrt(pcm.reduce((s, x) => s + x * x, 0) / Math.max(1, pcm.length))
    };
  }
  capture(seconds = 1) {
    return new Promise<{
      left: Float32Array;
      right: Float32Array;
      firstFrame: number;
      sampleRate: number;
    }>((resolve, reject) => {
      if (!this.node || !this.context || seconds <= 0 || seconds > 2 || this.captureResult) {
        reject(new Error('Capture requires one playing graph and 0–2 seconds.'));
        return;
      }
      const pending = {
        resolve,
        reject
      };
      this.captureResult = pending;
      this.node.port.postMessage({
        captureFrames: Math.round(seconds * this.context.sampleRate)
      });
      setTimeout(() => {
        if (this.captureResult === pending) {
          this.captureResult = undefined;
          reject(new Error('Capture timed out or audio was suspended.'));
        }
      }, 5000);
    });
  }
  async stop(immediate = false) {
    ++this.generation;
    this.preparing?.abort();
    this.preparing = undefined;
    this.captureResult?.reject(new Error('Capture cancelled by Stop.'));
    this.captureResult = undefined;
    const context = this.context,
      node = this.node;
    this.context = undefined;
    this.node = undefined;
    const previous = this.retirement;
    const retire = async () => {
      await previous;
      if (node && context?.state === 'running' && !immediate) {
        node.port.postMessage('stop');
        await new Promise<void>(resolve => {
          const timer = setTimeout(resolve, 2100);
          node.port.onmessage = e => {
            if (e.data.ended) {
              clearTimeout(timer);
              resolve();
            }
          };
        });
      }
      node?.disconnect();
      node?.port.close();
      this.analyser?.disconnect();
      this.analyser = undefined;
      if (context && context.state !== 'closed') await context.close();
    };
    this.retirement = retire();
    await this.retirement;
    this.count = 0;
    this.publish('Stopped');
  }
  async start(recipe: Recipe, options: RenderOptions) {
    // Resume is invoked synchronously from the listener's button before asynchronous preparation.
    // UI serializes swaps; no second graph may overlap an outgoing graph.
    const token = ++this.generation;
    if (this.context || this.count) throw new Error('Stop the current preview before starting another.');
    const context = new AudioContext({
      sampleRate: options.sampleRate,
      latencyHint: 'playback'
    });
    this.context = context;
    const resumed = context.resume();
    this.publish('Preparing sound…');
    const abort = new AbortController();
    this.preparing = abort;
    try {
      await resumed;
      if (context.state !== 'running') throw new Error('Audio is paused. Press Start again to unlock it.');
      if (!context.audioWorklet) throw new Error('AudioWorklet unavailable. Open the lab in Chrome at localhost.');
      const [result] = await Promise.all([workerJob<{
        wave: Float32Array;
      }>('wave', recipe, {
        ...options,
        sampleRate: context.sampleRate
      }, false, abort.signal), context.audioWorklet.addModule(workletUrl)]);
      if (token !== this.generation || abort.signal.aborted) return;
      const node = new AudioWorkletNode(context, 'acoustic-laboratory-v1', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',
        processorOptions: {
          recipe,
          options: {
            ...options,
            sampleRate: context.sampleRate
          },
          wave: result.wave
        }
      });
      this.node = node;
      this.count = 1;
      this.preparing = undefined;
      node.port.onmessage = e => {
        if (e.data.capture) {
          const pending = this.captureResult;
          this.captureResult = undefined;
          pending?.resolve({
            ...e.data,
            sampleRate: context.sampleRate
          });
        } else if (e.data.ended && this.context === context) void this.stop(true);
      };
      node.onprocessorerror = () => {
        if (this.context === context) {
          void this.stop(true).then(() => this.publish('Sound processor failed. Stop and restart.'));
        }
      };
      context.onstatechange = () => {
        if (context.state === 'suspended' || context.state === 'interrupted' as AudioContextState) {
          if (this.context === context) void this.stop(true).then(() => this.publish('Audio paused by the browser. Press Start to resume.'));
        }
      };
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = 2048;
      node.connect(this.analyser);
      node.connect(context.destination);
      this.publish('Playing stereo');
    } catch (error) {
      if (token === this.generation) {
        await this.stop(true);
        throw error;
      }
    }
  }
}
export function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
