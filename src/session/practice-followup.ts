import type {ExerciseConfig,PracticeConfig} from './config';
import type {Preferences} from '../settings/preferences';
import type {AcousticSceneId} from '../meditation/acoustic-scenes';
import {developedRecipe} from '../meditation/environment';
import {blockName} from '../routines/model';
/** One parent session, one result, with the scene pinned before the breathing begins. */
export function withMeditation(practice:ExerciseConfig,minutes:number,scene:AcousticSceneId|'off',preferences:Preferences):PracticeConfig{
 const at=new Date().toISOString(),sound=developedRecipe({...preferences,meditation:{...preferences.meditation,acousticScene:scene}});
 return {kind:'routine',guidanceProfile:'soft-felt-marshall.1',routine:{id:'practice-with-meditation',name:`${blockName(practice)} + meditation`,createdAt:at,updatedAt:at,stages:[{...practice,id:'breathing'},{id:'meditation',kind:'meditation',presetId:'meditation',durationSeconds:minutes*60,audioPolicy:scene==='off'?'silent':'custom',...(scene==='off'?{}:{sound})}]}};
}
