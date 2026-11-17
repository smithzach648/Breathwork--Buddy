import {createSnapshot,cyclePattern,patterns,type PatternId} from '../../session/config';
import {hormesisConfig} from '../../session/hormesis';
import {JOURNEYS,type JourneyId} from '../../meditation-suite/model';
import type {AcousticSceneId} from '../../meditation/acoustic-scenes';
export type Category='all'|'breathe'|'meditate'|'journey';
export interface PracticeCard {id:string;kind:Exclude<Category,'all'>;name:string;technique:string;description:string;seconds:number;preset?:PatternId|'hormesis-foundation'|'hormesis-advanced';journey?:JourneyId;scene?:AcousticSceneId;}
const names:Record<PatternId,string>={box:'Find your rhythm',coherent:'A steadier pace','478':'Let the day settle',calm:'Make room to breathe'};
const descriptions:Record<PatternId,string>={box:'A clear, even rhythm to bring your attention back to the present.',coherent:'Comfortable, unhurried breathing with room between the demands of your day.','478':'A longer exhale and a quieter moment. Return to natural breathing whenever you need.',calm:'An easy inhale and a little longer to let it go.'};
export const PRACTICE_CARDS:PracticeCard[]=[
 ...(['box','coherent','478','calm'] as PatternId[]).map(id=>({id,kind:'breathe' as const,name:names[id],technique:patterns[id].name,description:descriptions[id],seconds:createSnapshot({...cyclePattern(id,10),guidanceProfile:'soft-felt-marshall.1'}).plannedDurationSeconds,preset:id})),
 ...(['foundation','advanced'] as const).map(option=>({id:'hormesis-'+option,kind:'breathe' as const,name:'Hormesis · '+(option==='foundation'?'Foundation':'Advanced'),technique:option==='foundation'?'3 rounds · 20 breaths · 4s in/out':'3 rounds · 30 breaths · 2s in/out',description:option==='foundation'?'Three rounds with optional sixty-second retentions and comfortable recovery.':'Three rounds with optional sixty, ninety and ninety-second retentions.',seconds:createSnapshot({...hormesisConfig(option),guidanceProfile:'soft-felt-marshall.1'}).plannedDurationSeconds,preset:('hormesis-'+option) as 'hormesis-foundation'|'hormesis-advanced'})),
 {id:'threshold',kind:'meditate',name:'A place to rest',technique:'Threshold sound environment',description:'Rest your attention in a steady sound field. No preparation sequence or spoken guide.',seconds:600,scene:'threshold'},
 {id:'flow',kind:'meditate',name:'Follow the current',technique:'Beyond · sound environment',description:'A continuous flow through Threshold, Expansion and Timeless, with room to sit without a task.',seconds:600,scene:'flow'},
 ...JOURNEYS.map(j=>({id:'journey-'+j.id,kind:'journey' as const,name:j.name,technique:'A complete guided journey',description:j.description,seconds:j.seconds,journey:j.id})),
];
export const UI_KEY='breathward-ui-v1';
export interface LibraryState {favorites:string[];last?:string;}
export function readLibrary():LibraryState {try{const v=JSON.parse(localStorage.getItem(UI_KEY)||'null');return {favorites:Array.isArray(v?.favorites)?v.favorites.filter((id:unknown)=>typeof id==='string'&&PRACTICE_CARDS.some(p=>p.id===id)):['box','journey-foundation'],last:typeof v?.last==='string'?v.last:undefined};}catch{return {favorites:['box','journey-foundation']};}}
export function saveLibrary(value:LibraryState){localStorage.setItem(UI_KEY,JSON.stringify(value));}
