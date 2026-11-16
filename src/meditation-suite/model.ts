import { PRESETS, deepFreeze, type Recipe } from '../audio/acoustic/model';
import { stageFrom, validateJourney, type Journey } from '../audio/acoustic/journey';
import type { PlannedStage, Phase } from '../session/config';

export const SUITE_VERSION = 'meditation-suite.1.0';
export const JOURNEY_AUDIO_ASSETS = deepFreeze({ bowl: 'signals.bowl', bowlSha256: 'a51cd3515750342723df6db5322878534b11e9661be69d7f73241b0a8ffda1ee', voice: [] as string[] });
export type JourneyId = 'foundation' | 'beyond' | 'preparation';
export type GuidanceStyle = 'guided' | 'familiar';
export type BreathingChoice = '5-5' | '4-7-8' | '4-4-6' | 'natural';
export type Section = 'ecb' | 'breathwork' | 'relaxation' | 'tuning' | 'space' | 'affirmation' | 'entry' | 'threshold' | 'expansion' | 'timeless' | 'return';
export interface JourneyConfig {
  kind: 'meditation-journey';
  schemaVersion: 1;
  suiteVersion: typeof SUITE_VERSION;
  presetId: JourneyId;
  guidance: GuidanceStyle;
  breathing: BreathingChoice;
  humming: boolean;
  surroundingSpace: boolean;
  affirmation: 'secular' | 'spiritual';
  levels: { environment: number; breathingTones: number; voice: number; bowl: number };
  toneVersion: 'major-steps.1';
  narrationVersion: 'preparation-text.1';
  audioAssets: typeof JOURNEY_AUDIO_ASSETS;
  breathingIntroSeconds: 0;
  interruptionPolicy: 'clock-continues-next-inhale';
  sound: Journey;
}
export const JOURNEYS = [
  { id: 'foundation' as const, name: 'The Foundation', seconds: 1500, description: 'A familiar preparation, a steady place to rest, and a gentle return.', route: '10 min preparation · 12 min Threshold · 3 min return' },
  { id: 'beyond' as const, name: 'Beyond the Familiar', seconds: 2100, description: 'Settle, explore a little more spaciousness, then spend time in stillness.', route: '10 min preparation · 8 min Threshold · 9 min Expansion · 5 min Timeless · 3 min return' },
] as const;
export const preparationRehearsal = {id:'preparation' as const,name:'Preparation rehearsal',seconds:780};
export const journeyDefinition = (id: JourneyId) => id === 'preparation' ? preparationRehearsal : JOURNEYS.find(j => j.id === id)!;
export const BREATHING = {
  '5-5': { name: '5 in / 5 out', seconds: [5, 0, 5, 0], cycles: 18 },
  '4-7-8': { name: '4 in / 7 hold / 8 out', seconds: [4, 7, 8, 0], cycles: 4 },
  '4-4-6': { name: '4 in / 4 hold / 6 out', seconds: [4, 4, 6, 0], cycles: 12 },
  natural: { name: 'Natural breathing', seconds: [0, 0, 0, 0], cycles: 0 },
} as const;
export const SECTION_NAMES: Record<Section, string> = { ecb: 'Energy Conversion Box', breathwork: 'Breathwork', relaxation: 'Body relaxation', tuning: 'Resonant tuning', space: 'Surrounding-space awareness', affirmation: 'Affirmation & intention', entry: 'Settling into the journey', threshold: 'Threshold', expansion: 'Expansion', timeless: 'Timeless', return: 'Returning to the room' };

