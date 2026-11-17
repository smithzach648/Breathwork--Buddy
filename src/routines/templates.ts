import {cyclePattern,createSnapshot,type ExerciseConfig} from '../session/config';
import {hormesisConfig} from '../session/hormesis';
import {developedRecipe} from '../meditation/environment';
import type {AcousticSceneId} from '../meditation/acoustic-scenes';
import {defaultPreferences,type Preferences} from '../settings/preferences';
import {practiceAudioFor} from '../session/practice-audio';
import type {Routine} from '../types/domain';
export type RoutineVariant='short'|'unhurried'|'custom';
export const ROUTINE_TEMPLATES=[
 {id:'comprehensive',name:'Comprehensive Calm',description:'Box, Calm and 4–7–8 breathing, followed by a quiet meditation.',technique:'Box → Calm → 4–7–8 → meditation'},
 {id:'zach',name:'Zach’s Practice',description:'Your paced opening, two thirty-breath Hormesis rounds, and fifteen minutes to meditate.',technique:'Calm → 4–7–8 → two-round Hormesis → meditation'},
 {id:'steady',name:'Steady Ground',description:'An even rhythm without breath holds, then natural settling and meditation.',technique:'Coherent → settle → meditation'},
 {id:'clear',name:'Clear Some Space',description:'Move through three familiar patterns, then rest with Open.',technique:'Box → Calm → Coherent → meditation'},
 {id:'stillness',name:'Into Stillness',description:'Foundation Hormesis, room to recover, and meditation with Timeless.',technique:'Foundation → settle → meditation'},
 {id:'horizon',name:'Open Horizon',description:'Advanced Hormesis, natural settling, and a flowing sound meditation.',technique:'Advanced → settle → Beyond'},
] as const;
export type RoutineTemplateId=typeof ROUTINE_TEMPLATES[number]['id'];
export function templateRoutine(id:RoutineTemplateId|'custom',variant:RoutineVariant='short',p:Preferences=defaultPreferences()):Routine{
 const long=variant==='unhurried',at=new Date().toISOString(),n=long?10:5;
 const med=(minutes:number,scene:AcousticSceneId):ExerciseConfig=>({kind:'meditation',presetId:'meditation',durationSeconds:minutes*60,audioPolicy:'custom',sound:developedRecipe({...p,meditation:{...p.meditation,acousticScene:scene}})});
 const settle:ExerciseConfig={kind:'settling',presetId:'settling',durationSeconds:60};
 const stages:ExerciseConfig[]=id==='comprehensive'?[cyclePattern('box',n),cyclePattern('calm',n),cyclePattern('478',5),med(5,'threshold')]:id==='zach'?[cyclePattern('calm',n),cyclePattern('478',5),hormesisConfig('two'),med(15,'timeless')]:id==='steady'?[cyclePattern('coherent',long?25:10),settle,med(5,'threshold')]:id==='clear'?[cyclePattern('box',n),cyclePattern('calm',n),cyclePattern('coherent',long?25:10),med(10,'open')]:id==='stillness'?[hormesisConfig('foundation'),settle,med(long?15:10,'timeless')]:id==='horizon'?[hormesisConfig('advanced'),settle,med(long?20:15,'flow')]:[cyclePattern('coherent',10),med(5,'threshold')];
 return {id:'template-'+id,name:ROUTINE_TEMPLATES.find(t=>t.id===id)?.name??'My routine',createdAt:at,updatedAt:at,flowGuidance:'flow.1',practiceAudio:practiceAudioFor(p),stages:stages.map((s,i)=>({...s,id:'block-'+i}))};
}
export function templateSeconds(id:RoutineTemplateId){return createSnapshot({kind:'routine',routine:templateRoutine(id),guidanceProfile:'soft-felt-marshall.1'}).plannedDurationSeconds;}
