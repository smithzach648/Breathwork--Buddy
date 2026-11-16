export const MIX_VERSION = 'listener-mix.1';
export const MIX_KEYS = ['warm', 'binaural', 'breathingTones', 'voice', 'bowl'] as const;
export type MixKey = typeof MIX_KEYS[number];
export type MixLevels = Record<MixKey, number>;
export type MixPreset = 'balanced' | 'immersive' | 'quiet' | 'custom';
export interface ListenerMix { version: typeof MIX_VERSION; preset: MixPreset; levels: MixLevels }
export const MIX_PRESETS = {
  balanced: { warm: .7, binaural: .6, breathingTones: .45, voice: 1, bowl: .45 },
  immersive: { warm: .85, binaural: .8, breathingTones: .4, voice: 1, bowl: .45 },
  quiet: { warm: .4, binaural: .3, breathingTones: .25, voice: .8, bowl: .3 },
} as const;
// Relative listener gain before the original recipe trim/ceiling, not a second Master.
export const LAYER_GAIN = Object.freeze({ warm: 3, binaural: 4 });
export function presetMix(preset: Exclude<MixPreset,'custom'> = 'balanced'): ListenerMix {
  return { version: MIX_VERSION, preset, levels: { ...MIX_PRESETS[preset] } };
}
export function validMix(value: unknown): value is ListenerMix {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const m=value as ListenerMix;
  if(Object.keys(m).sort().join()!=='levels,preset,version'||m.version!==MIX_VERSION||!['balanced','immersive','quiet','custom'].includes(m.preset)||!m.levels||typeof m.levels!=='object'||Array.isArray(m.levels)||Object.keys(m.levels).length!==5||MIX_KEYS.some(k=>!Object.hasOwn(m.levels,k)||!Number.isFinite(m.levels[k])||m.levels[k]<0||m.levels[k]>1))return false;
  return m.preset==='custom'||MIX_KEYS.every(k=>m.levels[k]===MIX_PRESETS[m.preset as keyof typeof MIX_PRESETS][k]);
}
export function normalizeMix(value: unknown): ListenerMix {
  if(validMix(value))return JSON.parse(JSON.stringify(value)) as ListenerMix;
  // Read adapter for a previous single-environment setting, without rewriting History.
  const old=value as {environment?:number;breathingTones?:number;voice?:number;bowl?:number};
  if(old&&[old.environment,old.breathingTones,old.voice,old.bowl].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1))return {version:MIX_VERSION,preset:'custom',levels:{warm:old.environment!/LAYER_GAIN.warm,binaural:old.environment!/LAYER_GAIN.binaural,breathingTones:old.breathingTones!,voice:old.voice!,bowl:old.bowl!}};
  return presetMix();
}
export function changeMix(mix:ListenerMix,key:MixKey,value:number):ListenerMix {
  const next={version:MIX_VERSION,preset:'custom' as const,levels:{...mix.levels,[key]:value}};
  if(!validMix(next))throw new Error('Sound mix levels must be between 0 and 1.');
  return next;
}
