import {useEffect} from 'react';
import {type Preferences} from '../settings/preferences';
import {type SoundRecipe,recipeSummary,preferencesFromRecipe,sceneRecipe} from './environment';
import {MediaSettings} from '../media/MediaSettings';
import type {PracticeRuntime} from '../session/runtime';
import {ACOUSTIC_SCENES,type AcousticSceneId} from './acoustic-scenes';
import {AcousticLevels} from './AcousticControls';

/** Shared recipe controls for saved meditation blocks and a routine's lead-in. */
export function RecipeEditor({recipe:r,onChange,preferences,runtime,id,foundation=false,seconds=600,hideScenePicker=false}:{recipe:SoundRecipe;onChange:(r:SoundRecipe)=>void;preferences:Preferences;runtime?:PracticeRuntime;id:string;foundation?:boolean;seconds?:number;hideScenePicker?:boolean}) {
    useEffect(()=>()=>runtime?.stopNoisePreview(),[runtime]);
    const set=(change:Partial<SoundRecipe>)=>{runtime?.stopNoisePreview();onChange({...r,...change});};
    const environment=foundation?(r.source==='none'?(r.texture==='off'?'off':'generated'):(r.texture==='off'?'selected':'mix')):r.acoustic?.scene??(r.texture==='off'&&r.source==='none'&&r.mode==='off'?'off':'legacy');
    const field=(name:string)=>`${id}-${name}`;
    const slider=(label:string,key:'noiseLevel'|'musicLevel'|'toneLevel'|'signalLevel',max:number)=><label className="volume-control"><span>{label} <output>{Math.round(r[key]*100)}%</output></span><input aria-label={`${id} ${label}`} type="range" min="0" max={max} step=".01" value={r[key]} onChange={e=>set({[key]:Number(e.target.value)})}/></label>;
    return <div className="meditation-audio">
        {!hideScenePicker&&<><label htmlFor={field('environment')}>{foundation?'Lead-in environment':'Block environment'}</label>
        <select id={field('environment')} value={environment} onChange={e=>{const v=e.target.value;if(ACOUSTIC_SCENES.some(s=>s.id===v)){runtime?.stopNoisePreview();onChange(sceneRecipe(r,v as AcousticSceneId,preferences));return;}if(!foundation&&v==='off'){const next={...r,texture:'off' as const,mode:'off' as const,source:'none',opening:'off' as const,closing:'off' as const};delete next.acoustic;runtime?.stopNoisePreview();onChange(next);return;}const next={...r,texture:v==='off'||v==='selected'?'off' as const:'brown' as const,source:v==='mix'||v==='selected'?(r.source==='none'?preferences.background.source==='none'?'ambience.floating':preferences.background.source:r.source):'none'};delete next.acoustic;runtime?.stopNoisePreview();onChange(next);}}>
            {foundation?<><option value="generated">Warm generated · from Start</option><option value="selected">Selected audio</option><option value="mix">Warm + Companion</option><option value="off">Off</option></>:<>{ACOUSTIC_SCENES.map(scene=><option key={scene.id} value={scene.id} disabled={scene.id==='flow'&&seconds<180}>{scene.name}</option>)}<option value="off">Silence</option>{environment==='legacy'&&<option value="legacy" disabled>Previous saved environment</option>}</>}
        </select></>}
        {r.acoustic&&<><p className="muted">{ACOUSTIC_SCENES.find(s=>s.id===r.acoustic!.scene)?.description} No preparation or spoken guidance is added. Use stereo headphones at a comfortable volume.</p><details><summary>Sound balance</summary><AcousticLevels id={id} mix={r.acoustic.mix} onChange={mix=>set({acoustic:{...r.acoustic!,mix}})}/></details></>}
        {foundation&&r.texture!=='off'&&<>{slider('Warm level','noiseLevel',.35)}{r.texture!=='brown'&&<p className="muted">Legacy {r.texture==='pink'?'Balanced':'Broad'} masking retained. Choosing Warm replaces it only when you save.</p>}</>}
        <details><summary>Companion audio</summary>{!foundation&&<label className="theme"><input type="checkbox" checked={r.source!=='none'} onChange={e=>set({source:e.target.checked?(preferences.background.source==='none'?'ambience.floating':preferences.background.source):'none'})}/>Add companion audio</label>}
        {r.source!=='none'&&<><p className="muted">Selected track: {r.source==='ambience.floating'?'Floating':r.source==='ambience.homeAgain'?'Home Again':'My Audio'}. Built-in tracks need a saved offline copy; imports stay on this device.</p>
            <details><summary>Choose or import audio</summary><MediaSettings preferences={preferencesFromRecipe(preferences,r)} onChange={p=>set({source:p.background.source})} running={false} libraryOnly/></details>
            {slider('Companion level','musicLevel',1)}<label className="theme"><input type="checkbox" checked={r.loop} onChange={e=>set({loop:e.target.checked})}/>Loop selected audio</label></>}
        </details>
        {!foundation&&<>
            {!r.acoustic&&environment==='legacy'&&<p className="muted">This saved environment is preserved. Choose a developed environment above to replace it.</p>}
            <fieldset><legend>Meditation signals</legend>{(['opening','closing'] as const).map(key=><div key={key}><label htmlFor={field(key)}>{key==='opening'?'Opening signal':'Closing signal'}</label><select id={field(key)} value={r[key]} onChange={e=>set({[key]:e.target.value})}><option value="off">Off</option><option value="bowl">Recorded singing bowl</option><option value="legacy">Legacy soft chime</option></select></div>)}
                {slider('Signal level','signalLevel',1)}<button type="button" onClick={()=>void runtime?.previewSignal(r)} disabled={!runtime||r.opening==='off'&&r.closing==='off'}>Preview signal</button>
            </fieldset>
        </>}
        <p className="muted">{recipeSummary(r)}</p>
        <div className="practice-actions"><button type="button" disabled={!runtime} onClick={()=>void runtime?.previewNoise(r)}>Preview environment</button><button type="button" onClick={()=>runtime?.stopNoisePreview()}>Stop preview</button></div>
    </div>;
}
