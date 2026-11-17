import {useEffect} from 'react';
import {type Preferences} from '../settings/preferences';
import {type SoundRecipe,recipeSummary,preferencesFromRecipe,sceneRecipe} from './environment';
import {MediaSettings} from '../media/MediaSettings';
import type {PracticeRuntime} from '../session/runtime';
import {ACOUSTIC_SCENES,type AcousticSceneId} from './acoustic-scenes';
import {AcousticLevels} from './AcousticControls';

/** Shared recipe controls for saved meditation blocks and a routine's lead-in. */
export function RecipeEditor({recipe:r,onChange,preferences,runtime,id,foundation=false,seconds=600}:{recipe:SoundRecipe;onChange:(r:SoundRecipe)=>void;preferences:Preferences;runtime?:PracticeRuntime;id:string;foundation?:boolean;seconds?:number}) {
    useEffect(()=>()=>runtime?.stopNoisePreview(),[runtime]);
    const set=(change:Partial<SoundRecipe>)=>{runtime?.stopNoisePreview();onChange({...r,...change});};
    const environment=r.acoustic?r.acoustic.scene:r.source==='none'?(r.texture==='off'?'off':'generated'):(r.texture==='off'?'selected':'mix');
    const field=(name:string)=>`${id}-${name}`;
    const slider=(label:string,key:'noiseLevel'|'musicLevel'|'toneLevel'|'signalLevel',max:number)=><label className="volume-control"><span>{label} <output>{Math.round(r[key]*100)}%</output></span><input aria-label={`${id} ${label}`} type="range" min="0" max={max} step=".01" value={r[key]} onChange={e=>set({[key]:Number(e.target.value)})}/></label>;
    return <div className="meditation-audio">
        <label htmlFor={field('environment')}>{foundation?'Lead-in environment':'Block environment'}</label>
        <select id={field('environment')} value={environment} onChange={e=>{const v=e.target.value;if(ACOUSTIC_SCENES.some(s=>s.id===v)){runtime?.stopNoisePreview();onChange(sceneRecipe(r,v as AcousticSceneId,preferences));return;}const next={...r,texture:v==='off'||v==='selected'?'off' as const:'brown' as const,source:v==='mix'||v==='selected'?(r.source==='none'?preferences.background.source==='none'?'ambience.floating':preferences.background.source:r.source):'none'};delete next.acoustic;runtime?.stopNoisePreview();onChange(next);}}>
            {!foundation&&ACOUSTIC_SCENES.map(scene=><option key={scene.id} value={scene.id} disabled={scene.id==='flow'&&seconds<180}>{scene.name}</option>)}<option value="generated">Warm generated{foundation?' · from Start':''}</option><option value="selected">Selected audio</option><option value="mix">Warm + Companion</option><option value="off">Off</option>
        </select>
        {r.acoustic&&<><p className="muted">{ACOUSTIC_SCENES.find(s=>s.id===r.acoustic!.scene)?.description} No preparation or spoken guidance is added. Use stereo headphones at a comfortable volume.</p><AcousticLevels id={id} mix={r.acoustic.mix} onChange={mix=>set({acoustic:{...r.acoustic!,mix}})}/></>}
        {r.texture!=='off'&&<>{slider('Warm level','noiseLevel',.35)}{r.texture!=='brown'&&<p className="muted">Legacy {r.texture==='pink'?'Balanced':'Broad'} masking retained. Choosing Warm replaces it only when you save.</p>}</>}
        {r.source!=='none'&&<><p className="muted">Selected track: {r.source==='ambience.floating'?'Floating':r.source==='ambience.homeAgain'?'Home Again':'My Audio'}. Built-in tracks need a saved offline copy; imports stay on this device.</p>
            <details><summary>Choose or import audio</summary><MediaSettings preferences={preferencesFromRecipe(preferences,r)} onChange={p=>set({source:p.background.source})} running={false} libraryOnly/></details>
            {slider('Companion level','musicLevel',1)}<label className="theme"><input type="checkbox" checked={r.loop} onChange={e=>set({loop:e.target.checked})}/>Loop selected audio</label></>}
        {!foundation&&<>
            {!r.acoustic&&<><label htmlFor={field('tones')}>Block binaural layer</label><select id={field('tones')} value={r.mode} onChange={e=>set({mode:e.target.value as SoundRecipe['mode']})}><option value="off">Off</option><option value="baseline">Baseline</option><option value="layered">Layered</option><option value="modulated">Experimental Modulated</option></select>
            {r.mode!=='off'&&<><p className="muted">Use stereo headphones, with quiet tones beneath Warm or music. Blocks under 10 minutes omit tones. No medical or cognitive benefit is proven.</p>{slider('Binaural level','toneLevel',.3)}</>}
            </>}<fieldset><legend>Meditation signals</legend>{(['opening','closing'] as const).map(key=><div key={key}><label htmlFor={field(key)}>{key==='opening'?'Opening signal':'Closing signal'}</label><select id={field(key)} value={r[key]} onChange={e=>set({[key]:e.target.value})}><option value="off">Off</option><option value="bowl">Recorded singing bowl</option><option value="legacy">Legacy soft chime</option></select></div>)}
                {slider('Signal level','signalLevel',1)}<button type="button" onClick={()=>void runtime?.previewSignal(r)} disabled={!runtime||r.opening==='off'&&r.closing==='off'}>Preview signal</button>
            </fieldset>
        </>}
        <p className="muted">{recipeSummary(r)}</p>
        <div className="practice-actions"><button type="button" disabled={!runtime} onClick={()=>void runtime?.previewNoise(r)}>Preview environment</button><button type="button" onClick={()=>runtime?.stopNoisePreview()}>Stop preview</button></div>
    </div>;
}
