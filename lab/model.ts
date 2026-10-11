import { toneRecipe } from '../src/audio/binaural';
import { signalProfile } from '../src/meditation/profile';
export const ENGINE_VERSION = '4c.1.0';
export type Selection = 'combined' | 'tones' | 'noise';
export type Knot = {
  at: number;
  hz: number;
};
export type Pair = {
  id: string;
  enabled: boolean;
  solo: boolean;
  leftHz: number;
  deltaHz: number;
  gain: number;
  leftPhase: number;
  rightPhase: number;
  curve: Knot[];
  interpolation: 'linear' | 'smooth';
};
export interface Recipe {
  schemaVersion: 1;
  engineVersion: typeof ENGINE_VERSION;
  revision: number;
  id: string;
  version: 1;
  name: string;
  description: string;
  intentLabel: string;
  sourceClassification: '4b-reference' | 'published-demonstration' | 'original-experiment';
  provenance: string;
  sampleSeed: number;
  carrierPairs: Pair[];
  noise: {
    kind: 'off' | 'warm-static' | 'warm-phased';
    level: number;
    movementDepth: number;
    sweepHz: number;
    delaySeconds: number;
    mix: number;
    width: number;
    phase: number;
    spectralProfile: '4b-warm';
    stereoRelation: 'centered' | 'correlated-delay';
  };
  modulations: {
    am: {
      enabled: boolean;
      rateHz: number;
      depth: number;
      phase: number;
      channelPhase: number;
      target: 'tones';
      shape: 'sine';
    };
  };
  timeline: {
    durationSeconds: number;
    entrySeconds: number;
    returnSeconds: number;
    anchorDomain: 'steady';
  };
  output: {
    level: number;
    toneLevel: number;
    fadeSeconds: number;
    ceiling: '4b-static';
    trim: 0.25;
  };
}
export function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
const fail = (at: string, message: string): never => {
  throw new Error(`${at}: ${message}`);
};
function object(value: unknown, keys: string[], at: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(at, 'expected an object');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(v, k))) return fail(at, 'unsupported or missing fields; use a complete version 1 recipe');
  return v;
}
function number(value: unknown, min: number, max: number, at: string, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) fail(at, `use ${integer ? 'a whole' : 'a finite'} number from ${min} to ${max}`);
  return value as number;
}
function text(value: unknown, at: string, max = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(at, `use text of 1–${max} characters`);
}
function choice(value: unknown, choices: unknown[], at: string) {
  if (!choices.includes(value)) fail(at, `expected ${choices.join(' / ')}`);
}
function boolean(value: unknown, at: string) {
  if (typeof value !== 'boolean') fail(at, 'expected true or false');
}
export function validateRecipe(value: unknown): Recipe {
  const r = object(value, ['schemaVersion', 'engineVersion', 'revision', 'id', 'version', 'name', 'description', 'intentLabel', 'sourceClassification', 'provenance', 'sampleSeed', 'carrierPairs', 'noise', 'modulations', 'timeline', 'output'], 'Recipe');
  choice(r.schemaVersion, [1], 'Schema');
  choice(r.engineVersion, [ENGINE_VERSION], 'Engine');
  choice(r.version, [1], 'Preset version');
  number(r.revision, 1, 100000, 'Revision', true);
  for (const k of ['id', 'name', 'description', 'intentLabel', 'provenance']) text(r[k], k, k === 'id' ? 80 : 1000);
  choice(r.sourceClassification, ['4b-reference', 'published-demonstration', 'original-experiment'], 'Source');
  number(r.sampleSeed, 1, 4294967295, 'Seed', true);
  if (!Array.isArray(r.carrierPairs) || r.carrierPairs.length > 6) fail('Pairs', 'at most six pairs');
  const ids = new Set<string>();
  (r.carrierPairs as unknown[]).forEach((value, i) => {
    const at = `Pair ${i + 1}`,
      p = object(value, ['id', 'enabled', 'solo', 'leftHz', 'deltaHz', 'gain', 'leftPhase', 'rightPhase', 'curve', 'interpolation'], at);
    text(p.id, at, 80);
    if (ids.has(p.id as string)) fail(at, 'duplicate pair ID');
    ids.add(p.id as string);
    boolean(p.enabled, at);
    boolean(p.solo, at);
    number(p.leftHz, 60, 1000, at);
    number(p.deltaHz, 0, 30, at);
    number((p.leftHz as number) + (p.deltaHz as number), 60, 1000, `${at} right Hz`);
    number(p.gain, 0, 1, `${at} gain`);
    number(p.leftPhase, -Math.PI, Math.PI, at);
    number(p.rightPhase, -Math.PI, Math.PI, at);
    choice(p.interpolation, ['linear', 'smooth'], at);
    if (!Array.isArray(p.curve) || p.curve.length > 8 || p.curve.length === 1) fail(at, 'curve must be empty (fixed) or contain 2–8 waypoints');
    let previous = -1;
    (p.curve as unknown[]).forEach((v, j) => {
      const k = object(v, ['at', 'hz'], `${at} waypoint`);
      const position = number(k.at, 0, 1, at);
      if (position <= previous) fail(at, 'waypoints must increase');
      previous = position;
      number(k.hz, 60, 1000, at);
      number((k.hz as number) + (p.deltaHz as number), 60, 1000, at);
      if (j === 0 && position !== 0 || j === (p.curve as unknown[]).length - 1 && position !== 1) fail(at, 'first/last waypoints must be 0 and 1');
    });
    if ((p.curve as Knot[]).length && (p.curve as Knot[])[0].hz !== p.leftHz) fail(at, 'left Hz must match the first waypoint');
  });
  const n = object(r.noise, ['kind', 'level', 'movementDepth', 'sweepHz', 'delaySeconds', 'mix', 'width', 'phase', 'spectralProfile', 'stereoRelation'], 'Noise');
  choice(n.kind, ['off', 'warm-static', 'warm-phased'], 'Noise kind');
  choice(n.spectralProfile, ['4b-warm'], 'Spectral profile');
  choice(n.stereoRelation, ['centered', 'correlated-delay'], 'Stereo relationship');
  if (n.stereoRelation !== (n.kind === 'warm-phased' ? 'correlated-delay' : 'centered')) fail('Noise', 'stereo relationship must agree with noise kind');
  number(n.level, 0, .35, 'Noise level');
  number(n.movementDepth, 0, .8, 'Movement depth');
  number(n.sweepHz, .001, .25, 'Movement rate');
  number(n.delaySeconds, .0001, .008, 'Delay');
  number(n.mix, 0, .3, 'Delay mix');
  number(n.width, 0, 1, 'Width');
  number(n.phase, -Math.PI, Math.PI, 'Noise phase');
  const m = object(r.modulations, ['am'], 'Modulations'),
    am = object(m.am, ['enabled', 'rateHz', 'depth', 'phase', 'channelPhase', 'target', 'shape'], 'AM');
  boolean(am.enabled, 'AM');
  number(am.rateHz, .01, 40, 'AM rate');
  number(am.depth, 0, .15, 'AM depth');
  number(am.phase, -Math.PI, Math.PI, 'AM phase');
  number(am.channelPhase, -Math.PI, Math.PI, 'AM channel phase');
  choice(am.target, ['tones'], 'AM target');
  choice(am.shape, ['sine'], 'AM shape');
  const t = object(r.timeline, ['durationSeconds', 'entrySeconds', 'returnSeconds', 'anchorDomain'], 'Timeline');
  number(t.durationSeconds, 600, 3600, 'Session duration', true);
  number(t.entrySeconds, 0, 600, 'Entry');
  number(t.returnSeconds, 0, 600, 'Return');
  if ((t.entrySeconds as number) + (t.returnSeconds as number) >= (t.durationSeconds as number)) fail('Timeline', 'entry plus return must be shorter than session');
  choice(t.anchorDomain, ['steady'], 'Anchor domain');
  const o = object(r.output, ['level', 'toneLevel', 'fadeSeconds', 'ceiling', 'trim'], 'Output');
  number(o.level, 0, 1, 'Listening level');
  number(o.toneLevel, 0, .3, 'Tone level');
  number(o.fadeSeconds, .05, 2, 'Fade');
  choice(o.ceiling, ['4b-static'], 'Ceiling');
  choice(o.trim, [.25], 'Trim');
  // Clone, never retain the caller's mutable object or reinterpret unknown keys.
  return JSON.parse(JSON.stringify(value)) as Recipe;
}
export function importRecipe(json: string) {
  if (json.length > 65536) fail('Import', 'maximum recipe file is 64 KiB');
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return fail('Import', 'invalid JSON; original file is unchanged');
  }
  return validateRecipe(value);
}
export const exportRecipe = (r: Recipe) => JSON.stringify(validateRecipe(r), null, 2) + '\n';
export function duplicate(r: Recipe, name = `${r.name} — my draft`): Recipe {
  return validateRecipe({
    ...structuredClone(r),
    id: `draft-${r.id}`.slice(0, 80),
    name,
    revision: r.revision + 1,
    sourceClassification: 'original-experiment',
    provenance: `Edited from ${r.id} v${r.version}. ${r.provenance}`.slice(0, 1000)
  });
}
export function pair(leftHz: number, deltaHz = 4, gain = 1, id = 'pair-1'): Pair {
  return {
    id,
    enabled: true,
    solo: false,
    leftHz,
    deltaHz,
    gain,
    leftPhase: 0,
    rightPhase: 0,
    curve: [],
    interpolation: 'smooth'
  };
}
function base(id: string, name: string, description: string, intentLabel: string, carrierPairs: Pair[]): Recipe {
  const profile = signalProfile(1800);
  return {
    schemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    revision: 1,
    id,
    version: 1,
    name,
    description,
    intentLabel,
    sourceClassification: 'original-experiment',
    provenance: 'Original Breathwork Buddy experiment. No commercial recording or Focus-level formula reconstructed.',
    sampleSeed: 104729,
    carrierPairs,
    noise: {
      kind: 'warm-phased',
      level: .1,
      movementDepth: .25,
      sweepHz: .125,
      delaySeconds: .002,
      mix: .12,
      width: .4,
      phase: 0,
      spectralProfile: '4b-warm',
      stereoRelation: 'correlated-delay'
    },
    modulations: {
      am: {
        enabled: false,
        rateHz: 4,
        depth: 0,
        phase: 0,
        channelPhase: 0,
        target: 'tones',
        shape: 'sine'
      }
    },
    timeline: {
      durationSeconds: 1800,
      entrySeconds: profile.entry,
      returnSeconds: profile.return,
      anchorDomain: 'steady'
    },
    output: {
      level: .8,
      toneLevel: .08,
      fadeSeconds: .5,
      ceiling: '4b-static',
      trim: .25
    }
  };
}
const reference = base('reference', 'Reference', 'Original 4B Warm + Layered. Static, centered Warm; three 4 Hz pairs.', 'Familiar control', toneRecipe('layered').map((p, i) => pair(p.left, p.right - p.left, 1, `pair-${i + 1}`)));
reference.sourceClassification = '4b-reference';
reference.provenance = 'Uses unchanged 4B maskingSteps, toneRecipe values, 0.14 tone multiplier, 1/√3 energy normalization, default levels, 30-minute envelope and 0.25 output trim. Seeded sample realization; custom sample synthesis vs native oscillators, not a byte-identical session capture.';
reference.noise.kind = 'warm-static';
reference.noise.stereoRelation = 'centered';
reference.noise.movementDepth = 0;
const threshold = base('threshold', 'Threshold', 'Published Septon tones with our gentle phased-Warm experiment.', 'Stable and subdued', [pair(200, 4, 1, 'pair-1'), pair(204, 4, 1, 'pair-2'), pair(208, 4, 1, 'pair-3')]);
threshold.provenance = 'US5356368A published Septon tonal table. Combined Warm, delay coefficients and gains are our original design, not a patent-exact reconstruction.';
const expansion = base('expansion', 'Expansion', 'A quieter 6 Hz middle layer between two 4 Hz pairs; a little more width.', 'Explore a spacious field', [pair(194, 4, 1, 'pair-1'), pair(245, 6, .6, 'pair-2'), pair(292, 4, 1, 'pair-3')]);
expansion.noise = {
  ...expansion.noise,
  movementDepth: .35,
  mix: .16,
  width: .65,
  sweepHz: .08
};
const timeless = base('timeless', 'Timeless', 'One 2 Hz pair and a restrained, slowly moving Warm field.', 'Explore stillness', [pair(200, 2), {
  ...pair(275, 2, .6, 'pair-2'),
  enabled: false
}]);
timeless.noise = {
  ...timeless.noise,
  movementDepth: .12,
  mix: .08,
  width: .25,
  sweepHz: .005
};
const open = base('open', 'Open Exploration', 'A fixed 4 Hz difference with left carriers gliding 160 → 240 → 320 Hz.', 'Explore gradual pitch change', [{
  ...pair(160, 4),
  curve: [{
    at: 0,
    hz: 160
  }, {
    at: .5,
    hz: 240
  }, {
    at: 1,
    hz: 320
  }]
}]);
open.noise = {
  ...open.noise,
  movementDepth: .2,
  mix: .1,
  width: .35,
  sweepHz: .02
};
open.provenance = 'PCC January 2025 README: exploration of carrier variation and independently coded signals; Campbell official material: personal experimentation. 160/240/320 waypoints and fixed 4 Hz are our values, not Campbell/PCC settings.';
export const PRESETS = deepFreeze([reference, threshold, expansion, timeless, open].map(validateRecipe)) as readonly Recipe[];
export function activePairs(r: Recipe) {
  const enabled = r.carrierPairs.filter(p => p.enabled && p.gain > 0),
    solo = enabled.some(p => p.solo);
  return enabled.filter(p => !solo || p.solo);
}
export function gains(r: Recipe) {
  const pairs = activePairs(r),
    norm = Math.sqrt(pairs.reduce((s, p) => s + p.gain * p.gain, 0));
  return pairs.map(p => ({
    pair: p,
    gain: p.gain / Math.max(1, norm)
  }));
}
export function diagnostic(r: Recipe, kind: 'septon' | 'single' | 'all4' | '375' | 'fixed' | 'static' | 'movement-off') {
  const d = duplicate(r);
  if (kind === 'septon') {
    d.name = 'Septon — published tones only';
    d.sourceClassification = 'published-demonstration';
    d.carrierPairs = structuredClone(threshold.carrierPairs);
    d.noise.kind = 'off';
    d.noise.stereoRelation = 'centered';
  }
  if (kind === 'single') {
    d.name = 'Single pair — 200 / 204 Hz';
    d.carrierPairs = [pair(200, 4)];
    d.noise.kind = 'off';
    d.noise.stereoRelation = 'centered';
  }
  if (kind === 'all4') {
    d.name = 'Expansion — all 4 Hz comparison';
    d.carrierPairs = d.carrierPairs.map(p => ({
      ...p,
      deltaHz: 4
    }));
  }
  if (kind === '375') {
    d.name = 'Timeless — 3.75 Hz experiment';
    d.carrierPairs = d.carrierPairs.map(p => ({
      ...p,
      deltaHz: 3.75
    }));
  }
  if (kind === 'fixed') {
    d.name = 'Open Exploration — fixed 160 / 164';
    d.carrierPairs = [pair(160, 4)];
  }
  if (kind === 'static') {
    d.name += ' — static Warm';
    d.noise.kind = 'warm-static';
    d.noise.stereoRelation = 'centered';
  }
  if (kind === 'movement-off') {
    d.name += ' — movement Off';
    d.noise.movementDepth = 0;
    d.modulations.am.enabled = false;
  }
  return validateRecipe(d);
}
