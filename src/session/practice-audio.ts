import type {Preferences} from '../settings/preferences';
import type {SoundRecipe} from '../meditation/environment';
export interface PracticeAudio {source:'off'|'floating'|'home-again'|'warm';timing:'entire'|'retention';level:number;holdGuidance:boolean;}
export const defaultPracticeAudio=():PracticeAudio=>({source:'off',timing:'entire',level:.25,holdGuidance:false});
export function validPracticeAudio(v:unknown):v is PracticeAudio{const a=v as PracticeAudio;return !!a&&['off','floating','home-again','warm'].includes(a.source)&&['entire','retention'].includes(a.timing)&&Number.isFinite(a.level)&&a.level>=0&&a.level<=1&&typeof a.holdGuidance==='boolean';}
export function practiceRecipe(a:PracticeAudio):SoundRecipe{return {version:1,texture:a.source==='warm'?'brown':'off',source:a.source==='floating'?'ambience.floating':a.source==='home-again'?'ambience.homeAgain':'none',noiseLevel:a.level*.35,musicLevel:a.level,loop:true,mode:'off',toneLevel:0,opening:'off',closing:'off',signalLevel:0};}

export function practiceAudioFor(p:Preferences):PracticeAudio{
 if(p.practiceAudio)return structuredClone(p.practiceAudio);
 const source=p.background.mode==='off'||p.background.mode==='after'?'off':p.background.source==='ambience.floating'?'floating':p.background.source==='ambience.homeAgain'?'home-again':'off';
 return {...defaultPracticeAudio(),source,timing:p.background.mode==='retention'?'retention':'entire',level:source==='off'?.25:p.volumes.ambience};
}
