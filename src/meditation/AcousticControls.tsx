import {ACOUSTIC_SCENES,type AcousticSceneId} from './acoustic-scenes';
import {changeMix,type ListenerMix} from '../meditation-suite/mix';
export function AcousticScenePicker({id,value,onChange,disabled=false,seconds=600}:{id:string;value:AcousticSceneId|'legacy'|'off';onChange:(value:AcousticSceneId|'legacy'|'off')=>void;disabled?:boolean;seconds?:number}){
 return <><label htmlFor={id}>Sound environment</label><select id={id} value={value} disabled={disabled} onChange={e=>onChange(e.target.value as AcousticSceneId|'legacy'|'off')}>{ACOUSTIC_SCENES.map(scene=><option value={scene.id} key={scene.id} disabled={scene.id==='flow'&&seconds<180}>{scene.name}</option>)}<option value="off">Silence</option>{value==='legacy'&&<option value="legacy" disabled>Previous saved environment</option>}</select></>;
}
export function AcousticLevels({mix,onChange,id='Environment'}:{mix:ListenerMix;onChange:(mix:ListenerMix)=>void;id?:string}){
 return <>{(['warm','binaural'] as const).map(key=><label key={key} className="volume-control"><span>{key==='warm'?'Warm sound':'Binaural tones'} <output>{Math.round(mix.levels[key]*100)}%</output></span><input aria-label={`${id} ${key} level`} type="range" min="0" max="1" step=".01" value={mix.levels[key]} onChange={e=>onChange(changeMix(mix,key,Number(e.target.value)))}/></label>)}</>;
}
