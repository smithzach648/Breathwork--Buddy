import {PRESETS,validateRecipe,type Recipe} from '../audio/acoustic/model';
import {stageFrom,validateJourney,type Journey} from '../audio/acoustic/journey';
import {normalizeMix,validMix,type ListenerMix} from '../meditation-suite/mix';
export const ACOUSTIC_SCENES=[{id:'threshold',name:'Threshold',description:'A steady, grounded place to rest.'},{id:'expansion',name:'Expansion',description:'A little more room for attention.'},{id:'timeless',name:'Timeless',description:'Quiet space without a task.'},{id:'open',name:'Open',description:'A gentle, open sound field.'},{id:'flow',name:'Beyond · sound journey',description:'Threshold, Expansion and Timeless, with no preparation or narration.'}] as const;
export type AcousticSceneId=typeof ACOUSTIC_SCENES[number]['id'];
export interface AcousticSelection {version:'acoustic-environment.1';scene:AcousticSceneId;recipes:Recipe[];mix:ListenerMix}
export function acousticSelection(scene:AcousticSceneId,mix?:ListenerMix):AcousticSelection{
 if(!ACOUSTIC_SCENES.some(s=>s.id===scene))throw new Error('Choose a supported sound environment.');
 const ids=scene==='flow'?['threshold','expansion','timeless']:[scene];
 return {version:'acoustic-environment.1',scene,recipes:ids.map(id=>validateRecipe(PRESETS.find(p=>p.id===id)!)),mix:normalizeMix(mix)};
}
export function validAcousticSelection(value:unknown):value is AcousticSelection{
 try{const a=value as AcousticSelection;if(!a||a.version!=='acoustic-environment.1'||!ACOUSTIC_SCENES.some(s=>s.id===a.scene)||!Array.isArray(a.recipes)||a.recipes.length!==(a.scene==='flow'?3:1)||!validMix(a.mix))return false;
 const ids=a.scene==='flow'?['threshold','expansion','timeless']:[a.scene];return a.recipes.every((r,i)=>validateRecipe(r).id===ids[i]);}catch{return false;}
}
/** Freeze source recipes, then adapt only stage lengths to the chosen timer. There is no ritual preparation. */
export function acousticProgram(a:AcousticSelection,seconds:number):Journey{
 if(!validAcousticSelection(a)||!Number.isInteger(seconds)||seconds<60||seconds>3600)throw new Error('Choose a 1–60 minute sound environment.');
 if(a.scene==='flow'&&seconds<180)throw new Error('The sound journey needs at least 3 minutes. Choose an individual environment for a shorter meditation.');
 const durations=a.scene==='flow'?[Math.floor(seconds/3),Math.floor(seconds*.4),seconds-Math.floor(seconds/3)-Math.floor(seconds*.4)]:[seconds];
 const stages=a.recipes.map((r,i)=>stageFrom(r,durations[i],`acoustic-${i}`,104729));
 return validateJourney({kind:'journey',schemaVersion:1,engineVersion:'journey.1.0',id:`acoustic-${a.scene}`,name:ACOUSTIC_SCENES.find(s=>s.id===a.scene)!.name,sampleSeed:104729,transitionSeconds:Math.min(20,Math.floor(Math.min(...durations)/2)),transitionShape:'smoothstep',layerEnvelope:'steady',sourcePolicy:'shared-warm',stages,timeline:{durationSeconds:seconds},output:{level:1,fadeSeconds:1}});
}
