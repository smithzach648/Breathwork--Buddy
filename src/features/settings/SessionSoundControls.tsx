import {useEffect,useRef,useState} from 'react';
import type {Preferences} from '../../settings/preferences';
import type {PracticeRuntime,RuntimeState} from '../../session/runtime';
import {JourneyMixControls} from '../meditation-suite/JourneyMixControls';
import {PracticeNarrationControl} from '../practice/PracticeNarrationControl';
import {RecoverySoundPicker} from '../practice/PracticeSoundPreview';
import {changeMix,normalizeMix} from '../../meditation-suite/mix';
import {defaultPracticeAudio} from '../../session/practice-audio';
export function SessionSoundControls({preferences:p,onChange,runtime,state}:{preferences:Preferences;onChange:(p:Preferences)=>void;runtime:PracticeRuntime;state:RuntimeState}){
 const [open,setOpen]=useState(false),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const running=state.session.status==='running',journey=state.session.snapshot?.config.kind==='meditation-journey';
 const liveMix=state.audio.journey?.liveMix??state.audio.acoustic?.liveMix??normalizeMix(p.journeyMix);
 const background=state.session.snapshot?.meditationSound?.environment?.practice;
 const acoustic=!!state.audio.acoustic,meditating=state.session.stage?.phase==='meditation';
 useEffect(()=>{if(open){if(dialog.current?.showModal)dialog.current.showModal();else dialog.current?.setAttribute('open','');}},[open]);
 useEffect(()=>{if(!running)setOpen(false);},[running]);
 function close(){dialog.current?.close?.();setOpen(false);trigger.current?.focus();}
 function level(label:string,value:number,change:(v:number)=>void,disabled=false){return <label className="volume-control"><span>{label} <output>{Math.round(value*100)}%</output></span><input type="range" aria-label={label+' level'} min="0" max="1" step=".01" value={value} disabled={disabled} onChange={e=>change(Number(e.target.value))}/></label>;}
 function volume(bus:'master'|'voice'|'breath'|'signals',value:number){if(bus==='signals')runtime.audio.setSignalLevel?.(value);onChange({...p,volumes:{...p.volumes,[bus]:value},...(bus==='signals'?{meditation:{...p.meditation,signalLevel:value}}:{})});}
 function mix(next:typeof liveMix){runtime.setJourneyMix(next);onChange({...p,journeyMix:next});}
 if(!running)return null;
 return <><button className="sound-button" ref={trigger} type="button" aria-haspopup="dialog" onClick={()=>setOpen(true)}>Sound</button>{open&&<dialog ref={dialog} className="session-sound-dialog" aria-labelledby="session-sound-title" onCancel={e=>{e.preventDefault();close();}} onClose={()=>setOpen(false)} onClick={e=>{if(e.target===e.currentTarget)close();}}><div className="sound-sheet-content"><div className="sound-sheet-heading"><h2 id="session-sound-title">Session sound</h2><button type="button" onClick={close} aria-label="Close sound controls">Done</button></div><p className="subtext">Your session continues while you adjust the sound.</p>{level('Master',p.volumes.master,v=>volume('master',v))}{journey?<JourneyMixControls mix={liveMix} onChange={mix}/>:<>
 {level('Narration',p.volumes.voice,v=>volume('voice',v))}{level('Breathing tones',p.volumes.breath,v=>volume('breath',v))}
 {!meditating&&<>{level('Practice background',state.practiceBackgroundLevel??background?.level??0,v=>{runtime.setPracticeBackgroundLevel(v);onChange({...p,practiceAudio:{...(p.practiceAudio??background??defaultPracticeAudio()),level:v}});},!background||background.source==='off')}{(!background||background.source==='off')&&<p className="subtext">No practice background selected. Choose one before starting.</p>}</>}
 {level('Singing bowl',state.audio.signalLevel??state.session.stage?.soundRecipe?.signalLevel??p.meditation.signalLevel??p.volumes.signals,v=>volume('signals',v))}
 {acoustic&&<>{level('Warm environment',liveMix.levels.warm,v=>mix(changeMix(liveMix,'warm',v)))}{level('Binaural environment',liveMix.levels.binaural,v=>mix(changeMix(liveMix,'binaural',v)))}</>}
 {!meditating&&<details><summary>Practice guidance</summary><PracticeNarrationControl value={p.practiceNarration??'full'} running onChange={practiceNarration=>onChange({...p,practiceNarration})}/><RecoverySoundPicker value={p.recoveryHoldSound??'chords'} onChange={recoveryHoldSound=>onChange({...p,recoveryHoldSound})}/></details>}
 </>}<p className="subtext">Sound levels are saved on this device. Changing levels does not restart the practice.</p></div></dialog>}</>;
}
