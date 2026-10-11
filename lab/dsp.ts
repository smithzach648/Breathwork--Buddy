import { maskingSteps, fftSteps } from '../src/audio/noise-spectrum';
import { toneAmplitude } from '../src/audio/binaural';
import { gains, validateRecipe, type Recipe, type Pair, type Selection } from './model';
export const NOISE_SIZE = 1 << 20;
export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}
export function warmSteps(rate: number, seed: number) {
  return maskingSteps('brown', rate, NOISE_SIZE, seeded(seed));
}
export function warm(rate: number, seed: number) {
  const g = warmSteps(rate, seed);
  let s = g.next();
  while (!s.done) s = g.next();
  return s.value;
}
const tau = 2 * Math.PI;
const ease = (x: number, smooth: boolean) => smooth ? x * x * (3 - 2 * x) : x;
const primitive = (x: number, smooth: boolean) => smooth ? x * x * x - .5 * x * x * x * x : .5 * x * x;
/** Integral in carrier cycles from the session origin. Exact polynomial segments; no phase reset at a knot. */
export function carrier(p: Pair, t: number, r: Recipe): {
  hz: number;
  cycles: number;
} {
  if (!p.curve.length) return {
    hz: p.leftHz,
    cycles: p.leftHz * t
  };
  const entry = r.timeline.entrySeconds,
    steady = r.timeline.durationSeconds - entry - r.timeline.returnSeconds;
  if (t <= entry) return {
    hz: p.leftHz,
    cycles: p.leftHz * t
  };
  let cycles = entry * p.leftHz,
    elapsed = t - entry;
  for (let i = 1; i < p.curve.length; i++) {
    const a = p.curve[i - 1],
      b = p.curve[i],
      duration = (b.at - a.at) * steady,
      part = Math.min(elapsed, duration),
      u = part / duration;
    cycles += duration * (a.hz * u + (b.hz - a.hz) * primitive(u, p.interpolation === 'smooth'));
    if (elapsed <= duration) return {
      hz: a.hz + (b.hz - a.hz) * ease(u, p.interpolation === 'smooth'),
      cycles
    };
    elapsed -= duration;
  }
  const hz = p.curve.at(-1)!.hz;
  return {
    hz,
    cycles: cycles + elapsed * hz
  };
}
export function toneEnvelopeAt(r: Recipe, t: number) {
  const {
    entrySeconds: entry,
    returnSeconds: ret,
    durationSeconds: duration
  } = r.timeline;
  if (t < entry) return .2 + .8 * t / entry;
  if (t < duration - ret) return 1;
  return ret ? Math.max(0, (duration - t) / ret) : t < duration ? 1 : 0;
}
export function delayAt(r: Recipe, t: number, channel: number) {
  const n = r.noise,
    theta = tau * n.sweepHz * t + n.phase;
  return n.delaySeconds * (1 + n.movementDepth * Math.sin(theta + channel * n.width * Math.PI / 2));
}
export interface RenderOptions {
  sampleRate: number;
  startSeconds: number;
  durationSeconds: number;
  selection: Selection;
  matchGain?: number;
  fade?: boolean;
}
export function validateOptions(r: Recipe, o: RenderOptions, live = false) {
  if (![44100, 48000].includes(o.sampleRate) || !Number.isFinite(o.startSeconds) || o.startSeconds < 0 || o.startSeconds >= r.timeline.durationSeconds || !Number.isFinite(o.durationSeconds) || o.durationSeconds <= 0 || o.durationSeconds > (live ? 3600 : 120) || o.startSeconds + o.durationSeconds > r.timeline.durationSeconds + 1 / o.sampleRate || !['combined', 'tones', 'noise'].includes(o.selection) || o.matchGain !== undefined && (!Number.isFinite(o.matchGain) || o.matchGain < 0 || o.matchGain > 1)) throw new Error('Render: use 44.1/48 kHz, a valid session excerpt, up to 120s export, and matching attenuation 0–1.');
}
/** A single sample core powers AudioWorklet blocks and chunked worker WAV export. No feedback, stateful filter or seek pre-roll. */
export class Synth {
  readonly recipe: Recipe;
  readonly options: RenderOptions;
  readonly layers: ReturnType<typeof gains>;
  readonly frames: number;
  readonly offset: number;
  constructor(recipe: Recipe, options: RenderOptions, readonly wave: Float32Array) {
    this.recipe = validateRecipe(recipe);
    validateOptions(this.recipe, options, true);
    this.options = {
      ...options
    };
    this.layers = gains(this.recipe);
    this.frames = Math.round(options.durationSeconds * options.sampleRate);
    this.offset = Math.round(options.startSeconds * options.sampleRate);
    if (wave.length !== NOISE_SIZE) throw new Error('Warm buffer must use the unchanged 4B length.');
  }
  private noise(frame: number, delaySamples: number) {
    let index = (frame - delaySamples) % this.wave.length;
    if (index < 0) index += this.wave.length;
    const floor = Math.floor(index),
      fraction = index - floor;
    return this.wave[floor] * (1 - fraction) + this.wave[(floor + 1) % this.wave.length] * fraction;
  }
  block(left: Float32Array, right: Float32Array, firstFrame: number) {
    const r = this.recipe,
      o = this.options,
      rate = o.sampleRate,
      n = r.noise,
      am = r.modulations.am,
      tones = o.selection !== 'noise',
      noise = o.selection !== 'tones' && n.kind !== 'off',
      master = r.output.level * r.output.trim * (o.matchGain ?? 1),
      toneGain = toneAmplitude * r.output.toneLevel,
      fadeFrames = r.output.fadeSeconds * rate;
    for (let i = 0; i < left.length; i++) {
      const frame = firstFrame + i;
      if (frame >= this.frames) {
        left[i] = right[i] = 0;
        continue;
      }
      const absolute = this.offset + frame,
        t = absolute / rate;
      let l = 0,
        rr = 0;
      if (tones) {
        for (const {
          pair: p,
          gain
        } of this.layers) {
          const state = carrier(p, t, r);
          l += gain * Math.sin(tau * (state.cycles % 1) + p.leftPhase);
          rr += gain * Math.sin(tau * ((state.cycles + p.deltaHz * t) % 1) + p.rightPhase);
        }
        const env = toneEnvelopeAt(r, t) * toneGain;
        l *= env * (am.enabled ? 1 + am.depth * Math.sin(tau * am.rateHz * t + am.phase) : 1);
        rr *= env * (am.enabled ? 1 + am.depth * Math.sin(tau * am.rateHz * t + am.phase + am.channelPhase) : 1);
      }
      if (noise) {
        const x = this.wave[absolute % this.wave.length];
        if (n.kind === 'warm-static') {
          l += x * n.level;
          rr += x * n.level;
        } else {
          l += n.level * ((1 - n.mix) * x + n.mix * this.noise(absolute, delayAt(r, t, 0) * rate));
          rr += n.level * ((1 - n.mix) * x + n.mix * this.noise(absolute, delayAt(r, t, 1) * rate));
        }
      }
      const fade = o.fade === false ? 1 : Math.max(0, Math.min(1, frame / fadeFrames, (this.frames - 1 - frame) / fadeFrames));
      // Same 4B identity region and memoryless ceiling, without native WaveShaper oversampling.
      const ceiling = (v: number) => {
        const a = Math.abs(v);
        return Math.sign(v) * (a <= .85 ? a : .85 + .1 * Math.tanh((a - .85) / .1));
      };
      left[i] = ceiling(l * master) * fade;
      right[i] = ceiling(rr * master) * fade;
    }
  }
}
export function render(recipe: Recipe, o: RenderOptions, wave: Float32Array) {
  validateOptions(recipe, o);
  const synth = new Synth(recipe, o, wave),
    left = new Float32Array(synth.frames),
    right = new Float32Array(synth.frames);
  for (let frame = 0; frame < synth.frames; frame += 8192) synth.block(left.subarray(frame, frame + 8192), right.subarray(frame, frame + 8192), frame);
  return [left, right] as const;
}
export function measure(channels: readonly Float32Array[], rate: number) {
  const [l, r] = channels,
    frames = l.length;
  if (!frames || r.length !== frames) throw new Error('Measurement requires stereo PCM.');
  let ll = 0,
    rr = 0,
    lr = 0,
    sl = 0,
    sr = 0,
    pl = 0,
    pr = 0,
    mono = 0,
    invalid = 0,
    step = 0;
  for (let i = 0; i < frames; i++) {
    if (!Number.isFinite(l[i]) || !Number.isFinite(r[i])) invalid++;
    ll += l[i] * l[i];
    rr += r[i] * r[i];
    lr += l[i] * r[i];
    sl += l[i];
    sr += r[i];
    pl = Math.max(pl, Math.abs(l[i]));
    pr = Math.max(pr, Math.abs(r[i]));
    mono = Math.max(mono, Math.abs((l[i] + r[i]) / 2));
    if (i) step = Math.max(step, Math.abs(l[i] - l[i - 1]), Math.abs(r[i] - r[i - 1]));
  }
  const correlation = (lr - sl * sr / frames) / Math.sqrt(Math.max(1e-30, (ll - sl * sl / frames) * (rr - sr * sr / frames)));
  const windows = [];
  for (let start = 0; start + rate <= frames; start += rate) {
    let a = 0,
      b = 0,
      c = 0;
    for (let i = start; i < start + rate; i++) {
      a += l[i] ** 2;
      b += r[i] ** 2;
      c += l[i] * r[i];
    }
    windows.push({
      second: start / rate,
      rms: [Math.sqrt(a / rate), Math.sqrt(b / rate)],
      correlation: c / Math.sqrt(Math.max(1e-30, a * b))
    });
  }
  return {
    frames,
    sampleRate: rate,
    seconds: frames / rate,
    rms: [Math.sqrt(ll / frames), Math.sqrt(rr / frames)],
    peak: [pl, pr],
    mean: [sl / frames, sr / frames],
    energy: [ll, rr],
    correlation,
    monoPeak: mono,
    invalidSamples: invalid,
    maxAdjacentStep: step,
    windows
  };
}
/** Hann FFT. 2^18 samples / 48 kHz = 5.461s; bin width .183105 Hz. */
export function spectrum(samples: Float32Array, rate: number, size = 1 << 18) {
  if (samples.length < size || size < 1024 || size > 1 << 19 || size & size - 1) throw new Error('Not enough audio for the requested FFT.');
  const real = new Float32Array(size),
    imaginary = new Float32Array(size);
  for (let i = 0; i < size; i++) real[i] = samples[i] * (.5 - .5 * Math.cos(tau * i / (size - 1)));
  for (const _ of fftSteps(real, imaginary)) void _;
  const points = [];
  for (let i = 1; i < size / 2; i++) {
    const power = real[i] ** 2 + imaginary[i] ** 2;
    if (i > 1 && power > real[i - 1] ** 2 + imaginary[i - 1] ** 2 && power >= real[i + 1] ** 2 + imaginary[i + 1] ** 2) points.push({
      hz: i * rate / size,
      amplitude: 4 * Math.sqrt(power) / size
    });
  }
  points.sort((a, b) => b.amplitude - a.amplitude);
  return {
    size,
    window: 'Hann',
    binHz: rate / size,
    peaks: points.slice(0, 16)
  };
}
export function encodeWav(channels: readonly Float32Array[], rate: number) {
  const frames = channels[0].length;
  if (channels.length !== 2 || channels[1].length !== frames || frames > rate * 120 || ![44100, 48000].includes(rate)) throw new Error('WAV must be stereo 44.1/48 kHz and at most 120s.');
  const data = new ArrayBuffer(44 + frames * 4),
    v = new DataView(data),
    ascii = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + frames * 4, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  ascii(36, 'data');
  v.setUint32(40, frames * 4, true);
  for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) {
    const x = channels[c][i];
    if (!Number.isFinite(x) || Math.abs(x) > 1) throw new Error('Invalid PCM: refusing a corrupt WAV.');
    v.setInt16(44 + 4 * i + 2 * c, Math.round(x * 32767), true);
  }
  return data;
}
export function matchLevels(a: ReturnType<typeof measure>, b: ReturnType<typeof measure>) {
  const rms = (m: ReturnType<typeof measure>) => Math.sqrt((m.rms[0] ** 2 + m.rms[1] ** 2) / 2),
    ra = rms(a),
    rb = rms(b),
    target = Math.min(ra, rb);
  return {
    a: ra > 0 ? target / ra : 0,
    b: rb > 0 ? target / rb : 0,
    targetRms: target,
    method: 'Excerpt stereo RMS, attenuation only; not perceptual loudness or SPL calibration'
  };
}
