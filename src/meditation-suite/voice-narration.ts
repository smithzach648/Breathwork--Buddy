import { timeline, type JourneyConfig, type Section } from './model';
import { SCRIPT_CLIPS, type ClipScript } from './narration-content';
import { guidanceText as legacyText, narrationFits } from './narration';
import { APPROVED_NARRATION, type ApprovedNarrationAsset } from './voice-assets';
export { APPROVED_NARRATION, type ApprovedNarrationAsset };
export const NARRATION_MANIFEST={version:'preparation-voice.2',assets:SCRIPT_CLIPS,approved:APPROVED_NARRATION} as const;
export const hasApprovedNarration=()=>Object.keys(APPROVED_NARRATION).length>0;
export function sectionClip(config:JourneyConfig,section:Section):ClipScript {
  switch(section){
    case 'ecb':return config.guidance==='familiar'?SCRIPT_CLIPS.ecbBrief:SCRIPT_CLIPS.ecb;
    case 'breathwork':return {'5-5':SCRIPT_CLIPS.breath55,'4-4-6':SCRIPT_CLIPS.breath446,'4-7-8':SCRIPT_CLIPS.breath478,natural:SCRIPT_CLIPS.breathNatural}[config.breathing];
    case 'tuning':return config.humming?SCRIPT_CLIPS.tuning:SCRIPT_CLIPS.tuningQuiet;
    case 'space':return config.surroundingSpace?SCRIPT_CLIPS.space:SCRIPT_CLIPS.spaceNeutral;
    case 'affirmation':return config.affirmation==='spiritual'?SCRIPT_CLIPS.affirmationSpiritual:SCRIPT_CLIPS.affirmation;
    case 'return':return SCRIPT_CLIPS.return0;
    default:return SCRIPT_CLIPS[section];
  }
}
export interface NarrationCue {clip:ClipScript;section:Section;at:number;end:number;bowlAt?:number}
/** Unique section slots, including the protected breath introduction and all three return cues. */
export function narrationPlan(config:JourneyConfig):NarrationCue[] {
  if(config.schemaVersion===1)return [];
  const rows=timeline(config),seen=new Set<Section>(),result:NarrationCue[]=[];
  for(const row of rows){const section=row.stage.journeySection!;if(seen.has(section))continue;seen.add(section);
    if(config.guidance==='familiar'&&['relaxation','threshold','expansion','timeless'].includes(section))continue;
    const sectionEnd=rows.filter(r=>r.stage.journeySection===section).at(-1)!.end;
    const bowlAt=config.presetId==='beyond'&&['expansion','timeless'].includes(section)?row.start:undefined;
    const at=row.start+(bowlAt===undefined?0:16);
    if(section==='return'){
      [SCRIPT_CLIPS.return0,SCRIPT_CLIPS.return60,SCRIPT_CLIPS.return120].forEach((clip,i)=>result.push({clip,section,at:at+i*60,end:at+i*60+60}));
    }else result.push({clip:sectionClip(config,section),section,at,end:section==='breathwork'?row.start+config.breathingIntroSeconds:sectionEnd,bowlAt});
  }
  return result;
}
export function validRecording(cue:NarrationCue,asset:ApprovedNarrationAsset|undefined,pinnedIds:readonly string[]) {
  return !!asset&&asset.approved===true&&asset.id===cue.clip.id&&asset.script===cue.clip.script&&asset.language===cue.clip.language&&/^[a-f0-9]{64}$/.test(asset.sha256)&&pinnedIds.includes(asset.assetId)&&asset.decodedDurationSeconds<=cue.clip.maxSeconds&&narrationFits(asset,{start:cue.at,end:cue.end-.25},cue.bowlAt);
}
export function guidanceText(config:JourneyConfig,section:Section,elapsedInSection=0) {
  if(config.schemaVersion===1)return legacyText(config,section,elapsedInSection);
  if(section==='return')return (elapsedInSection>=120?SCRIPT_CLIPS.return120:elapsedInSection>=60?SCRIPT_CLIPS.return60:SCRIPT_CLIPS.return0).script;
  if(section==='breathwork'&&elapsedInSection>=config.breathingIntroSeconds)return config.breathing==='natural'?'Let your breath find its own comfortable rhythm.':'Let the notes keep time. Stay comfortable, and return to natural breathing whenever you prefer.';
  if(config.guidance==='familiar'&&['threshold','expansion','timeless'].includes(section))return 'A little space to rest and notice.';
  return sectionClip(config,section).script;
}
