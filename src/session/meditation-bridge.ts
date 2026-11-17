import type {PlannedStage,PracticeSnapshot} from './config';
/** One acoustic timeline spans the quiet lead-in and its meditation; session deadlines stay unchanged. */
export function meditationBridge(snapshot:PracticeSnapshot,stage:PlannedStage,start:number){
 if(snapshot.config.kind!=='routine'||snapshot.config.routine.flowGuidance!=='flow.1')return;
 const stages=snapshot.stages,index=stages.indexOf(stage);if(index<0)return;
 let target=index;
 if(stage.phase==='natural-settling'&&stages[index+1]?.phase==='block-transition')target=index+2;
 else if(stage.phase==='block-transition')target=index+1;
 else if(stage.phase!=='meditation')return;
 const meditation=stages[target];if(meditation?.phase!=='meditation'||!meditation.soundRecipe?.acoustic||meditation.meditationPolicy==='silent')return;
 const transition=stages[target-1]?.phase==='block-transition'?stages[target-1]:undefined;
 const settling=transition&&stages[target-2]?.phase==='natural-settling'?stages[target-2]:undefined;
 const leadSeconds=Math.min(18,((transition?.durationMs??0)+(settling?.durationMs??0))/1000);
 if(!leadSeconds)return;
 const meditationAt=start+stages.slice(index,target).reduce((sum,s)=>sum+s.durationMs,0);
 return {key:meditation.blockId??String(target),selection:meditation.soundRecipe.acoustic,meditationAt,
  start:meditationAt-leadSeconds*1000,leadSeconds,seconds:meditation.durationMs/1000+leadSeconds};
}
