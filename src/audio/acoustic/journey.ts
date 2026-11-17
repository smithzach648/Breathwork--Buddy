import { PRESETS, validateRecipe, type Recipe } from './model';
import { Synth, validateOptions, type RenderOptions, type LayerMix } from './dsp';
export const JOURNEY_ENGINE_VERSION = 'journey.1.0';
export interface JourneyStage {
  id: string;
  durationSeconds: number;
  recipe: Recipe;
}
export interface Journey {
  kind: 'journey';
  schemaVersion: 1;
  engineVersion: typeof JOURNEY_ENGINE_VERSION;
  id: string;
  name: string;
  sampleSeed: number;
  transitionSeconds: number;
  transitionShape: 'smoothstep';
  layerEnvelope: 'steady';
  sourcePolicy: 'shared-warm';
  stages: JourneyStage[];
  timeline: {
    durationSeconds: number;
  };
  output: {
    level: number;
    fadeSeconds: number;
  };
}
function fail(message: string): never {
  throw new Error(`Journey: ${message}`);
}
function object(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  const r = value as Record<string, unknown>;
  if (Object.keys(r).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(r, k))) fail(`${label} has missing or unsupported fields`);
  return r;
}
function num(value: unknown, min: number, max: number, label: string, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) fail(`${label} must be ${integer ? 'a whole' : 'a finite'} number from ${min} to ${max}`);
  return value as number;
}
function label(value: unknown, at: string, max = 80) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${at} needs 1–${max} characters`);
}
export function validateJourney(value: unknown): Journey {
  const r = object(value, ['kind', 'schemaVersion', 'engineVersion', 'id', 'name', 'sampleSeed', 'transitionSeconds', 'transitionShape', 'layerEnvelope', 'sourcePolicy', 'stages', 'timeline', 'output'], 'recipe');
  if (r.kind !== 'journey' || r.schemaVersion !== 1 || r.engineVersion !== JOURNEY_ENGINE_VERSION) fail('unsupported journey schema or engine version');
  if (r.transitionShape !== 'smoothstep' || r.layerEnvelope !== 'steady' || r.sourcePolicy !== 'shared-warm') fail('unsupported transition, envelope or noise-source policy');
  label(r.id, 'ID');
  label(r.name, 'name');
  num(r.sampleSeed, 1, 4294967295, 'seed', true);
  const blend = num(r.transitionSeconds, 1, 120, 'transition seconds', true);
  if (!Array.isArray(r.stages) || r.stages.length < 1 || r.stages.length > 12) fail('use 1–12 environments');
  const ids = new Set<string>();
  let total = 0;
  for (const [index, value] of (r.stages as unknown[]).entries()) {
    const s = object(value, ['id', 'durationSeconds', 'recipe'], `environment ${index + 1}`);
    label(s.id, 'environment ID');
    if (ids.has(s.id as string)) fail('environment IDs must be unique');
    ids.add(s.id as string);
    const duration = num(s.durationSeconds, 30, 3600, 'environment seconds', true);
    total += duration;
    if (blend > duration / 2) fail(`transition must fit within half of environment ${index + 1} (${duration / 2}s maximum)`);
    const recipe = validateRecipe(s.recipe);
    if (recipe.sampleSeed !== r.sampleSeed) fail('all environment snapshots must use the shared journey seed');
    if (recipe.output.level !== 1) fail('environment snapshots use level 1; set overall volume on the journey');
  }
  if (total > 3600) fail('total duration must be at most 60 minutes');
  const timeline = object(r.timeline, ['durationSeconds'], 'timeline');
  if (timeline.durationSeconds !== total) fail('timeline duration must equal the sum of environment durations');
  const output = object(r.output, ['level', 'fadeSeconds'], 'output');
  num(output.level, 0, 1, 'listening level');
  num(output.fadeSeconds, .05, 2, 'fade seconds');
  // AudioWorkletGlobalScope does not consistently provide structuredClone.
  // Validation above admits only finite JSON data, so this is lossless and portable there.
  return JSON.parse(JSON.stringify(value)) as Journey;
}
/** Freeze effective parameters by value. The common source seed and one journey Master are explicit. */
export function stageFrom(recipe: Recipe, durationSeconds = 300, id: string = crypto.randomUUID(), seed = 104729): JourneyStage {
  const snapshot = validateRecipe(recipe);
  snapshot.sampleSeed = seed;
  snapshot.output.level = 1;
  return {
    id,
    durationSeconds,
    recipe: snapshot
  };
}
export function defaultJourney(): Journey {
  const stages = PRESETS.filter(p => p.id !== 'reference').map((p, i) => stageFrom(p, 300, `stage-${i + 1}`));
  return validateJourney({
    kind: 'journey',
    schemaVersion: 1,
    engineVersion: JOURNEY_ENGINE_VERSION,
    id: 'my-journey',
    name: 'My sound journey',
    sampleSeed: 104729,
    transitionSeconds: 20,
    transitionShape: 'smoothstep',
    layerEnvelope: 'steady',
    sourcePolicy: 'shared-warm',
    stages,
    timeline: {
      durationSeconds: 1200
    },
    output: {
      level: .8,
      fadeSeconds: 1
    }
  });
}
export function updatedJourney(journey: Journey, change: (j: Journey) => void): Journey {
  const next = structuredClone(journey);
  change(next);
  next.timeline.durationSeconds = next.stages.reduce((sum, s) => sum + s.durationSeconds, 0);
  return validateJourney(next);
}
export function exportJourney(j: Journey) {
  return JSON.stringify(validateJourney(j), null, 2) + '\n';
}
export function importJourney(json: string): Journey {
  if (json.length > 262144) fail('import must be at most 256 KiB');
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    fail('invalid JSON; original file is unchanged');
  }
  return validateJourney(value);
}
export function journeySchedule(j: Journey) {
  let start = 0;
  return j.stages.map((s, index) => {
    const row = {
      ...s,
      index,
      start,
      end: start + s.durationSeconds,
      blendStart: start + s.durationSeconds - j.transitionSeconds
    };
    start = row.end;
    return row;
  });
}
export function journeyAt(j: Journey, time: number) {
  const schedule = journeySchedule(j),
    current = schedule.find(s => time >= s.start && time < s.end);
  if (!current) return {
    current: null,
    next: null,
    mix: 0
  };
  const next = schedule[current.index + 1];
  const u = next ? Math.max(0, Math.min(1, (time - current.blendStart) / j.transitionSeconds)) : 0;
  return {
    current,
    next: u > 0 ? next : null,
    mix: u * u * (3 - 2 * u)
  };
}
/** One graph, at most two active synthesis layers, one continuous source. No per-state starts/stops or audio timers. */
export class JourneySynth {
  readonly recipe: Journey;
  readonly frames: number;
  readonly offset: number;
  private voices: {
    synth: Synth;
    start: number;
    end: number;
  }[];
  private aL = new Float32Array(0);
  private aR = new Float32Array(0);
  private bL = new Float32Array(0);
  private bR = new Float32Array(0);
  constructor(journey: Journey, readonly options: RenderOptions, wave: Float32Array) {
    this.recipe = validateJourney(journey);
    validateOptions(journey, options, true);
    this.frames = Math.round(options.durationSeconds * options.sampleRate);
    this.offset = Math.round(options.startSeconds * options.sampleRate);
    this.voices = journeySchedule(this.recipe).map(s => ({
      start: s.start * options.sampleRate,
      end: s.end * options.sampleRate,
      synth: new Synth(s.recipe, {
        ...options,
        startSeconds: 0,
        durationSeconds: s.durationSeconds,
        fade: false,
        matchGain: 1
      }, wave, {
        durationSeconds: s.durationSeconds,
        originFrames: s.start * options.sampleRate
      })
    }));
  }
  block(left: Float32Array, right: Float32Array, firstFrame: number, mix?:LayerMix) {
    if (left.length > 8192 || left.length !== right.length) throw new Error('Journey blocks must be stereo and at most 8192 frames.');
    if (this.aL.length !== left.length) {
      this.aL = new Float32Array(left.length);
      this.aR = new Float32Array(left.length);
      this.bL = new Float32Array(left.length);
      this.bR = new Float32Array(left.length);
    }
    const blendFrames = this.recipe.transitionSeconds * this.options.sampleRate,
      fadeFrames = this.recipe.output.fadeSeconds * this.options.sampleRate,
      master = this.recipe.output.level * (this.options.matchGain ?? 1);
    const absoluteStart = this.offset + firstFrame;
    // A block may straddle a boundary: divide it so each span needs at most two voices.
    let from = 0;
    while (from < left.length) {
      const absolute = absoluteStart + from,
        relative = firstFrame + from;
      if (relative >= this.frames) {
        left.fill(0, from);
        right.fill(0, from);
        break;
      }
      const index = this.voices.findIndex(s => absolute >= s.start && absolute < s.end);
      if (index < 0) {
        left.fill(0, from);
        right.fill(0, from);
        break;
      }
      const current = this.voices[index],
        next = this.voices[index + 1],
        count = Math.min(left.length - from, current.end - absolute, this.frames - relative),
        to = from + count;
      const aL = this.aL.subarray(from, to),
        aR = this.aR.subarray(from, to);
      const spanMix=mix&&(mix.warmStep||mix.binauralStep)?{...mix,warm:mix.warm+(mix.warmStep??0)*Math.min(from,mix.rampFrames??from),binaural:mix.binaural+(mix.binauralStep??0)*Math.min(from,mix.rampFrames??from),rampFrames:Math.max(0,(mix.rampFrames??left.length)-from)}:mix;
      current.synth.block(aL, aR, absolute - current.start, spanMix);
      const bL = this.bL.subarray(from, to),
        bR = this.bR.subarray(from, to);
      if (next && absolute + count > current.end - blendFrames) next.synth.block(bL, bR, absolute - next.start, spanMix);else {
        bL.fill(0);
        bR.fill(0);
      }
      for (let i = 0; i < count; i++) {
        const frame = relative + i,
          at = absolute + i,
          u = next ? Math.max(0, Math.min(1, (at - (current.end - blendFrames)) / blendFrames)) : 0,
          w = u * u * (3 - 2 * u);
        const fade = this.options.fade === false ? 1 : Math.max(0, Math.min(1, frame / fadeFrames, (this.frames - 1 - frame) / fadeFrames));
        // Convex weights preserve the coherent Warm bed's level; equal-power would boost it.
        left[from + i] = ((1 - w) * aL[i] + w * bL[i]) * master * fade;
        right[from + i] = ((1 - w) * aR[i] + w * bR[i]) * master * fade;
      }
      from = to;
    }
  }
}
