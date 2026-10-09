import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Preferences, NoiseColor } from '../../settings/preferences';
import type { PracticeRuntime } from '../../session/runtime';
import type { PracticeConfig } from '../../session/config';
import { mediaLibrary } from '../../media/library';
export function MeditationAudio({ preferences: p, onChange, runtime, running = false, onChooseTrack }: { preferences: Preferences; onChange: (p:Preferences)=>void; runtime:PracticeRuntime; running?:boolean; onChooseTrack?:()=>void }) {
    const [offlineMissing,setOfflineMissing]=useState(false);
    const [online,setOnline]=useState(()=>navigator.onLine);
    const noise=useSyncExternalStore(runtime.noise?.subscribe || (()=>()=>{}),runtime.noise?.getState || (()=>emptyNoise));
    useEffect(()=>{const refresh=()=>setOnline(navigator.onLine);window.addEventListener('online',refresh);window.addEventListener('offline',refresh);return()=>{window.removeEventListener('online',refresh);window.removeEventListener('offline',refresh);};},[]);
    useEffect(()=>{let live=true;const source=p.background.source;if(online||!source.startsWith('ambience.')){setOfflineMissing(false);return;}mediaLibrary.get(`offline:${source}`).then(row=>{if(live)setOfflineMissing(!row);}).catch(()=>{if(live)setOfflineMissing(true);});return()=>{live=false;};},[online,p.background.source]);
    const set=(change:Partial<Preferences['meditation']>)=>onChange({...p,meditation:{...p.meditation,...change}});
    return <div className="meditation-audio">
        <h2>Meditation Audio</h2>
        <label htmlFor="meditation-music">Music / ambience</label><select id="meditation-music" value={p.meditation.music?'selected':'off'} onChange={event=>set({music:event.target.value==='selected'})}><option value="off">Silence</option><option value="selected">Use selected background track</option></select>
        {p.meditation.music && <><p className="muted">Selected track: {runtime.background?.getState().name || (p.background.source==='none'?'none selected':p.background.source==='ambience.floating'?'Floating':p.background.source==='ambience.homeAgain'?'Home Again':'My Audio')}. {offlineMissing?'This track has no offline copy. Noise or silence will continue.':'For offline built-in music, save its offline copy in Settings.'}</p>{onChooseTrack&&<button type="button" onClick={onChooseTrack}>Choose or import a track</button>}
            <label className="volume-control"><span>Music level</span><input aria-label="Meditation music level" type="range" min="0" max="1" step=".01" value={p.volumes.ambience} onChange={event=>onChange({...p,volumes:{...p.volumes,ambience:Number(event.target.value)}})}/></label></>}
        <label htmlFor="meditation-noise">Noise masking</label><select id="meditation-noise" value={p.meditation.noise} onChange={event=>set({noise:event.target.value as NoiseColor|'off'})}><option value="off">Off</option><option value="white">White · brighter</option><option value="pink">Pink · balanced</option><option value="brown">Brown · deeper</option></select>
        {p.meditation.noise!=='off'&&<><label className="volume-control"><span>Noise level <output>{Math.round(p.meditation.noiseVolume*100)}%</output></span><input aria-label="Noise volume" type="range" min="0" max=".35" step=".01" value={p.meditation.noiseVolume} onChange={event=>set({noiseVolume:Number(event.target.value)})}/></label>{!running&&<div className="practice-actions"><button type="button" onClick={()=>void runtime.previewNoise()}>Preview noise</button><button type="button" onClick={()=>runtime.stopNoisePreview()}>Stop preview</button></div>}</>}
        {!running&&<fieldset><legend>Soft signals</legend><label className="theme"><input type="checkbox" checked={p.meditation.openingSignal} onChange={event=>set({openingSignal:event.target.checked})}/>Opening signal</label><label className="theme"><input type="checkbox" checked={p.meditation.completionSignal} onChange={event=>set({completionSignal:event.target.checked})}/>Completion signal</label></fieldset>}
        {noise.error&&<p role="status" className="notice">{noise.error}</p>}
        <p className="muted">A gentle masking bed, not active noise cancellation. No microphone is used. Keep speaker or headphone volume comfortable.</p>
        {!running&&<button type="button" onClick={()=>set({music:false,noise:'off',openingSignal:false,completionSignal:false})}>Silent environment</button>}
    </div>;
}
const emptyNoise={playing:false,preview:false,color:'off',error:''};
export function Meditation({ preferences:p,onChange,runtime,onStart,onChooseTrack }: { preferences:Preferences;onChange:(p:Preferences)=>void;runtime:PracticeRuntime;onStart:(config:PracticeConfig)=>void;onChooseTrack:()=>void }) {
    const [custom,setCustom]=useState(()=>![5,10,15,20,30].includes(p.meditation.durationMinutes)),[minutes,setMinutes]=useState(String(p.meditation.durationMinutes)),[error,setError]=useState('');
    useEffect(()=>()=>runtime.stopNoisePreview(),[runtime]);
    function duration(value:string){setMinutes(value);const n=Number(value);if(Number.isInteger(n)&&n>=1&&n<=60)onChange({...p,meditation:{...p.meditation,durationMinutes:n}});}
    function start(){const n=Number(minutes);if(!Number.isInteger(n)||n<1||n>60){setError('Choose 1–60 whole minutes.');return;}setError('');onStart({kind:'meditation',presetId:'meditation',durationSeconds:n*60,audioPolicy:'defaults'});}
    return <><p className="eyebrow">A QUIET MOMENT</p><h1>Meditation</h1><p className="intro">Settle in with a familiar breath, then let your attention rest.</p>{error&&<p className="notice" role="alert">{error}</p>}
        <section className="panel meditation-setup"><label htmlFor="meditation-duration">Meditation duration</label><select id="meditation-duration" value={custom?'custom':minutes} onChange={event=>{if(event.target.value==='custom'){setCustom(true);}else{setCustom(false);duration(event.target.value);}}}>{[5,10,15,20,30].map(n=><option key={n} value={n}>{n} minutes</option>)}<option value="custom">Custom · 1–60 minutes</option></select>
        {custom&&<><label htmlFor="custom-meditation-minutes">Custom minutes</label><input id="custom-meditation-minutes" type="number" min="1" max="60" step="1" value={minutes} onChange={event=>duration(event.target.value)}/></>}
        <p className="muted">Meditation time begins after the 4-second inhale, 6-second exhale and 3-second settle. Your sound environment enters softly during this preparation.</p>
        <MeditationAudio preferences={p} onChange={onChange} runtime={runtime} onChooseTrack={onChooseTrack}/><button className="primary" onClick={start}>Start meditation</button></section>
    </>;
}
