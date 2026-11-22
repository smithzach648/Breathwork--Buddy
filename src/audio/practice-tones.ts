import type {PracticeConfig,Phase} from '../session/config';
import type {RecoveryHoldSound} from '../session/recovery-sound';
import {scheduleSoftNote} from '../meditation-suite/instrument';
import {softNoteHz} from '../meditation-suite/tones';
const CHORD=[146.8323839587038,174.61411571650194,220];
const EMPHASIS=[[.48,.30,.22],[.30,.22,.48],[.26,.48,.26],[.30,.26,.44]];
/** A fixed D-minor chord, with bounded changing emphasis instead of an inhale/exhale contour. */
export function practicePulse(phase:Phase,index:number,seconds:number,recovery:RecoveryHoldSound|'ordinary'='ordinary'){
 const hz=softNoteHz(phase,index,seconds);
 if(recovery==='quiet')return [];
 const emphasis=EMPHASIS[index%EMPHASIS.length],energy=Math.hypot(...emphasis);
 return recovery==='chords'?CHORD.map((hz,i)=>({hz,scale:emphasis[i]/energy})):[{hz,scale:1}];
}
export function schedulePracticePulse(c:BaseAudioContext,input:AudioNode,phase:Phase,index:number,seconds:number,when:number,recovery:RecoveryHoldSound|'ordinary'='ordinary'){
 return practicePulse(phase,index,seconds,recovery).map(({hz,scale})=>({...scheduleSoftNote(c,input,hz,when,phase.startsWith('hold'),'felt',scale),hz,scale}));
}
export interface TonePreviewPhase {phase:'inhale'|'exhale'|'hold-in'|'hold-out';seconds:number;recovery:boolean;at:number}
/** A shortened listening sample, never a breathing exercise or a session clock. */
export function practicePreviewPlan(config:PracticeConfig):TonePreviewPhase[]{
 if(config.kind==='meditation-journey')return [];
 const c=config.kind==='routine'?config.routine.stages.find(b=>!['meditation','settling'].includes(b.kind)):config;
 if(!c)return [];
 const parts:[TonePreviewPhase['phase'],number,boolean][]=[];
 if(c.kind==='hormesis'||c.kind==='hormesis-round')parts.push(['inhale',3,false],['hold-in',4,true],['exhale',3,false]);
 else if(c.kind==='patterned'){
  const s=c.presetId==='coherent'?[6,0,6,0]:c.presetId==='478'?[4,7,8,0]:c.presetId==='calm'?[4,4,6,2]:[4,4,4,4];
  (['inhale','hold-in','exhale','hold-out'] as const).forEach((phase,i)=>{if(s[i])parts.push([phase,Math.min(3,s[i]),false]);});
 }else if(c.kind==='custom-pattern'){
  const s=[c.inhaleSeconds,c.holdInSeconds,c.exhaleSeconds,c.holdOutSeconds];(['inhale','hold-in','exhale','hold-out'] as const).forEach((phase,i)=>{if(s[i])parts.push([phase,Math.min(3,s[i]),false]);});
 }
 let at=0;return parts.map(([phase,seconds,recovery])=>{const p={phase,seconds,recovery,at};at+=seconds;return p;});
}
