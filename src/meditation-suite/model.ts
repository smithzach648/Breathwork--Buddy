import { PRESETS, deepFreeze, type Recipe } from '../audio/acoustic/model';
import { stageFrom, validateJourney, type Journey } from '../audio/acoustic/journey';
import type { PlannedStage, Phase } from '../session/config';
import { LAYER_GAIN, MIX_VERSION, normalizeMix, presetMix, validMix, type ListenerMix, type MixPreset } from './mix';
import { APPROVED_NARRATION } from './voice-assets';

export const SUITE_VERSION = 'meditation-suite.1.1';
export const LEGACY_AUDIO_ASSETS = deepFreeze({ bowl: 'signals.bowl', bowlSha256: 'a51cd3515750342723df6db5322878534b11e9661be69d7f73241b0a8ffda1ee', voice: [] as string[] });
export const JOURNEY_AUDIO_ASSETS = deepFreeze({...LEGACY_AUDIO_ASSETS,voice:Object.values(APPROVED_NARRATION).map(a=>a.assetId),voiceSha256:Object.fromEntries(Object.values(APPROVED_NARRATION).map(a=>[a.assetId,a.sha256]))});
export type JourneyId = 'foundation' | 'beyond' | 'preparation';
export type GuidanceStyle = 'guided' | 'familiar';
export type BreathingChoice = '5-5' | '4-7-8' | '4-4-6' | 'natural';
export type Section = 'ecb' | 'breathwork' | 'relaxation' | 'tuning' | 'space' | 'affirmation' | 'entry' | 'threshold' | 'expansion' | 'timeless' | 'return';
export interface JourneyConfig {
  kind: 'meditation-journey';
  schemaVersion: 1 | 2;
  suiteVersion: 'meditation-suite.1.0' | typeof SUITE_VERSION;
  presetId: JourneyId;
  guidance: GuidanceStyle;
  breathing: BreathingChoice;
  humming: boolean;
  surroundingSpace: boolean;
  affirmation: 'secular' | 'spiritual';
  levels: { environment: number; breathingTones: number; voice: number; bowl: number; warm?:number; binaural?:number };
  mixVersion?: typeof MIX_VERSION;
  mixPreset?: MixPreset;
  toneVersion: 'major-steps.1' | 'soft-steps.2';
  narrationVersion: 'preparation-text.1' | 'preparation-voice.2';
  audioAssets: {bowl:string;bowlSha256:string;voice:string[];voiceSha256?:Record<string,string>};
  breathingIntroSeconds: 0 | 20;
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
type JourneyOptions = Partial<Pick<JourneyConfig, 'guidance' | 'breathing' | 'humming' | 'surroundingSpace' | 'affirmation' | 'levels'>>;
/** The original factory remains an explicit read/replay regression path. Never upgrade an old snapshot in place. */
export function createLegacyJourneyConfig(id: JourneyId, options: JourneyOptions = {}): JourneyConfig {
  if (!['foundation','beyond','preparation'].includes(id)) throw new Error('Choose a supported meditation journey.');
  return validateJourneyConfig({ kind: 'meditation-journey', schemaVersion: 1, suiteVersion: 'meditation-suite.1.0', presetId: id, guidance: 'guided', breathing: '5-5', humming: true, surroundingSpace: true, affirmation: 'secular', levels: { environment: .8, breathingTones: .45, voice: 1, bowl: .45 }, toneVersion: 'major-steps.1', narrationVersion: 'preparation-text.1', audioAssets: LEGACY_AUDIO_ASSETS, breathingIntroSeconds: 0, interruptionPolicy: 'clock-continues-next-inhale', sound: soundPlan(id), ...options });
}
export function createJourneyConfig(id:JourneyId,options:Omit<JourneyOptions,'levels'> & {mix?:ListenerMix}={}):JourneyConfig {
  if('levels' in options)throw new Error('Use a versioned sound mix for a new journey.');
  const {mix:input,...rest}=options;
  const mix=input??presetMix();
  if(!validMix(mix))throw new Error('Unsupported journey sound mix.');
  const old=createLegacyJourneyConfig(id,rest);
  return validateJourneyConfig({...old,schemaVersion:2,suiteVersion:SUITE_VERSION,toneVersion:'soft-steps.2',narrationVersion:'preparation-voice.2',breathingIntroSeconds:20,mixVersion:MIX_VERSION,mixPreset:mix.preset,levels:{environment:1,...mix.levels},audioAssets:JOURNEY_AUDIO_ASSETS});
}
export function effectiveMix(config:JourneyConfig):ListenerMix {
  return config.schemaVersion===1?normalizeMix(config.levels):{version:MIX_VERSION,preset:config.mixPreset!,levels:{warm:config.levels.warm!,binaural:config.levels.binaural!,breathingTones:config.levels.breathingTones,voice:config.levels.voice,bowl:config.levels.bowl}};
}
export function layerMix(config:JourneyConfig) {
  if(config.schemaVersion===1)return undefined; // Original environment bus applies the old gain unchanged.
  const mix=effectiveMix(config).levels;
  return {warm:mix.warm*LAYER_GAIN.warm,binaural:mix.binaural*LAYER_GAIN.binaural};
}
export function validateJourneyConfig(input: unknown): JourneyConfig {
  const c = input as JourneyConfig;
  const legacy=c?.schemaVersion===1;
  const keys = ['kind', 'schemaVersion', 'suiteVersion', 'presetId', 'guidance', 'breathing', 'humming', 'surroundingSpace', 'affirmation', 'levels', 'toneVersion', 'narrationVersion', 'audioAssets', 'breathingIntroSeconds', 'interruptionPolicy', 'sound',...legacy?[]:['mixVersion','mixPreset']];
  if (!c || typeof c !== 'object' || Array.isArray(c) || Object.keys(c).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(c, k)) || c.kind !== 'meditation-journey' || ![1,2].includes(c.schemaVersion) || c.suiteVersion !== (legacy?'meditation-suite.1.0':SUITE_VERSION) || !['foundation','beyond','preparation'].includes(c.presetId) || !['guided', 'familiar'].includes(c.guidance) || !Object.hasOwn(BREATHING, c.breathing) || typeof c.humming !== 'boolean' || typeof c.surroundingSpace !== 'boolean' || !['secular', 'spiritual'].includes(c.affirmation) || c.toneVersion !== (legacy?'major-steps.1':'soft-steps.2') || c.narrationVersion !== (legacy?'preparation-text.1':'preparation-voice.2') || c.breathingIntroSeconds !== (legacy?0:20) || c.interruptionPolicy !== 'clock-continues-next-inhale') throw new Error('Unsupported meditation journey settings.');
  const levelKeys = ['environment', 'breathingTones', 'voice', 'bowl',...legacy?[]:['warm','binaural']];
  if(legacy){if(JSON.stringify(c.audioAssets)!==JSON.stringify(LEGACY_AUDIO_ASSETS))throw new Error('Unsupported journey audio assets.');}
  else {
    // Historical pins remain readable if an approved recording is added/removed later.
    // Playback independently requires an approved local recording with the same ID, script and hash.
    const a=c.audioAssets;
    if(!a||Object.keys(a).sort().join()!=='bowl,bowlSha256,voice,voiceSha256'||a.bowl!==LEGACY_AUDIO_ASSETS.bowl||a.bowlSha256!==LEGACY_AUDIO_ASSETS.bowlSha256||!Array.isArray(a.voice)||a.voice.length>64||new Set(a.voice).size!==a.voice.length||!a.voiceSha256||Object.keys(a.voiceSha256).length!==a.voice.length||a.voice.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9_.-]{1,120}$/.test(id)||!Object.hasOwn(a.voiceSha256!,id)||!/^[a-f0-9]{64}$/.test(a.voiceSha256![id])))throw new Error('Unsupported journey audio assets.');
  }
  if (!c.levels || Object.keys(c.levels).length !== levelKeys.length || levelKeys.some(k => {const v=c.levels[k as keyof typeof c.levels];return !Object.hasOwn(c.levels,k)||!Number.isFinite(v)||v!<0||v!>1;})) throw new Error('Journey audio levels must be between 0 and 1.');
  if(!legacy&&(c.mixVersion!==MIX_VERSION||c.levels.environment!==1||!validMix(effectiveMix(c))))throw new Error('Unsupported journey sound mix.');
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
