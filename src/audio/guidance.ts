import type { Preferences } from '../settings/preferences';
export type GuidanceCategory = 'breath-sound' | 'spoken-breath' | 'general-voice';
export function guidanceCategory(id: string): GuidanceCategory {
    return id.startsWith('breath.') ? 'breath-sound' : ['voice.in', 'voice.out', 'voice.fullExhale','practice.voice.fullExhale.1','practice.compact.voice.fullExhale.1'].includes(id) ? 'spoken-breath' : 'general-voice';
}
export function cueEnabled(id: string, preferences: Preferences): boolean {
    if(id.startsWith('practice.')){
        if(preferences.practiceNarration==='off')return false;
        if(preferences.practiceNarration==='brief'&&!id.startsWith('practice.brief.')&&(!id.includes('.voice.')||/hold60|hold90|soften/.test(id)))return false;
    }
    const category = guidanceCategory(id);
    return preferences.guidance[category === 'breath-sound' ? 'breathSounds' : category === 'spoken-breath' ? 'spokenBreath' : 'generalVoice'];
}