function soundPlan(id: JourneyId): Journey {
  const preset = (name: string) => PRESETS.find(p => p.id === name)!;
  const warm = JSON.parse(JSON.stringify(preset('threshold'))) as Recipe;
  warm.id = 'suite-preparation-warm'; warm.name = 'Preparation Warm';
  warm.description = 'Continuous Warm preparation, without carrier tones.';
  warm.carrierPairs.forEach(p => { p.enabled = false; });
  const scene = (name: string, seconds: number) => stageFrom(preset(name), seconds, `suite-${name}`);
  const main = id === 'preparation' ? [] : id === 'foundation' ? [scene('threshold', 720)] : [scene('threshold', 480), scene('expansion', 540), scene('timeless', 300)];
  return validateJourney({ kind: 'journey', schemaVersion: 1, engineVersion: 'journey.1.0', id: `suite-${id}`, name: journeyDefinition(id).name, sampleSeed: 104729, transitionSeconds: 20, transitionShape: 'smoothstep', layerEnvelope: 'steady', sourcePolicy: 'shared-warm', stages: [stageFrom(warm, 600, 'suite-preparation'), ...main, stageFrom(main.at(-1)?.recipe ?? warm, 180, 'suite-return')], timeline: { durationSeconds: journeyDefinition(id).seconds }, output: { level: 1, fadeSeconds: 1 } });
}
export function createJourneyConfig(id: JourneyId, options: Partial<Pick<JourneyConfig, 'guidance' | 'breathing' | 'humming' | 'surroundingSpace' | 'affirmation' | 'levels'>> = {}): JourneyConfig {
  if (!['foundation','beyond','preparation'].includes(id)) throw new Error('Choose a supported meditation journey.');
  return validateJourneyConfig({ kind: 'meditation-journey', schemaVersion: 1, suiteVersion: SUITE_VERSION, presetId: id, guidance: 'guided', breathing: '5-5', humming: true, surroundingSpace: true, affirmation: 'secular', levels: { environment: .8, breathingTones: .45, voice: 1, bowl: .45 }, toneVersion: 'major-steps.1', narrationVersion: 'preparation-text.1', audioAssets: JOURNEY_AUDIO_ASSETS, breathingIntroSeconds: 0, interruptionPolicy: 'clock-continues-next-inhale', sound: soundPlan(id), ...options });
}
export function validateJourneyConfig(input: unknown): JourneyConfig {
  const c = input as JourneyConfig;
  const keys = ['kind', 'schemaVersion', 'suiteVersion', 'presetId', 'guidance', 'breathing', 'humming', 'surroundingSpace', 'affirmation', 'levels', 'toneVersion', 'narrationVersion', 'audioAssets', 'breathingIntroSeconds', 'interruptionPolicy', 'sound'];
  if (!c || typeof c !== 'object' || Array.isArray(c) || Object.keys(c).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(c, k)) || c.kind !== 'meditation-journey' || c.schemaVersion !== 1 || c.suiteVersion !== SUITE_VERSION || !['foundation','beyond','preparation'].includes(c.presetId) || !['guided', 'familiar'].includes(c.guidance) || !Object.hasOwn(BREATHING, c.breathing) || typeof c.humming !== 'boolean' || typeof c.surroundingSpace !== 'boolean' || !['secular', 'spiritual'].includes(c.affirmation) || c.toneVersion !== 'major-steps.1' || c.narrationVersion !== 'preparation-text.1' || c.breathingIntroSeconds !== 0 || c.interruptionPolicy !== 'clock-continues-next-inhale') throw new Error('Unsupported meditation journey settings.');
  const levelKeys = ['environment', 'breathingTones', 'voice', 'bowl'];
  if (JSON.stringify(c.audioAssets) !== JSON.stringify(JOURNEY_AUDIO_ASSETS)) throw new Error('Unsupported journey audio assets.');
  if (!c.levels || Object.keys(c.levels).length !== 4 || levelKeys.some(k => !Object.hasOwn(c.levels, k) || !Number.isFinite(c.levels[k as keyof typeof c.levels]) || c.levels[k as keyof typeof c.levels] < 0 || c.levels[k as keyof typeof c.levels] > 1)) throw new Error('Journey audio levels must be between 0 and 1.');
  validateJourney(c.sound);
  // A snapshot carries the exact immutable acoustic recipes, not a lookup to mutable defaults.
  if (JSON.stringify(c.sound) !== JSON.stringify(soundPlan(c.presetId))) throw new Error('The version 1 journey sound snapshot does not match its recipe.');
  return JSON.parse(JSON.stringify(c)) as JourneyConfig;
}

const phases: Phase[] = ['inhale', 'hold-in', 'exhale', 'hold-out'];
/** Whole cycles only. The remaining budget is explicitly natural breathing, never a clipped phase. */
export function breathworkStages(choice: BreathingChoice, introSeconds = 0): PlannedStage[] {
  if (!Object.hasOwn(BREATHING, choice) || !Number.isInteger(introSeconds) || introSeconds < 0 || introSeconds > 30) throw new Error('Invalid breathwork window.');
  const p = BREATHING[choice], cycleSeconds = p.seconds.reduce<number>((a, b) => a + b, 0);
  const cycles = cycleSeconds ? Math.min(p.cycles, Math.floor((180 - introSeconds) / cycleSeconds)) : 0;
  const result: PlannedStage[] = [];
  const add = (phase: Phase, label: string, seconds: number, cycle = 0) => { if (seconds) result.push({ phase, label, durationMs: seconds * 1000, round: 0, totalRounds: 0, cycle, totalCycles: cycles, journeySection: 'breathwork' }); };
  add('journey-preparation', 'Breathing introduction', introSeconds);
  for (let cycle = 1; cycle <= cycles; cycle++) p.seconds.forEach((seconds, index) => add(phases[index], ['Breathe in', 'Comfortable hold', 'Breathe out', 'Comfortable rest'][index], seconds, cycle));
  add('natural-settling', 'Breathe naturally', 180 - introSeconds - cycles * cycleSeconds);
  return result;
}
export function compileJourney(config: JourneyConfig): PlannedStage[] {
  const c = validateJourneyConfig(config);
  const section = (name: Section, seconds: number, phase: Phase = 'journey-preparation'): PlannedStage => ({ phase, label: SECTION_NAMES[name], durationMs: seconds * 1000, round: 0, totalRounds: 0, cycle: 0, totalCycles: 0, journeySection: name });
  const main = c.presetId === 'preparation' ? [] : c.presetId === 'foundation' ? [section('threshold', 720, 'journey-rest')] : [section('threshold', 480, 'journey-rest'), section('expansion', 540, 'journey-rest'), section('timeless', 300, 'journey-rest')];
  const stages = [section('ecb', 90), ...breathworkStages(c.breathing, c.breathingIntroSeconds), section('relaxation', 120), section('tuning', 60), section('space', 60), section('affirmation', 30), section('entry', 60), ...main, section('return', 180, 'journey-return')];
  if (stages.reduce((sum, s) => sum + s.durationMs, 0) !== c.sound.timeline.durationSeconds * 1000) throw new Error('Journey budget does not balance.');
  return stages;
}
export function timeline(config: JourneyConfig) {
  let start = 0;
  return compileJourney(config).map(stage => { const row = { stage, start, end: start + stage.durationMs / 1000 }; start = row.end; return row; });
}
/** Resume never introduces an unexplained hold or partial paced inhale. */
export function nextInhale(config: JourneyConfig, elapsedSeconds: number) {
  return timeline(config).find(row => row.start >= elapsedSeconds - .001 && row.stage.phase === 'inhale')?.start ?? 270;
}
export const freezeJourney = (config: JourneyConfig) => deepFreeze(validateJourneyConfig(config));
