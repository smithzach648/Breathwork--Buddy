import {practicePreviewPlan} from '../../audio/practice-tones';
import {useEffect,useRef,useState} from 'react';
import type {PracticeConfig} from '../../session/config';
import type {PracticeRuntime} from '../../session/runtime';
import type {Preferences} from '../../settings/preferences';
import type {RecoveryHoldSound} from '../../session/recovery-sound';
export function RecoverySoundPicker({value,onChange,disabled=false}:{value:RecoveryHoldSound;onChange:(v:RecoveryHoldSound)=>void;disabled?:boolean}){
 return <><label className="field"><span>Recovery hold sound</span><select aria-label="Recovery hold sound" disabled={disabled} value={value} onChange={e=>onChange(e.target.value as RecoveryHoldSound)}><option value="chords">Warm chord pulses</option><option value="quiet">Quiet</option><option value="single">Single note · previous sound</option></select></label><p className="subtext">Only the recovery hold changes. Rising inhale and falling exhale notes stay familiar. Quiet keeps the visual timer and selected narration.</p></>;
}
export function PracticeSoundPreview({config,runtime,preferences,disabled=false}:{config:PracticeConfig;runtime?:PracticeRuntime;preferences:Preferences;disabled?:boolean}){
 const [playing,setPlaying]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const previewKey=JSON.stringify(practicePreviewPlan(config));
 const enabled=!!runtime&&preferences.guidance.breathSounds&&preferences.volumes.master>0&&preferences.volumes.breath>0;
 function stop(){generation.current++;if(timer.current)clearTimeout(timer.current);runtime?.stopNoisePreview();setPlaying(false);setBusy(false);}
 useEffect(()=>{const hidden=()=>{if(document.visibilityState==='hidden')stop();};document.addEventListener('visibilitychange',hidden);return()=>{generation.current++;if(timer.current)clearTimeout(timer.current);runtime?.stopNoisePreview();document.removeEventListener('visibilitychange',hidden);};},[runtime]);
 useEffect(()=>{if(playing||busy)stop();},[previewKey,preferences.recoveryHoldSound,enabled]);
 async function preview(){if(!runtime)return;const token=++generation.current;setBusy(true);setError('');try{const seconds=await runtime.previewPracticeTones(config);if(token!==generation.current)return;setBusy(false);if(!seconds){setError('Sound preview is unavailable. Check your sound levels.');return;}setPlaying(true);timer.current=setTimeout(()=>{if(token===generation.current){setPlaying(false);runtime.stopNoisePreview();}},seconds*1000+150);}catch{if(token===generation.current){setBusy(false);setError('Sound preview could not start. Please try again.');}}}
 return <section className="sound-preview"><button type="button" disabled={disabled||!enabled} onClick={()=>playing||busy?stop():void preview()}>{playing||busy?'Stop sound preview':'Preview breathing sounds'}</button><p className="subtext">{playing?'Listening sample playing. Breathe naturally.':busy?'Preparing sound…':!enabled?'Enable Breath sounds and raise Master and Breath volume to preview.':'A short listening sample only—breathe naturally. Sample phases are shortened; your practice timing stays the same.'}</p>{error&&<p role="status">{error}</p>}</section>;
}
