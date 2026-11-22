import {RecoverySoundPicker,PracticeSoundPreview} from '../practice/PracticeSoundPreview';
import type {PracticeRuntime} from '../../session/runtime';
import {withPracticeNarration,type PracticeNarrationMode} from '../../session/practice-narration';
import {PracticeNarrationControl} from '../practice/PracticeNarrationControl';
import {useState} from 'react';
import type {Preferences} from '../../settings/preferences';
import type {Routine,RoutineStage} from '../../types/domain';
import {createSnapshot,cyclePattern,patterns,type PatternId,type PracticeConfig} from '../../session/config';
import {hormesisConfig,HORMESIS_SAFETY} from '../../session/hormesis';
import {defaultPracticeAudio} from '../../session/practice-audio';
import {templateRoutine,type RoutineTemplateId,type RoutineVariant} from '../../routines/templates';
import {routineRepository} from '../../routines/repository';
import {blockName,MAX_BLOCKS,validateRoutine} from '../../routines/model';
import {formatDuration} from '../../shared/format';
import {developedRecipe} from '../../meditation/environment';
import {AcousticScenePicker} from '../../meditation/AcousticControls';
import {HormesisDetails} from '../practice/HormesisDetails';
import {PracticeAudioControls} from '../practice/PracticeAudioControls';
import {Icon} from '../../components/Icon';
export function RoutineDesigner({template,runtime,preferences,onPreferencesChange,onBack,onSaved,onStart}:{template?:RoutineTemplateId;runtime?:PracticeRuntime;preferences:Preferences;onPreferencesChange?:(p:Preferences)=>void;onBack:()=>void;onSaved:()=>void;onStart:(c:PracticeConfig)=>Promise<void>}){
 const [draft,setDraft]=useState<Routine>(()=>({...templateRoutine(template??'custom','short',preferences),id:crypto.randomUUID(),name:template?templateRoutine(template).name:''}));
 const [variant,setVariant]=useState<RoutineVariant>(template?'short':'custom'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[adding,setAdding]=useState('coherent');
 const [narration,setNarration]=useState<PracticeNarrationMode>(preferences.practiceNarration??'full');
 const hormesis=draft.stages.some(b=>b.kind==='hormesis'||b.kind==='hormesis-round');
 function change(next:Routine){setDraft(next);setVariant('custom');}
 function replace(index:number,next:RoutineStage){change({...draft,stages:draft.stages.map((b,i)=>i===index?next:b)});}
 function choose(next:RoutineVariant){
  if(next==='custom'){setVariant(next);return;}
  setDraft({...templateRoutine(template??'custom',next,preferences),id:draft.id,name:draft.name,createdAt:draft.createdAt,practiceAudio:draft.practiceAudio});setVariant(next);
 }
 function move(index:number,step:number){const rows=[...draft.stages];[rows[index],rows[index+step]]=[rows[index+step],rows[index]];change({...draft,stages:rows});}
 function add(){
  const block:RoutineStage=adding==='meditation'?{id:crypto.randomUUID(),kind:'meditation',presetId:'meditation',durationSeconds:300,audioPolicy:'custom',sound:developedRecipe(preferences)}
   :adding==='settling'?{id:crypto.randomUUID(),kind:'settling',presetId:'settling',durationSeconds:60}
   :adding.startsWith('hormesis')?{id:crypto.randomUUID(),...hormesisConfig(adding==='hormesis-two'?'two':adding==='hormesis-foundation'?'foundation':'advanced')}
   :{id:crypto.randomUUID(),...cyclePattern(adding as PatternId,5)};
  change({...draft,stages:[...draft.stages,block]});
 }
 const config=withPracticeNarration({kind:'routine',routine:draft,guidanceProfile:'soft-felt-marshall.1'},{...preferences,practiceNarration:narration});
 let seconds:number|undefined,issue='';
 try{seconds=createSnapshot(withPracticeNarration({kind:'routine',routine:{...draft,name:draft.name||'My routine'},guidanceProfile:'soft-felt-marshall.1'},{...preferences,practiceNarration:narration})).plannedDurationSeconds;}catch(e){issue=e instanceof Error?e.message:'Review your choices.';}
 async function action(start:boolean){
  setError('');if(!draft.name.trim()){setError('Give this routine a name.');return;}setBusy(true);
  try{validateRoutine(draft);if(start)await onStart(config);else{await routineRepository.save(draft);onSaved();}}
  catch(e){setError(e instanceof Error?e.message:'Your choices are still here. Please try again.');}finally{setBusy(false);}
 }
 return <div className="detail-layout">
  <button className="back" disabled={busy} onClick={onBack}><Icon name="back" size={16}/>All routines</button>
  <p className="eyebrow">YOUR PRACTICE, YOUR WAY</p><h1>{template?draft.name:'Create your own routine'}</h1>
  <p className="intro">A sequence of complete breaths, comfortable recovery, and room to meditate.</p>
  {error&&<p className="notice" role="alert">{error}</p>}
  {template&&<div className="segmented" aria-label="Routine length">{(['short','unhurried','custom'] as const).map(v=><button key={v} className="choice" disabled={busy} aria-pressed={variant===v} onClick={()=>choose(v)}>{v==='short'?'Short':v==='unhurried'?'Unhurried':'Custom'}</button>)}</div>}
  <p className="subtext">{variant==='short'?'The original sequence.':variant==='unhurried'?'More time for paced breathing or meditation. Hormesis rounds and retention targets stay the same.':'Adjust your sequence below.'} Longer is optional, with no required feeling or outcome.</p>
  <section className="panel routine-summary"><h2>Your sequence</h2><ol>{draft.stages.map((b,i)=><li key={b.id}>{blockName(b)}{b.kind==='patterned'?' · '+b.cycles+' cycles':b.kind==='meditation'?' · '+b.durationSeconds/60+' minutes':b.kind==='settling'?' · '+b.durationSeconds+' seconds':''}</li>)}</ol></section>
  {hormesis&&<p className="notice">{HORMESIS_SAFETY}</p>}
  <details open={variant==='custom'}><summary>Customize sequence</summary>
  <label className="field"><span>Routine name</span><input aria-label="Routine name" maxLength={80} placeholder="My own rhythm" disabled={busy} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
  <ol className="routine-blocks designer-blocks">{draft.stages.map((block,index)=><li className="builder-block" key={block.id}>
   <p className="eyebrow">Block {index+1}</p><h2>{blockName(block)}</h2>
   {block.kind==='patterned'?<>
    <label className="field"><span>Block {index+1} breathing cycles</span><input aria-label={'Block '+(index+1)+' breathing cycles'} type="number" min="1" max={Math.min(100,Math.floor(1800/patterns[block.presetId].seconds.reduce((a,b)=>a+b,0)))} value={Number.isFinite(block.cycles)?block.cycles:''} disabled={busy} onChange={e=>{const cycles=e.target.value===''?NaN:Number(e.target.value);replace(index,{...block,cycles,durationSeconds:cycles*patterns[block.presetId].seconds.reduce((a,b)=>a+b,0)});}}/></label>
    <p className="subtext">Complete cycles; the inhale, holds and exhale finish in full.</p>
   </>:block.kind==='hormesis'?<HormesisDetails config={block}/>
   :block.kind==='settling'?<label className="field"><span>Natural breathing · seconds</span><input aria-label={'Block '+(index+1)+' settling seconds'} type="number" min="30" max="600" value={Number.isFinite(block.durationSeconds)?block.durationSeconds:''} disabled={busy} onChange={e=>replace(index,{...block,durationSeconds:e.target.value===''?NaN:Number(e.target.value)})}/></label>
   :block.kind==='meditation'?<>
    <label className="field"><span>Meditation time · minutes</span><select aria-label={'Block '+(index+1)+' meditation minutes'} value={block.durationSeconds/60} disabled={busy} onChange={e=>replace(index,{...block,durationSeconds:Number(e.target.value)*60})}>{[5,10,15,20,30,45,60].map(n=><option key={n} value={n}>{n} minutes</option>)}</select></label>
    <AcousticScenePicker id={'routine-scene-'+block.id} value={block.audioPolicy==='silent'?'off':block.sound?.acoustic?.scene??'threshold'} seconds={block.durationSeconds} disabled={busy} onChange={scene=>{if(scene==='legacy')return;replace(index,scene==='off'?{...block,audioPolicy:'silent',sound:undefined}:{...block,audioPolicy:'custom',sound:developedRecipe({...preferences,meditation:{...preferences.meditation,acousticScene:scene}})});}}/>
    <p className="subtext">Meditation begins directly. No preparation repeats.</p>
   </>:null}
   <div className="action-row"><button type="button" disabled={busy||index===0} aria-label={'Move block '+(index+1)+' up'} onClick={()=>move(index,-1)}>Move up</button><button type="button" disabled={busy||index===draft.stages.length-1} aria-label={'Move block '+(index+1)+' down'} onClick={()=>move(index,1)}>Move down</button><button type="button" disabled={busy||draft.stages.length===1} aria-label={'Remove block '+(index+1)} onClick={()=>change({...draft,stages:draft.stages.filter((_,i)=>i!==index)})}>Remove</button></div>
  </li>)}</ol>
  <section className="detail-panel"><label className="field"><span>Add to your routine</span><select aria-label="Add to your routine" disabled={busy} value={adding} onChange={e=>setAdding(e.target.value)}>{Object.entries(patterns).map(([id,p])=><option key={id} value={id}>{p.name}</option>)}<option value="hormesis-two">Hormesis · Two rounds</option><option value="hormesis-foundation">Hormesis · Foundation</option><option value="hormesis-advanced">Hormesis · Advanced</option><option value="settling">Natural breathing / settle</option><option value="meditation">Meditation</option></select></label><button disabled={busy||draft.stages.length>=MAX_BLOCKS} onClick={add}>Add block</button></section>
  </details>{hormesis&&<RecoverySoundPicker value={preferences.recoveryHoldSound??'chords'} disabled={busy} onChange={recoveryHoldSound=>onPreferencesChange?.({...preferences,recoveryHoldSound})}/>}<PracticeSoundPreview runtime={runtime} config={config} preferences={preferences} disabled={busy}/><PracticeNarrationControl value={narration} disabled={busy} onChange={mode=>{setNarration(mode);onPreferencesChange?.({...preferences,practiceNarration:mode});}}/><PracticeAudioControls narration={narration} value={draft.practiceAudio??defaultPracticeAudio()} hormesis={hormesis} disabled={busy} onChange={practiceAudio=>setDraft({...draft,practiceAudio})}/>
  {issue&&<p className="notice" role="alert">{issue}</p>}
  {seconds!==undefined&&<p className="saved-summary" role="status">Total planned time: {formatDuration(seconds)}, including spoken introductions and transitions. Early Release shortens the actual session.</p>}
  <p className="subtext">Your narration choice applies to breathing practice. Meditation begins without repeated preparation; journeys keep their own voice settings.</p>
  <div className="practice-actions"><button className="button primary" disabled={busy||!!issue} onClick={()=>void action(true)}>{busy?'Getting ready…':'Start routine'}</button><button className="button" disabled={busy||!!issue} onClick={()=>void action(false)}>Save routine</button></div>
 </div>;
}
