import { beforeAll, describe, expect, it, vi } from 'vitest';
// Test-runner builtin, without adding Node-specific declarations to the browser lab.
const {
  createHash
} = await vi.importActual<{
  createHash: (algorithm: 'sha256') => {
    update: (data: Uint8Array) => {
      digest: (encoding: 'hex') => string;
    };
  };
}>('node:crypto');
import { PRESETS, exportRecipe } from './model';
import { warm, render, encodeWav, measure, type RenderOptions } from './dsp';
import { defaultJourney, validateJourney, updatedJourney, stageFrom, journeySchedule, journeyAt, importJourney, exportJourney, JourneySynth, type Journey } from './journey';
import { renderProgram, validateProgram } from './program';
let wave: Float32Array;
beforeAll(() => {
  wave = warm(48000, 104729);
}, 60000);
const opts = (startSeconds = 0, durationSeconds = 2): RenderOptions => ({
  sampleRate: 48000,
  startSeconds,
  durationSeconds,
  selection: 'combined',
  fade: false
});
const short = () => updatedJourney(defaultJourney(), j => {
  j.stages.forEach(s => {
    s.durationSeconds = 30;
  });
  j.transitionSeconds = 10;
});
describe('journey data and exact timing', () => {
  it('starts with the four approved environments, twenty minutes and pinned copies', () => {
    const j = defaultJourney();
    expect(j.stages.map(s => s.recipe.id)).toEqual(['threshold', 'expansion', 'timeless', 'open']);
    expect(j.timeline.durationSeconds).toBe(1200);
    expect(journeySchedule(j).map(s => [s.start, s.end, s.blendStart])).toEqual([[0, 300, 280], [300, 600, 580], [600, 900, 880], [900, 1200, 1180]]);
    j.stages[0].recipe.carrierPairs[0].leftHz = 201;
    expect(PRESETS[1].carrierPairs[0].leftHz).toBe(200);
  });
  it('round-trips a complete journey, keeping imported originals and standalone formats separate', () => {
    const j = short(),
      json = exportJourney(j);
    expect(exportJourney(importJourney(json))).toBe(json);
    expect(validateProgram(JSON.parse(json))).toEqual(j);
    expect(() => importJourney(exportRecipe(PRESETS[0]))).toThrow();
    expect(() => importJourney('{')).toThrow('invalid JSON');
    expect(() => importJourney(' '.repeat(262145))).toThrow('256 KiB');
  });
  const invalid: [string, (j: Journey) => void][] = [['future schema', j => Object.assign(j, {
    schemaVersion: 2
  })], ['unknown field', j => Object.assign(j, {
    script: 'run'
  })], ['unsupported engine', j => Object.assign(j, {
    engineVersion: 'next'
  })], ['unsupported shape', j => Object.assign(j, {
    transitionShape: 'cut'
  })], ['empty sequence', j => {
    j.stages = [];
  }], ['excess stops', j => {
    j.stages = Array.from({
      length: 13
    }, (_, i) => stageFrom(PRESETS[1], 30, String(i)));
  }], ['duplicate stop IDs', j => {
    j.stages[1].id = j.stages[0].id;
  }], ['too short', j => {
    j.stages[0].durationSeconds = 0;
  }], ['fractional seconds', j => {
    j.stages[0].durationSeconds = 60.5;
  }], ['NaN', j => {
    j.transitionSeconds = NaN;
  }], ['no fade transition', j => {
    j.transitionSeconds = 0;
  }], ['overlapping three voices', j => {
    j.transitionSeconds = 160;
  }], ['excess total', j => {
    j.stages.forEach(s => {
      s.durationSeconds = 3600;
    });
    j.timeline.durationSeconds = 14400;
  }], ['wrong total', j => {
    j.timeline.durationSeconds = 1;
  }], ['different noise seed', j => {
    j.stages[0].recipe.sampleSeed = 42;
  }], ['double master', j => {
    j.stages[0].recipe.output.level = .8;
  }], ['excess volume', j => {
    j.output.level = 2;
  }], ['negative fade', j => {
    j.output.fadeSeconds = -1;
  }], ['corrupt nested recipe', j => {
    j.stages[0].recipe.carrierPairs[0].deltaHz = 100;
  }], ['unknown nested field', j => {
    Object.assign(j.stages[0], {
      run: 'script'
    });
  }]];
  it.each(invalid)('rejects %s without coercion', (_name, change) => {
    const j = defaultJourney();
    change(j);
    expect(() => validateJourney(j)).toThrow();
  });
  it('allows repetition/reordering without changing duration and handles one stop', () => {
    const j = updatedJourney(short(), j => {
      j.stages.reverse();
      j.stages.push(stageFrom(PRESETS[1], 30, 'repeat'));
    });
    expect(j.timeline.durationSeconds).toBe(150);
    expect(j.stages[0].recipe.id).toBe('open');
    const one = updatedJourney(j, j => {
      j.stages = j.stages.slice(0, 1);
    });
    expect(journeyAt(one, 20).next).toBeNull();
    expect(journeyAt(one, 30).current).toBeNull();
  });
  it('reports real smoothstep weights and exact nominal boundaries', () => {
    const j = short();
    expect(journeyAt(j, 19).mix).toBe(0);
    expect(journeyAt(j, 25).mix).toBe(.5);
    expect(journeyAt(j, 30).current?.index).toBe(1);
    expect(journeyAt(j, 29.999).mix).toBeGreaterThan(.9999);
    expect(journeyAt(j, 120).current).toBeNull();
  });
});
describe('continuous journey sample processing', () => {
  it('runs in the worklet environment without structuredClone', () => {
    const j = short();
    vi.stubGlobal('structuredClone', undefined);
    try {
      const pcm = renderProgram(j, opts(25, 1), wave);
      expect(measure(pcm, 48000).invalidSamples).toBe(0);
      expect(measure(pcm, 48000).peak[0]).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('renders finite stereo across every transition without hard edge jumps', () => {
    const j = short();
    for (const boundary of [20, 30, 50, 60, 80, 90]) {
      const pcm = renderProgram(j, opts(boundary - 1, 2), wave),
        m = measure(pcm, 48000);
      expect(m.invalidSamples).toBe(0);
      expect(Math.max(...m.peak)).toBeLessThan(.08);
      const n = 48000;
      expect(Math.abs(pcm[0][n] - pcm[0][n - 1])).toBeLessThan(.002);
      expect(Math.abs(pcm[1][n] - pcm[1][n - 1])).toBeLessThan(.002);
    }
  });
  it('keeps a centered shared Warm bed continuous without a crossfade bump or source restart', () => {
    const j = short();
    j.stages.forEach(s => {
      s.recipe = stageFrom(PRESETS[0], s.durationSeconds, s.id, j.sampleSeed).recipe;
      s.recipe.carrierPairs = [];
    });
    const pcm = renderProgram(j, {
      ...opts(18, 15),
      selection: 'noise'
    }, wave);
    let max = 0;
    for (let i = 0; i < pcm[0].length; i++) {
      const expected = wave[(18 * 48000 + i) % wave.length] * .1 * .25 * j.output.level;
      max = Math.max(max, Math.abs(pcm[0][i] - expected));
      expect(pcm[0][i]).toBe(pcm[1][i]);
    }
    expect(max).toBeLessThan(1e-9);
  }, 15000);
  it('is deterministic when seeking into and beyond transitions', () => {
    const j = short(),
      full = renderProgram(j, opts(18, 15), wave),
      seek = renderProgram(j, opts(24, 5), wave);
    expect(full[0].slice(6 * 48000, 11 * 48000)).toEqual(seek[0]);
    expect(full[1].slice(6 * 48000, 11 * 48000)).toEqual(seek[1]);
  });
  it('is identical for worklet-sized blocks and offline chunks, including a boundary inside a block', () => {
    const j = short(),
      o = opts(29.999, 1.013),
      s = new JourneySynth(j, o, wave),
      pcm = renderProgram(j, o, wave),
      l = new Float32Array(s.frames),
      r = new Float32Array(s.frames);
    for (let frame = 0; frame < s.frames; frame += 128) s.block(l.subarray(frame, frame + 128), r.subarray(frame, frame + 128), frame);
    expect([l, r]).toEqual(pcm);
  });
  it('only fades the entire audition and keeps off/mute truly silent', () => {
    const j = short(),
      pcm = renderProgram(j, {
        ...opts(25, 2),
        fade: true
      }, wave);
    expect(Math.abs(pcm[0][0])).toBe(0);
    expect(Math.abs(pcm[0].at(-1)!)).toBe(0);
    j.output.level = 0;
    expect(measure(renderProgram(j, opts(25, 2), wave), 48000).peak).toEqual([0, 0]);
  });
  it('caps WAVs and total duration but supports a single full-hour live stop', () => {
    const j = updatedJourney(defaultJourney(), j => {
      j.stages = [stageFrom(PRESETS[4], 3600, 'hour')];
    });
    expect(new JourneySynth(j, opts(3598, 2), wave).frames).toBe(96000);
    expect(() => renderProgram(j, opts(0, 121), wave)).toThrow('120s');
    const wav = encodeWav(renderProgram(j, opts(3598, 2), wave), 48000);
    expect(wav.byteLength).toBe(44 + 48000 * 2 * 4);
  });
  it('does not mutate snapshots, even when using internal stage time mapping', () => {
    const j = short(),
      before = exportJourney(j);
    renderProgram(j, opts(25, 2), wave);
    expect(exportJourney(j)).toBe(before);
  });
  const golden = [['reference', 'c14ad5cad8f8481f37678098002d3157d6c63e80fdb692298d261fbbbb97f205'], ['threshold', 'b4b49d2c8d8a17978590abb3c130505539b44f313f090b15cd27155b40a9af0f'], ['expansion', '6ab5af1ac464a7ce49272b22b99654372016298fa0834c4220cb7361cee9eece'], ['timeless', 'f79d0decb9ed0f8c0f42ae94b383729aa3422de65ee77446136579deaae161a0'], ['open', '6aaf5c6bf53970953f93376ee0a4d54872145afc13f0bb389904543de29ba855']];
  it.each(golden)('keeps the approved %s standalone WAV byte-identical', (id, sha) => {
    const r = PRESETS.find(p => p.id === id)!,
      pcm = render(r, {
        ...opts(900, 30),
        fade: true
      }, wave),
      actual = createHash('sha256').update(new Uint8Array(encodeWav(pcm, 48000))).digest('hex');
    expect(actual).toBe(sha);
  }, 15000);
});
