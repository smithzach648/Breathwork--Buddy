import { beforeAll, describe, expect, it } from 'vitest';
import { PRESETS, duplicate, diagnostic, exportRecipe, importRecipe, validateRecipe, gains, pair, type Recipe } from './model';
import { warm, seeded, render, Synth, carrier, delayAt, measure, spectrum, encodeWav, matchLevels, NOISE_SIZE, type RenderOptions } from './dsp';
import { generateMasking, maskingProfiles } from '../src/audio/noise-spectrum';
import { toneRecipe, toneAmplitude } from '../src/audio/binaural';
const rate = 48000;
let wave: Float32Array;
beforeAll(() => {
  wave = warm(rate, 104729);
}, 60000);
const options = (selection: RenderOptions['selection'] = 'combined', seconds = 6, startSeconds = 900): RenderOptions => ({
  sampleRate: rate,
  startSeconds,
  durationSeconds: seconds,
  selection,
  fade: false
});
describe('isolated versioned instrument', () => {
  it.each(PRESETS)('validates and round-trips $name without changing the reference', r => {
    expect(importRecipe(exportRecipe(r))).toEqual(r);
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.carrierPairs[0])).toBe(true);
    const draft = duplicate(r);
    draft.carrierPairs[0].leftHz += 1;
    expect(r.carrierPairs[0].leftHz).not.toEqual(draft.carrierPairs[0].leftHz);
    expect(draft.sourceClassification).toBe('original-experiment');
  });
  const invalids: [string, (r: Recipe) => void][] = [['future schema', r => {
    Object.assign(r, {
      schemaVersion: 2
    });
  }], ['unknown field', r => {
    Object.assign(r, {
      script: 'alert(1)'
    });
  }], ['nonfinite', r => {
    r.output.level = NaN;
  }], ['infinite', r => {
    r.carrierPairs[0].leftHz = Infinity;
  }], ['negative gain', r => {
    r.carrierPairs[0].gain = -.1;
  }], ['high output', r => {
    r.output.level = 2;
  }], ['noise overload', r => {
    r.noise.level = .36;
  }], ['Nyquist/upper carrier', r => {
    r.carrierPairs[0].leftHz = 999;
    r.carrierPairs[0].deltaHz = 4;
  }], ['negative delta', r => {
    r.carrierPairs[0].deltaHz = -1;
  }], ['huge delay', r => {
    r.noise.delaySeconds = 1;
  }], ['CPU rate', r => {
    r.noise.sweepHz = 1000;
  }], ['feedback key', r => {
    Object.assign(r.noise, {
      feedback: 1
    });
  }], ['excess pairs', r => {
    r.carrierPairs = Array.from({
      length: 7
    }, (_, i) => pair(200, 4, 1, String(i)));
  }], ['duplicate pair IDs', r => {
    r.carrierPairs[1].id = r.carrierPairs[0].id;
  }], ['invalid curve', r => {
    r.carrierPairs[0].curve = [{
      at: 0,
      hz: 194
    }, {
      at: 0,
      hz: 245
    }];
  }], ['unsupported waveform', r => {
    Object.assign(r.carrierPairs[0], {
      waveform: 'square'
    });
  }], ['missing field', r => {
    Reflect.deleteProperty(r, 'engineVersion');
  }], ['coerced value', r => {
    Object.assign(r.output, {
      level: '0.8'
    });
  }], ['bad AM', r => {
    r.modulations.am.depth = .9;
  }], ['bad timeline', r => {
    r.timeline.durationSeconds = 600;
    r.timeline.entrySeconds = 400;
    r.timeline.returnSeconds = 400;
  }], ['stereo mismatch', r => {
    r.noise.stereoRelation = 'correlated-delay';
  }], ['zero seed', r => {
    r.sampleSeed = 0;
  }], ['unknown engine', r => {
    Object.assign(r, {
      engineVersion: 'next'
    });
  }]];
  it.each(invalids)('rejects %s without altering the built-in', (_label, change) => {
    const r = structuredClone(PRESETS[0]);
    change(r);
    expect(() => validateRecipe(r)).toThrow();
    expect(PRESETS[0].output.level).toBe(.8);
  });
  it('rejects corrupt/oversized JSON and preserves supported fractional fields', () => {
    expect(() => importRecipe('{')).toThrow('invalid JSON');
    expect(() => importRecipe(' '.repeat(65537))).toThrow('64 KiB');
    expect(importRecipe(exportRecipe(diagnostic(PRESETS[3], '375'))).carrierPairs[0].deltaHz).toBe(3.75);
  });
  it('normalizes energy with a quieter Expansion middle and excludes disabled/solo pairs', () => {
    const a = gains(PRESETS[2]);
    expect(a.reduce((s, p) => s + p.gain ** 2, 0)).toBeCloseTo(1, 14);
    expect(a[1].gain).toBeLessThan(a[0].gain);
    const d = duplicate(PRESETS[2]);
    d.carrierPairs[1].solo = true;
    expect(gains(d)).toHaveLength(1);
    expect(gains(PRESETS[3])).toHaveLength(1);
  });
  it('provides isolated diagnostic variants', () => {
    expect(diagnostic(PRESETS[1], 'septon').noise.kind).toBe('off');
    expect(diagnostic(PRESETS[1], 'single').carrierPairs).toHaveLength(1);
    expect(diagnostic(PRESETS[2], 'all4').carrierPairs.map(p => p.deltaHz)).toEqual([4, 4, 4]);
    expect(diagnostic(PRESETS[4], 'fixed').carrierPairs[0].curve).toEqual([]);
    expect(diagnostic(PRESETS[4], 'static').noise.kind).toBe('warm-static');
    expect(diagnostic(PRESETS[3], 'movement-off').noise.movementDepth).toBe(0);
  });
});
describe('real generated samples and source equivalence', () => {
  it('uses the exact original Warm function, length, spectrum and same seed', () => {
    expect(maskingProfiles.brown).toEqual({
      name: 'Warm',
      low: 60,
      high: 1400,
      power: 2
    });
    const production = generateMasking('brown', rate, NOISE_SIZE, seeded(104729));
    expect(production).toEqual(wave);
    const control = render(PRESETS[0], options('noise', 6), wave);
    expect(control[0]).toEqual(control[1]);
    const m = measure(control, rate);
    expect(m.correlation).toBeCloseTo(1, 12);
    expect(Math.abs(m.mean[0])).toBeLessThan(.00002);
  }, 60000);
  it('retains the actual 4B layered carriers and multipliers', () => {
    expect(PRESETS[0].carrierPairs.map(p => [p.leftHz, p.leftHz + p.deltaHz])).toEqual(toneRecipe('layered').map(p => [p.left, p.right]));
    expect(gains(PRESETS[0]).map(p => p.gain)).toEqual(toneRecipe('layered').map(p => p.gain));
    expect(toneAmplitude).toBe(.14);
  });
  it.each(PRESETS)('measures declared left/right carrier peaks for $name', r => {
    const fixed = structuredClone(r);
    fixed.carrierPairs.forEach(p => {
      p.curve = [];
    });
    const pcm = render(fixed, options('tones'), wave),
      spectra = pcm.map(c => spectrum(c, rate));
    for (const {
      pair: p
    } of gains(fixed)) for (let c = 0; c < 2; c++) expect(spectra[c].peaks.some(peak => Math.abs(peak.hz - (p.leftHz + c * p.deltaHz)) <= rate / (1 << 18))).toBe(true);
    const m = measure(pcm, rate);
    expect(m.invalidSamples).toBe(0);
    expect(m.rms[0]).toBeGreaterThan(0);
    expect(Math.abs(m.rms[0] - m.rms[1])).toBeLessThan(.00002);
  });
  it('shows exact published Septon assignments and same-ear beating in PCM', () => {
    const r = diagnostic(PRESETS[1], 'septon'),
      pcm = render(r, options('tones', 2), wave);
    expect(r.carrierPairs.map(p => [p.leftHz, p.leftHz + p.deltaHz])).toEqual([[200, 204], [204, 208], [208, 212]]);
    // In a 0.25s interval the adjacent 4Hz carrier phases re-align. The 8Hz spacing also exists.
    expect(pcm[0][0]).toBeCloseTo(pcm[0][rate / 4], 6);
    expect(pcm[0][rate / 16]).not.toBeCloseTo(pcm[0][rate / 8], 6);
  });
  it('renders deterministic stereo at identical metadata and sample-aligned seek', () => {
    const r = PRESETS[1],
      o = options('combined', .5),
      a = render(r, o, wave),
      b = render(r, o, wave);
    expect(a).toEqual(b);
    const full = render(r, {
        ...o,
        startSeconds: 900,
        durationSeconds: 1
      }, wave),
      seek = render(r, {
        ...o,
        startSeconds: 900.5
      }, wave);
    expect(full[0].slice(rate / 2)).toEqual(seek[0]);
    expect(full[1].slice(rate / 2)).toEqual(seek[1]);
  });
  it('uses identical math for worklet-sized blocks and offline chunks', () => {
    for (const r of [diagnostic(PRESETS[1], 'single'), diagnostic(PRESETS[1], 'septon'), PRESETS[1], PRESETS[4]]) {
      const o = options('combined', .4, 600),
        synth = new Synth(r, o, wave),
        a = render(r, o, wave),
        l = new Float32Array(synth.frames),
        rr = new Float32Array(synth.frames);
      for (let n = 0; n < l.length; n += 128) synth.block(l.subarray(n, n + 128), rr.subarray(n, n + 128), n);
      expect([l, rr]).toEqual(a);
    }
  });
  it('renders smooth glides with a fixed delta, continuous phase and true steady-domain anchors', () => {
    const r = PRESETS[4],
      p = r.carrierPairs[0],
      t = r.timeline,
      steady = t.durationSeconds - t.entrySeconds - t.returnSeconds;
    expect([0, .5, 1].map(at => carrier(p, t.entrySeconds + steady * at, r).hz)).toEqual([160, 240, 320]);
    for (const at of [.1, .5, .9]) {
      const time = t.entrySeconds + steady * at;
      const a = carrier(p, time, r),
        b = carrier(p, time + 1 / rate, r);
      expect((b.cycles - a.cycles) * rate).toBeCloseTo(a.hz, 3);
      expect(a.hz + 4 - a.hz).toBe(4);
    }
    const knot = t.entrySeconds + steady * .5;
    expect(Math.abs(carrier(p, knot + 1e-4, r).hz - carrier(p, knot - 1e-4, r).hz)).toBeLessThan(.00001);
    for (const time of [t.entrySeconds + 100, knot, t.durationSeconds - t.returnSeconds - 100]) expect(measure(render(r, options('tones', .2, time), wave), rate).maxAdjacentStep).toBeLessThan(.0002);
  });
  it('actually changes phased stereo relationships without broad pumping', () => {
    const r = PRESETS[1],
      m = measure(render(r, options('noise', 30, 900), wave), rate),
      correlations = m.windows.map(w => w.correlation),
      levels = m.windows.flatMap(w => w.rms);
    expect(Math.max(...correlations) - Math.min(...correlations)).toBeGreaterThan(.0001);
    expect(Math.min(...correlations)).toBeGreaterThan(.9);
    expect(Math.max(...levels) / Math.min(...levels)).toBeLessThan(1.5);
    const t = PRESETS[3],
      delays = [0, 30, 60, 90, 120].map(time => delayAt(t, time, 1));
    expect(Math.max(...delays) - Math.min(...delays)).toBeGreaterThan(.0001);
  });
  it('movement Off is static, mix zero matches Warm and noise Off is silent', () => {
    const r = diagnostic(PRESETS[1], 'movement-off');
    expect(delayAt(r, 0, 0)).toBe(delayAt(r, 40, 1));
    r.noise.mix = 0;
    expect(render(r, options('noise', .2), wave)).toEqual(render(PRESETS[0], options('noise', .2), wave));
    r.noise.kind = 'off';
    r.noise.stereoRelation = 'centered';
    expect(measure(render(r, options('noise', .2), wave), rate).peak).toEqual([0, 0]);
  });
  it('bounds maximum six-pair mix, preserves finite samples and click-free excerpt edges', () => {
    const r = duplicate(PRESETS[2]);
    r.carrierPairs = Array.from({
      length: 6
    }, (_, i) => pair(100 + i * 100, 4, 1, String(i)));
    r.output.toneLevel = .3;
    r.output.level = 1;
    r.noise.level = .35;
    r.noise.mix = .3;
    r.noise.movementDepth = .8;
    r.modulations.am = {
      ...r.modulations.am,
      enabled: true,
      depth: .15,
      rateHz: 40
    };
    const pcm = render(r, {
        ...options('combined', 2),
        fade: true
      }, wave),
      m = measure(pcm, rate);
    expect(m.invalidSamples).toBe(0);
    expect(Math.max(...m.peak)).toBeLessThan(.2);
    expect(Math.abs(pcm[0][0])).toBe(0);
    expect(Math.abs(pcm[0].at(-1)!)).toBe(0);
    expect(m.monoPeak).toBeLessThan(.2);
  });
  it('optional AM actually turns off and stays independent of noise', () => {
    const r = duplicate(PRESETS[0]),
      off = render(r, options('tones', .2), wave);
    r.modulations.am.depth = .15;
    r.modulations.am.enabled = true;
    expect(render(r, options('tones', .2), wave)).not.toEqual(off);
    expect(render(r, options('noise', .2), wave)).toEqual(render(PRESETS[0], options('noise', .2), wave));
    r.modulations.am.enabled = false;
    expect(render(r, options('tones', .2), wave)).toEqual(off);
  });
  it('exports correct stereo PCM metadata and refuses bad/oversized samples', () => {
    const pcm = render(PRESETS[1], options('combined', .2), wave),
      wav = encodeWav(pcm, rate),
      v = new DataView(wav);
    expect(wav.byteLength).toBe(44 + rate * .2 * 4);
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(rate);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(rate * .2 * 4);
    expect(() => render(PRESETS[0], options('tones', 121), wave)).toThrow('120s');
    expect(() => render(PRESETS[0], {
      ...options(),
      sampleRate: 8000
    }, wave)).toThrow();
    expect(() => encodeWav([new Float32Array([NaN]), new Float32Array([0])], rate)).toThrow('Invalid PCM');
  });
  it('matches using attenuation only and identifies silence', () => {
    const a = measure(render(PRESETS[0], options('combined', 2), wave), rate),
      b = measure(render(PRESETS[1], options('combined', 2), wave), rate),
      m = matchLevels(a, b);
    expect(m.a).toBeLessThanOrEqual(1);
    expect(m.b).toBeLessThanOrEqual(1);
    expect(Math.sqrt((a.rms[0] ** 2 + a.rms[1] ** 2) / 2) * m.a).toBeCloseTo(Math.sqrt((b.rms[0] ** 2 + b.rms[1] ** 2) / 2) * m.b, 12);
  });
});
