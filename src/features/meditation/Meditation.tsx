import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Preferences, NoiseColor, BinauralMode } from '../../settings/preferences';
import type { PracticeRuntime } from '../../session/runtime';
import type { PracticeConfig } from '../../session/config';
import { MediaSettings } from '../../media/MediaSettings';
import { mediaLibrary } from '../../media/library';
import { signalProfile } from '../../meditation/profile';
const emptyNoise={playing:false,preview:false,color:'off',error:''};
const emptyTone={playing:false,preview:false,mode:'off',error:''};
export function MeditationAudio({preferences:p,onChange,runtime,running=false}: {preferences:Preferences;onChange:(p:Preferences)=>void;runtime:PracticeRuntime;running?:boolean;onChooseTrack?:()=>void}) {
    const [offlineMissing,setOfflineMissing]=useState(false),[online,setOnline]=useState(()=>navigator.onLine);
    const noise=useSyncExternalStore(runtime.noise?.subscribe || (()=>()=>{}),runtime.noise?.getState || (()=>emptyNoise));
    const tone=useSyncExternalStore(runtime.binaural?.subscribe || (()=>()=>{}),runtime.binaural?.getState || (()=>emptyTone));
    const frozen=running?runtime.getState().session.snapshot?.meditationSound:undefined;
    const texture=frozen?.texture??p.meditation.noise,music=frozen?.music??p.meditation.music,mode=frozen?.mode??p.meditation.binaural.mode;
    const environment=music?(texture==='off'?'selected':'mix'):'generated';
    const set=(change:Partial<Preferences['meditation']>)=>onChange({...p,meditation:{...p.meditation,...change}});
    useEffect(()=>{const refresh=()=>setOnline(navigator.onLine);window.addEventListener('online',refresh);window.addEventListener('offline',refresh);return()=>{window.removeEventListener('online',refresh);window.removeEventListener('offline',refresh);};},[]);
    useEffect(()=>{let live=true;const source=p.background.source;if(online||!source.startsWith('ambience.')){setOfflineMissing(false);return;}mediaLibrary.get(`offline:${source}`).then(row=>{if(live)setOfflineMissing(!row);}).catch(()=>{if(live)setOfflineMissing(true);});return()=>{live=false;};},[online,p.background.source]);
    return <div className="meditation-audio"><h2>Sound environment</h2>
        <label htmlFor="meditation-environment">Environment</label><select id="meditation-environment" disabled={running} value={environment} onChange={event=>{const value=event.target.value;set({music:value!=='generated',noise:value==='selected'?'off':texture==='off'?'brown':texture});}}><option value="generated">Generated</option><option value="selected">Selected audio</option><option value="mix">Mix</option></select>
        {music&&<><p className="muted">Selected track: {runtime.background?.getState().name || (p.background.source==='none'?'none selected':p.background.source==='ambience.floating'?'Floating':p.background.source==='ambience.homeAgain'?'Home Again':'My Audio')}. {offlineMissing?'This track has no offline copy. Generated sound will continue.':'Save a built-in offline copy below for listening without a connection.'}</p>
            {!running&&<details><summary>Choose or import audio</summary><MediaSettings preferences={p} onChange={onChange} controller={runtime.background} running={false} libraryOnly/></details>}
            <label className="volume-control"><span>Selected audio level</span><input aria-label="Meditation music level" type="range" min="0" max="1" step=".01" value={p.volumes.ambience} onChange={event=>onChange({...p,volumes:{...p.volumes,ambience:Number(event.target.value)}})}/></label></>}
        <label htmlFor="meditation-noise">Masking texture</label><select id="meditation-noise" disabled={running} value={texture} onChange={event=>set({noise:event.target.value as NoiseColor|'off'})}><option value="off">Off</option><option value="brown">Warm</option><option value="pink">Balanced</option><option value="white">Broad Masking</option></select>
        {texture!=='off'&&<label className="volume-control"><span>Masking level <output>{Math.round(p.meditation.noiseVolume*100)}%</output></span><input aria-label="Noise volume" type="range" min="0" max=".35" step=".01" value={p.meditation.noiseVolume} onChange={event=>set({noiseVolume:Number(event.target.value)})}/></label>}
        <label htmlFor="meditation-binaural">Binaural layer</label><select id="meditation-binaural" disabled={running} value={mode} onChange={event=>set({binaural:{...p.meditation.binaural,mode:event.target.value as BinauralMode}})}><option value="off">Off</option><option value="baseline">Baseline</option><option value="layered">Layered</option><option value="modulated">Experimental Modulated</option></select>
        {mode!=='off'&&<><p className="muted">Use stereo headphones for the binaural layer. Keep it quiet beneath your masking or music. This sound has no proven medical or cognitive benefit.</p>{mode==='modulated'&&<p className="notice">Experimental amplitude modulation. Choose Baseline or Off if this feels distracting.</p>}<label className="volume-control"><span>Binaural level</span><input aria-label="Binaural level" type="range" min="0" max=".3" step=".01" value={p.meditation.binaural.level} onChange={event=>set({binaural:{...p.meditation.binaural,level:Number(event.target.value)}})}/></label></>}
        {running&&<p className="muted">Your sound recipe is fixed for this practice. Levels can be adjusted.</p>}
        {!running&&<><div className="practice-actions"><button type="button" onClick={()=>void runtime.previewNoise()}>Preview environment</button><button type="button" onClick={()=>runtime.stopNoisePreview()}>Stop preview</button></div><fieldset><legend>Soft signals</legend><label className="theme"><input type="checkbox" checked={p.meditation.openingSignal} onChange={event=>set({openingSignal:event.target.checked})}/>Opening signal</label><label className="theme"><input type="checkbox" checked={p.meditation.completionSignal} onChange={event=>set({completionSignal:event.target.checked})}/>Completion signal</label></fieldset><button type="button" onClick={()=>set({music:false,noise:'off',binaural:{...p.meditation.binaural,mode:'off'},openingSignal:false,completionSignal:false})}>Silent environment</button></>}
        {noise.error&&<p role="status" className="notice">{noise.error}</p>}
        {tone.error&&<p role="status" className="notice">{tone.error}</p>}
        <p className="muted">A steady masking bed, not active noise cancellation. No microphone is used. Keep listening volume comfortable.</p>
    </div>;
}
export function Meditation({preferences:p,onChange,runtime,onStart}: {preferences:Preferences;onChange:(p:Preferences)=>void;runtime:PracticeRuntime;onStart:(config:PracticeConfig)=>void;onChooseTrack?:()=>void}) {
    const presets=[5,10,15,20,30,45,60];
    const [custom,setCustom]=useState(()=>!presets.includes(p.meditation.durationMinutes)),[minutes,setMinutes]=useState(String(p.meditation.durationMinutes)),[error,setError]=useState('');
    const state=useSyncExternalStore(runtime.subscribe || (()=>()=>{}),runtime.getState || (()=>undefined));
    const busy=state?.starting || state?.session.status==='running';
    useEffect(()=>()=>runtime.stopNoisePreview(),[runtime]);
    function duration(value:string){setMinutes(value);const n=Number(value);if(Number.isInteger(n)&&n>=1&&n<=60)onChange({...p,meditation:{...p.meditation,durationMinutes:n}});}
    const n=Number(minutes),short=p.meditation.binaural.mode!=='off'&&Number.isInteger(n)&&n>=1&&n<10;
    const profile=Number.isInteger(n)&&n>=10&&n<=60?signalProfile(n*60):undefined;
    function start(){if(!Number.isInteger(n)||n<1||n>60){setError('Choose 1–60 whole minutes.');return;}if(short){setError('Binaural sessions need 10–60 minutes. Choose at least 10 minutes or turn the binaural layer Off for a shorter meditation.');return;}setError('');onStart({kind:'meditation',presetId:'meditation',durationSeconds:n*60,audioPolicy:'defaults'});}
    return <><p className="eyebrow">A QUIET MOMENT</p><h1>Meditation</h1><p className="intro">Settle in with a familiar breath, then let your attention rest.</p>{error&&<p className="notice" role="alert">{error}</p>}
        <section className="panel meditation-setup"><label htmlFor="meditation-duration">Meditation duration</label><select id="meditation-duration" disabled={busy} value={custom?'custom':minutes} onChange={event=>{if(event.target.value==='custom')setCustom(true);else{setCustom(false);duration(event.target.value);}}}>{presets.map(value=><option key={value} value={value}>{value} minutes</option>)}<option value="custom">Custom · 1–60 minutes</option></select>
        {custom&&<><label htmlFor="custom-meditation-minutes">Custom minutes</label><input id="custom-meditation-minutes" disabled={busy} type="number" min="1" max="60" step="1" value={minutes} onChange={event=>duration(event.target.value)}/></>}
        <p className="muted">Meditation time begins after the 4-second inhale, 6-second exhale and 3-second settle. Your sound environment enters softly during this preparation.</p>
        {short&&<p className="notice">Binaural sessions need 10–60 minutes. Choose a longer duration or set Binaural layer to Off. Short meditation remains available for masking, selected audio or silence.</p>}
        {p.meditation.binaural.mode!=='off'&&profile&&<p className="muted">Entry {(profile.entry/60).toFixed(1)} min · Steady {(profile.steady/60).toFixed(1)} min · Return {(profile.return/60).toFixed(1)} min. The tones stay at the same frequencies throughout.</p>}
        <MeditationAudio preferences={p} onChange={onChange} runtime={runtime} running={!!busy}/><button className="primary" disabled={busy} onClick={start}>Start meditation</button>
        {busy&&<p role="status">A practice is in progress. Open Practice to return to it.</p>}</section></>;
}
