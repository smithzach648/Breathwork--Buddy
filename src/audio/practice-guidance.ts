import type {ExerciseConfig,PlannedStage,PracticeConfig} from '../session/config';
import type {StageAudio} from '../session/audio-port';
import type {AudioCue} from './cues';
import {hormesisOption} from '../session/hormesis';
import {PRACTICE_NARRATION} from './practice-narration';
export const PRACTICE_GUIDANCE_VERSION='soft-felt-marshall.1';
export function introFor(config:ExerciseConfig){
 const modern=hormesisOption(config);if(modern)return PRACTICE_NARRATION[modern.introId];
 const key=config.kind==='patterned'?config.presetId:config.kind==='custom-pattern'?'custom':config.kind==='hormesis'||config.kind==='hormesis-round'?'hormesis':undefined;
 return key?PRACTICE_NARRATION[`practice.intro.${key}.1`]:undefined;
}
/** A declared, versioned introduction precedes each breathing exercise; ordinary cycle timing is unchanged. */
export function compileMusicalPractice(config:PracticeConfig,legacy:PlannedStage[]):PlannedStage[]{
 const seen=new Set<string>(),result:PlannedStage[]=[];
 const flow=config.kind==='routine'&&config.routine.flowGuidance==='flow.1'&&config.routine.stages.some(b=>b.kind==='meditation');
 if(flow&&legacy[3])result.push({...legacy[3],phase:'practice-introduction',label:'Your routine · Introduction',durationMs:35000,round:0,totalRounds:0,cycle:0,totalCycles:0,introClipId:'practice.flow.intro.1',guidanceProfile:PRACTICE_GUIDANCE_VERSION});
 for(const original of legacy.slice(3)){
  if(original.phase==='block-transition'){result.push({...original,guidanceProfile:PRACTICE_GUIDANCE_VERSION});continue;}
  const key=original.blockId??'standalone';
  if(!seen.has(key)){
   seen.add(key);const block=config.kind==='routine'?config.routine.stages.find(b=>b.id===key):config.kind==='meditation-journey'?undefined:config;
   const intro=block?(flow&&block.kind==='patterned'?PRACTICE_NARRATION['practice.flow.'+block.presetId+'.1']:introFor(block)):undefined;
   if(intro)result.push({...original,phase:'practice-introduction',label:`Introduction · ${block!.kind==='patterned'?block!.presetId==='coherent'?'Six-six breathing':block!.presetId==='calm'?'Calm breathing':block!.presetId==='478'?'Four-seven-eight breathing':'Box breathing':block!.kind==='custom-pattern'?'Your pattern':'Hormesis'}`,durationMs:(flow&&block?.kind==='patterned'?16:hormesisOption(block!)?.introSeconds??(intro.id.includes('hormesis')?30:25))*1000,round:0,totalRounds:0,cycle:0,totalCycles:0,introClipId:intro.id,guidanceProfile:PRACTICE_GUIDANCE_VERSION});
  }
  result.push({...original,...original.phase==='round-announcement'?{durationMs:3000}:{},guidanceProfile:PRACTICE_GUIDANCE_VERSION});
 }
 return result;
}
export function practiceStageCues({stage,start,deadline}:StageAudio):AudioCue[]{
 const cues:AudioCue[]=[];const add=(name:string,at=start,until=deadline)=>cues.push({id:name.startsWith('practice.')?name:`practice.voice.${name}.1`,at,until,breath:false});
 if(stage.phase==='practice-introduction'&&stage.introClipId)add(stage.introClipId);
 else if(stage.phase==='round-announcement')add(stage.round===stage.totalRounds&&stage.totalRounds>1?'finalRound':stage.round===2?'round2':'round1');
 else if(stage.phase==='pre-retention-exhale')add('fullExhale');
 else if(stage.phase==='retention'){
  add(stage.durationMs===90000?'hold90':'hold60');
  if(stage.holdGuidance)add('practice.hold.soften.1',start+20000,Math.min(start+42000,deadline-5000));
  ['five','four','three','two','one'].forEach((name,i)=>add(name,deadline-(5-i)*1000,deadline-(4-i)*1000));
 }else if(stage.phase==='recovery-inhale')add('recoveryInhale');else if(stage.phase==='recovery-exhale')add('recoveryExhale');
 return cues;
}
export function musicalPhase(phase:PlannedStage['phase']){
 return phase==='inhale'||phase==='prepare-inhale'||phase==='recovery-inhale'?'inhale':phase==='exhale'||phase==='prepare-exhale'||phase==='pre-retention-exhale'||phase==='recovery-exhale'?'exhale':phase==='hold-in'||phase==='recovery-hold'?'hold-in':phase==='hold-out'?'hold-out':undefined;
}
