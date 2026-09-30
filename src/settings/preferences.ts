import type { AudioBus } from '../audio/catalog';
export type Theme = 'system' | 'light' | 'dark';
export interface Preferences {
    id: 'preferences';
    theme: Theme;
    volumes: Record<AudioBus, number>;
}
export function defaultPreferences(): Preferences { return { id: 'preferences', theme: 'system', volumes: { master: 0.8, voice: 1, breath: 0.6, ambience: 0.4, signals: 0.7 } }; }
export function validPreferences(value: unknown): value is Preferences { if (!value || typeof value !== 'object')
    return false; const p = value as Preferences; return p.id === 'preferences' && ['system', 'light', 'dark'].includes(p.theme) && !!p.volumes && ['master', 'voice', 'breath', 'ambience', 'signals'].every(bus => Number.isFinite(p.volumes[bus as AudioBus]) && p.volumes[bus as AudioBus] >= 0 && p.volumes[bus as AudioBus] <= 1); }
