import type {PracticeConfig} from './config';
import type {Preferences} from '../settings/preferences';
export type PracticeNarrationMode='full'|'brief'|'off';
export interface PracticeNarrationChoice {version:'concise.1';mode:PracticeNarrationMode}
export function validNarrationMode(v:unknown):v is PracticeNarrationMode{return ['full','brief','off'].includes(v as string);}
export function validNarrationChoice(v:unknown):v is PracticeNarrationChoice{const c=v as PracticeNarrationChoice;return !!c&&c.version==='concise.1'&&validNarrationMode(c.mode);}
/** New starts opt into concise practice pacing; frozen old snapshots and journeys keep their timing. */
export function withPracticeNarration(config:PracticeConfig,p:Preferences):PracticeConfig{
 if(config.kind==='meditation-journey'||!config.guidanceProfile||config.practiceNarration)return config;
 return {...config,practiceNarration:{version:'concise.1',mode:p.practiceNarration??'full'}};
}
