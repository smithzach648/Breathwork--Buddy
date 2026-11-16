import { warm } from './dsp';
self.onmessage = (event: MessageEvent<{ sampleRate: number; seed: number }>) => {
  try {
    const wave = warm(event.data.sampleRate, event.data.seed);
    self.postMessage({ wave }, { transfer: [wave.buffer] });
  } catch { self.postMessage({ error: 'The sound environment could not be prepared. Text guidance and breathing tones remain available.' }); }
};
