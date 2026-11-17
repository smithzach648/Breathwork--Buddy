import type { PlannedStage, Phase } from '../session/config';
import type { BreathingChoice, Section } from './model';

export const PREPARATION_VERSION = 'full-preparation.1';
export const FULL_SECTIONS = [
  {section:'ecb',start:0,end:120}, {section:'breathwork',start:120,end:420},
  {section:'tuning',start:420,end:570}, {section:'space',start:570,end:720},
  {section:'affirmation',start:720,end:840}, {section:'entry',start:840,end:900},
] as const;
export const BODY_REGIONS = ['face','shoulders','breath','back','legs'] as const;
export const BODY_LABELS = ['Face and jaw','Shoulders, arms and hands','Ribs and abdomen','Back and hips','Legs and feet'];
const patterns = {'5-5':[5,0,5,0],'4-4-6':[4,4,6,0],'4-7-8':[4,7,8,0],natural:[0,0,0,0]} as const;
export interface PreparationEvent {start:number;end:number;phase:Phase;label:string;cycle:number;totalCycles:number;clipId?:string}
export interface PreparationPlan {version:typeof PREPARATION_VERSION;durationSeconds:900;sections:readonly {section:Section;start:number;end:number}[];breathingEvents:PreparationEvent[];humming:{start:465;end:555};chimes:readonly [120,420]}
/** The snapshot, session stages, musical notes and narration all use this exact event grid. */
export function preparationPlan(choice:BreathingChoice):PreparationPlan {
  const events:PreparationEvent[]=[],totalCycles=({'5-5':20,'4-4-6':15,'4-7-8':4,natural:0})[choice];
  let at=120,cycle=0;
  const add=(seconds:number,phase:Phase,label:string,clipId?:string)=>{if(seconds){events.push({start:at,end:at+seconds,phase,label,cycle:phase==='journey-preparation'||phase==='natural-settling'?0:cycle,totalCycles,clipId});at+=seconds;}};
  add(25,'journey-preparation','Breathing introduction',`suite.breath.intro.${choice}.v2`);
  BODY_REGIONS.forEach((region,index)=>{
    add(choice==='4-4-6'?8:10,'journey-preparation',BODY_LABELS[index],`suite.body.${region}.v2`);
    const count=choice==='5-5'?4:choice==='4-4-6'?3:choice==='4-7-8'&&index<2?2:0;
    for(let i=0;i<count;i++){cycle++;patterns[choice].forEach((seconds,p)=>add(seconds,(['inhale','hold-in','exhale','hold-out'] as const)[p],['Breathe in','Comfortable hold','Breathe out','Comfortable rest'][p]));}
    add(50-(choice==='4-4-6'?8:10)-count*patterns[choice].reduce<number>((a,b)=>a+b,0),'natural-settling','Breathe naturally');
  });
  add(25,'natural-settling','Whole-body release');
  if(at!==420||cycle!==totalCycles)throw new Error('Preparation breathing budget does not balance.');
  return {version:PREPARATION_VERSION,durationSeconds:900,sections:FULL_SECTIONS,breathingEvents:events,humming:{start:465,end:555},chimes:[120,420]};
}
export function preparationStages(plan:PreparationPlan,sectionLabel:(section:Section)=>string):PlannedStage[]{
  return plan.sections.flatMap<PlannedStage>(row=>row.section==='breathwork'?plan.breathingEvents.map(e=>({phase:e.phase,label:e.label,durationMs:(e.end-e.start)*1000,round:0,totalRounds:0,cycle:e.cycle,totalCycles:e.totalCycles,journeySection:'breathwork' as const})):[{phase:'journey-preparation' as const,label:sectionLabel(row.section),durationMs:(row.end-row.start)*1000,round:0,totalRounds:0,cycle:0,totalCycles:0,journeySection:row.section}]);
}
