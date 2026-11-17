import { FULL_CLIPS } from './full-narration-content';
import { sectionWindow, type JourneyConfig, type Section } from './model';
import type { NarrationCue } from './voice-narration';

export const CLASSIC_GATEWAY = {id:'suite.affirmation.gateway.original.source-pending',status:'source-pending',text:null,source:null,audioUsePermission:null,assetId:null} as const;
export const BUILDER_AFFIRMATIONS = {
  neutral:"I know why I've set aside this time. I can return to that intention without forcing an outcome. I will carry whatever is useful back into my ordinary life.",
  spiritual:"I enter this time with sincerity and an open heart. May my exploration be shaped by what I hold sacred, and may the understanding I find help me meet life with greater love and clarity.",
} as const;
export function affirmationId(c:JourneyConfig){return c.affirmation==='personal'?'suite.affirmation.personal.prompt.v2':`suite.affirmation.${c.presetId==='beyond'?'beyond':'foundation'}.${c.affirmation==='spiritual'?'spiritual':'neutral'}.v2`;}
export function fullSectionClip(c:JourneyConfig,section:Section){
  const style=c.guidance;
  const id=section==='ecb'?`suite.ecb.${style}.v2`:section==='breathwork'?`suite.breath.intro.${c.breathing}.v2`:section==='tuning'?`suite.tuning.${c.humming?style:'silent'}.v2`:section==='space'?`suite.rebal.${c.surroundingSpace?style:'nonvisual'}.v2`:section==='affirmation'?affirmationId(c):section==='return'?'suite.return.arrive.v2':`suite.${section}.${style}.v2`;
  return FULL_CLIPS[id];
}
export function fullNarrationPlan(c:JourneyConfig):NarrationCue[]{
  const cues:NarrationCue[]=[];
  const add=(id:string,section:Section,at:number,end:number,bowlAt?:number)=>{const clip=FULL_CLIPS[id];if(!clip)throw new Error(`Unknown narration clip ${id}`);cues.push({clip,section,at,end,bowlAt});};
  add(fullSectionClip(c,'ecb').id,'ecb',0,55);
  add(fullSectionClip(c,'breathwork').id,'breathwork',126,145);
  for(const event of c.preparation!.breathingEvents)if(event.clipId?.startsWith('suite.body.'))add(event.clipId,'breathwork',event.start,event.end);
  add(fullSectionClip(c,'tuning').id,'tuning',426,465);
  add(fullSectionClip(c,'space').id,'space',570,625);
  if(c.guidance==='guided')add('suite.affirmation.leadin.v2','affirmation',720,730);
  if(c.affirmation!=='personal'||c.guidance==='guided')add(affirmationId(c),'affirmation',732,810);
  add(fullSectionClip(c,'entry').id,'entry',840,880);
  for(const section of ['threshold','expansion','timeless'] as const){
    const window=sectionWindow(c,section);if(!window.end)continue;
    const bowl=section==='threshold'?undefined:window.start;
    add(fullSectionClip(c,section).id,section,window.start+(bowl===undefined?0:16),window.start+(bowl===undefined?30:46),bowl);
  }
  const start=sectionWindow(c,'return').start;
  ['arrive','body','open'].forEach((name,i)=>add(`suite.return.${name}.v2`,'return',start+i*60,start+(i+1)*60));
  return cues.sort((a,b)=>a.at-b.at);
}
export function fullGuidanceText(c:JourneyConfig,section:Section,elapsed:number){
  if(section==='return')return FULL_CLIPS[`suite.return.${elapsed>=120?'open':elapsed>=60?'body':'arrive'}.v2`].script;
  if(section==='breathwork'){
    const at=120+elapsed;
    if(at>=395)return "Leave the whole body as it is. Breathe naturally, and notice what's become quieter.";
    const last=c.preparation!.breathingEvents.filter(e=>e.start<=at&&e.clipId).at(-1);
    return last?.clipId?FULL_CLIPS[last.clipId].script:fullSectionClip(c,section).script;
  }
  if(section==='tuning'&&elapsed>=45)return elapsed<135?(c.humming?'Hum or vocalize at your own comfortable pace. Leave space to listen between sounds.':'Let the breath move naturally. There is nothing to add.'):'Let the sound fade, and rest in the quiet.';
  if(section==='space'&&elapsed>=55)return c.surroundingSpace?'Let the field continue on its own. Rest within it.':'Rest in the space around you. No picture is needed.';
  if(section==='affirmation'&&c.affirmation==='personal')return c.personalAffirmation||FULL_CLIPS['suite.affirmation.personal.prompt.v2'].script;
  return fullSectionClip(c,section).script;
}
