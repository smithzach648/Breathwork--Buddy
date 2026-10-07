import type { AudioBus } from '../audio/catalog';
export type Theme = 'system' | 'light' | 'dark';
export type BackgroundMode = 'off' | 'entire' | 'retention' | 'after';
export interface Preferences {
    id: 'preferences';
    theme: Theme;
    volumes: Record<AudioBus, number>;
    guidance: { breathSounds: boolean; spokenBreath: boolean; generalVoice: boolean; ducking: boolean };
    background: { source: string; mode: BackgroundMode; loop: boolean };
}
export function defaultPreferences(): Preferences { return { id: 'preferences', theme: 'system', volumes: { master: 0.8, voice: 1, breath: 0.6, ambience: 0.4, signals: 0.7 }, guidance: { breathSounds: true, spokenBreath: true, generalVoice: true, ducking: true }, background: { source: 'none', mode: 'off', loop: true } }; }
/** Extend older valid rows without losing their existing theme or volumes. */
export function normalizePreferences(value: unknown): Preferences {
    const defaults = defaultPreferences();
    if (!validBase(value)) return defaults;
    const p = value as Partial<Preferences>;
    for (const key of ['breathSounds', 'spokenBreath', 'generalVoice', 'ducking'] as const) if (typeof p.guidance?.[key] === 'boolean') defaults.guidance[key] = p.guidance[key];
    if (typeof p.background?.source === 'string') defaults.background.source = p.background.source;
    if (['off', 'entire', 'retention', 'after'].includes(p.background?.mode || '')) defaults.background.mode = p.background!.mode;
    if (typeof p.background?.loop === 'boolean') defaults.background.loop = p.background.loop;
    return { ...defaults, theme: p.theme!, volumes: { ...p.volumes! } };
}
function validBase(value: unknown): boolean { if (!value || typeof value !== 'object')
    return false; const p = value as Preferences; return p.id === 'preferences' && ['system', 'light', 'dark'].includes(p.theme) && !!p.volumes && ['master', 'voice', 'breath', 'ambience', 'signals'].every(bus => Number.isFinite(p.volumes[bus as AudioBus]) && p.volumes[bus as AudioBus] >= 0 && p.volumes[bus as AudioBus] <= 1); }
export function validPreferences(value: unknown): value is Preferences {
    if (!validBase(value)) return false;
    const p = value as Preferences;
    return !!p.guidance && ['breathSounds', 'spokenBreath', 'generalVoice', 'ducking'].every(key => typeof p.guidance[key as keyof Preferences['guidance']] === 'boolean') && !!p.background && typeof p.background.source === 'string' && ['off', 'entire', 'retention', 'after'].includes(p.background.mode) && typeof p.background.loop === 'boolean';
}
