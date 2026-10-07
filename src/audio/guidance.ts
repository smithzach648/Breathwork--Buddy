import type { Preferences } from '../settings/preferences';
export type GuidanceCategory = 'breath-sound' | 'spoken-breath' | 'general-voice';
export function guidanceCategory(id: string): GuidanceCategory {
    return id.startsWith('breath.') ? 'breath-sound' : ['voice.in', 'voice.out', 'voice.fullExhale'].includes(id) ? 'spoken-breath' : 'general-voice';
}
export function cueEnabled(id: string, preferences: Preferences): boolean {
    const category = guidanceCategory(id);
    return preferences.guidance[category === 'breath-sound' ? 'breathSounds' : category === 'spoken-breath' ? 'spokenBreath' : 'generalVoice'];
}
