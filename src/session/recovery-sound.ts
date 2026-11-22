import type {PracticeConfig} from './config';
import type {Preferences} from '../settings/preferences';
export type RecoveryHoldSound='chords'|'single'|'quiet';
export function validRecoverySound(v:unknown):v is RecoveryHoldSound{return ['chords','single','quiet'].includes(v as string);}
export function withPracticeSound(c:PracticeConfig,p:Preferences):PracticeConfig{
 return c.kind!=='meditation-journey'&&c.guidanceProfile&&!c.recoveryHoldSound?{...c,recoveryHoldSound:p.recoveryHoldSound??'chords'}:c;
}
