import {practiceAudioFor} from '../../session/practice-audio';
import {PracticeAudioControls} from './PracticeAudioControls';
import {PRACTICE_CARDS} from '../library/catalog';
import {Icon} from '../../components/Icon';
import {HormesisDetails} from './HormesisDetails';
import {hormesisConfig} from '../../session/hormesis';
import {withMeditation} from '../../session/practice-followup';
import {developedScene} from '../../meditation/environment';
import {AcousticScenePicker} from '../../meditation/AcousticControls';
import type {AcousticSceneId} from '../../meditation/acoustic-scenes';
import {PRACTICE_NARRATION} from '../../audio/practice-narration';
import { BlockDetails } from '../history/BlockDetails';
import { MeditationAudio } from '../meditation/Meditation';
import { defaultPreferences, type Preferences } from '../../settings/preferences';
import { useState } from 'react';
import type { PracticeRuntime, RuntimeState } from '../../session/runtime';
import { createSnapshot,cyclePattern,patterns, type ExerciseConfig,type PatternId, type PracticeConfig } from '../../session/config';
import { formatDuration } from '../../shared/format';
import { BackgroundControls } from '../../media/MediaSettings';
import {signalProfile} from '../../meditation/profile';
export function Practice({ runtime, state, onDone, onRoutines, onMeditation, preferences = defaultPreferences(), onPreferencesChange,initialPreset='box',onReflect }: {
    runtime: PracticeRuntime;
    state: RuntimeState;
    onDone: () => void;
    onRoutines?: () => void;
    onMeditation?: () => void;
    preferences?: Preferences;
    onPreferencesChange?: (p:Preferences)=>void;
    initialPreset?:PatternId|'hormesis-foundation'|'hormesis-advanced';
    onReflect?:(id:string,name:string)=>void;
}) {
    const [preset, setPreset] = useState<PatternId | 'hormesis-foundation' | 'hormesis-advanced'>(initialPreset);
    const [breathingCycles,setBreathingCycles]=useState(10);
    const [addMeditation,setAddMeditation]=useState(false),[meditationMinutes,setMeditationMinutes]=useState(5),[meditationScene,setMeditationScene]=useState<AcousticSceneId|'off'>(()=>developedScene(preferences));
    const [practiceAudio,setPracticeAudio]=useState(()=>practiceAudioFor(preferences));
    const [error, setError] = useState('');
    const session = state.session;
    const meditating = session.stage?.phase === 'meditation';
    const nextStage=session.snapshot?.stages[(session.snapshot?.stages.indexOf(session.stage!)??-1)+1];
    const enteringMeditation=session.stage?.phase==='block-transition'&&nextStage?.phase==='meditation';
    const stageLabel=enteringMeditation?'Settle into the sound':session.stage?.label;
    const envelope=meditating&&!session.stage?.soundRecipe?.acoustic&&session.stage!.durationMs>=600000&&(session.stage?.soundRecipe?.mode??session.snapshot?.meditationSound?.mode)!=='off'&&session.snapshot?.meditationSound?signalProfile(session.stage!.durationMs/1000):undefined;
    const elapsed=meditating?(session.stage!.durationMs-session.remainingMs)/1000:0;
    const hormesis = preset.startsWith('hormesis');
    function selectedPractice():ExerciseConfig{return hormesis?hormesisConfig(preset==='hormesis-foundation'?'foundation':'advanced'):cyclePattern(preset as PatternId,breathingCycles);}
    function selection():PracticeConfig{const practice=selectedPractice();if(addMeditation){const c=withMeditation(practice,meditationMinutes,meditationScene,preferences);return c.kind==='routine'?{...c,routine:{...c.routine,practiceAudio}}:c;}return {...practice,guidanceProfile:'soft-felt-marshall.1',practiceAudio};}
    let plannedSeconds:number|undefined;try{plannedSeconds=createSnapshot(selection()).plannedDurationSeconds;}catch{/* Start shows invalid selections. */}
    async function start(config?: PracticeConfig) {
        try {
            await runtime.start(config??selection(),config?session.snapshot?.meditationSound:undefined);
            setError('');
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Practice could not start.');
        }
    }
    if (state.starting) return <><h1>Getting ready</h1><p role="status">Preparing your local audio before practice begins…</p><button onClick={() => runtime.cancelStart()}>Cancel start</button></>;
    if (session.status === 'running')
        return <>
    <p className="eyebrow">YOUR PRACTICE</p><h1>{meditating ? 'Meditation' : 'Practice'}</h1>
    <section className="panel active-practice">
      {(!meditating || session.snapshot!.config.kind === 'routine') && <p>{session.snapshot!.name}</p>}
      {session.stage?.blockId && <p className="muted">Block {session.stage.blockIndex! + 1} · {session.stage.blockName}</p>}
      {session.stage?.finalBreath&&<p className='eyebrow'>FINAL BREATH · ROUND {session.stage.round}</p>}
      {session.stage?.introClipId&&<p className='suite-prompt'>{PRACTICE_NARRATION[session.stage.introClipId]?.script}</p>}
      <p className={meditating ? 'stage-title sr-only' : 'stage-title'}>{stageLabel}</p>
      {!enteringMeditation&&(!meditating || preferences.meditation.showTimer) && <p className="stage-time" role="timer" aria-live="off" aria-label="Stage time remaining">{formatDuration(session.remainingMs / 1000)}</p>}
      <p className={meditating ? 'sr-only' : undefined} role="status" aria-live="polite" aria-atomic="true">{stageLabel}{(session.snapshot!.config.kind === 'hormesis' || session.snapshot!.config.kind === 'hormesis-round' || session.stage!.blockKind === 'hormesis' || session.stage!.blockKind === 'hormesis-round') && session.stage!.round > 0 && session.stage!.phase !== 'round-announcement' ? ` · Round ${session.stage!.round} of ${session.stage!.totalRounds}` : ''}</p>
      {(['inhale','hold-in','exhale','hold-out','pre-retention-exhale'].includes(session.stage!.phase)) && <p className="muted">{(session.snapshot!.config.kind === 'hormesis' || session.snapshot!.config.kind === 'hormesis-round' || session.stage!.blockKind === 'hormesis' || session.stage!.blockKind === 'hormesis-round') ? 'Breath' : 'Cycle'} {session.stage!.cycle} of {session.stage!.totalCycles}</p>}
      {meditating && onPreferencesChange && <button onClick={() => onPreferencesChange({...preferences,meditation:{...preferences.meditation,showTimer:!preferences.meditation.showTimer}})}>{preferences.meditation.showTimer ? 'Hide timer' : 'Show timer'}</button>}
      {envelope&&session.stage?.meditationPolicy!=='silent'&&<p className="muted">{elapsed<envelope.entry?'Entry':elapsed<envelope.entry+envelope.steady?'Steady':'Return'}</p>}
      {meditating && !session.stage?.soundRecipe?.acoustic && session.stage!.durationMs<600000 && (session.stage?.soundRecipe?.mode??session.snapshot?.meditationSound?.mode)!=='off' && session.snapshot?.meditationSound && session.stage!.meditationPolicy!=='silent' && <p className="notice">This short block uses masking and selected audio only. Binaural sessions need at least 10 minutes; your selected mode stays saved.</p>}
      <div className="practice-actions">
        {session.stage?.holdGuidance&&session.stage.phase==='retention'&&session.stage.durationMs-session.remainingMs>=20000&&session.stage.durationMs-session.remainingMs<42000&&<p className='suite-prompt'>{PRACTICE_NARRATION['practice.hold.soften.1'].script}</p>}
      {session.releaseAvailable && <button className="primary" onClick={() => runtime.engine.releaseRetention()}>Release retention</button>}
        <button onClick={() => runtime.engine.stop(meditating ? 'ended-early' : undefined)}>{meditating ? 'End Early' : 'Stop practice'}</button>
      </div>
      {session.stage?.blockKind === 'hormesis-round' && <details><summary>Comfort and early Release</summary><p className="muted">The retention target is optional. Release whenever you wish and recover comfortably. Rapid breathing or retention can cause dizziness or fainting: practice seated or lying down, never in water, while driving, or where fainting could cause injury. Stop for dizziness, chest symptoms or significant discomfort.</p></details>}
      {!meditating && <p className="muted">Elapsed {formatDuration(session.elapsedMs / 1000)}</p>}
      {meditating && session.stage?.meditationPolicy === 'silent' ? <p className="muted">Silent environment</p> : meditating && onPreferencesChange ? <MeditationAudio preferences={preferences} onChange={onPreferencesChange} runtime={runtime} running/> : <BackgroundControls controller={runtime.background}/>}
      {session.snapshot!.config.kind === 'patterned' && runtime.background?.getMode() === 'retention' && <p className="muted">Retention-only background is unavailable for this practice. Choose Entire practice in Settings to hear background audio.</p>}
      {state.audio.acoustic?.error&&<p role="status" className="notice">{state.audio.acoustic.error}</p>}
      {state.audio.failures.length > 0 && <p className="muted">Some audio is unavailable. Practice timing continues normally.</p>}
    </section>
  </>;
    if (session.result)
        return <>
    <p className="eyebrow">YOUR PRACTICE</p><h1>{session.status === 'completed' ? 'Completed' : session.result.endReason === 'ended-early' ? 'Ended early' : 'Cancelled'}</h1>
    <section className="panel">
      <h2>{session.snapshot!.name}</h2><p>Duration {formatDuration(session.result.actualDurationSeconds)}</p>
      {session.result.patternedBreathing&&<p className="muted">{session.result.patternedBreathing.completedCycles} of {session.result.patternedBreathing.requestedCycles} complete breathing cycles</p>}
      {session.result.meditation && <p>Meditation time {formatDuration(session.result.meditation.actualDurationSeconds)} of {formatDuration(session.result.meditation.plannedDurationSeconds)} planned</p>}
      {session.result.blocks && <><p>{session.result.blocksCompleted} of {session.result.totalBlocks} blocks completed</p><ul>{session.result.blocks.map(block => <li key={block.id}>{block.name} · {block.outcome === 'not-started' ? 'not started' : block.outcome}<BlockDetails block={block}/></li>)}</ul></>}
      {session.snapshot!.config.kind === 'hormesis' && <p>Rounds completed: {session.result.roundsCompleted} of {session.snapshot!.config.retentions.length}</p>}
      {!!session.result.retentions?.length && <ul className="retention-results">{session.result.retentions.map(r => <li key={r.stageId}>Round {r.round}: {r.durationSeconds.toFixed(1)} seconds{r.outcome === 'released' ? ' · released early' : r.outcome === 'cancelled' ? ' · cancelled' : ''}</li>)}</ul>}
      <p className="muted">{state.saving ? 'Saving on this device…' : state.saveError ? 'Not yet saved. Retry using the message above.' : 'Saved on this device.'}</p>
      {session.status === 'completed' && <BackgroundControls controller={runtime.background}/>}
      {onReflect&&<button className="button primary wide" onClick={()=>onReflect(session.result!.id,session.snapshot!.name)}>Write a reflection</button>}
      <div className="practice-actions"><button onClick={() => start(session.snapshot!.config)}>Start again</button><button onClick={() => { runtime.engine.reset(); onDone(); }}>Done / Home</button></div>
    </section>
  </>;
    return <>
    <p className="eyebrow">BREATHE</p><h1>{PRACTICE_CARDS.find(p=>p.preset===preset)?.name??"Practice"}</h1><div className="detail-art"><div className="orb"><Icon name="breathe" size={40}/></div></div>
    <p className="intro">Choose a rhythm. Follow the guidance at a pace that feels comfortable.</p>
    {(onMeditation||onRoutines)&&<details><summary>More ways to practice</summary>{onMeditation&&<button onClick={onMeditation}>Explore meditation</button>}{onRoutines&&<button onClick={onRoutines}>My Routines</button>}</details>}
    {error && <p role="alert" className="notice">{error}</p>}
    <section className="panel practice-config">
      <details><summary>Choose another practice</summary><label htmlFor="preset">Practice</label>
      <select id="preset" value={preset} onChange={e => setPreset(e.target.value as typeof preset)}>
        {Object.entries(patterns).map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}
        <option value="hormesis-foundation">Hormesis · Foundation</option><option value="hormesis-advanced">Hormesis · Advanced</option>
      </select></details>
      {!hormesis ? <><label htmlFor="breathing-cycles">Breathing cycles</label><div className="segmented" aria-label="Complete breathing cycles">{[5,10,20,...(preset==='coherent'?[25]:[])].map(n=><button className="choice" key={n} aria-pressed={breathingCycles===n} onClick={()=>setBreathingCycles(n)}>{n} cycles</button>)}</div><details><summary>Choose another cycle count</summary><input aria-label="Breathing cycles" id="breathing-cycles" type="number" min="1" max={Math.min(100,Math.floor(1800/patterns[preset as PatternId].seconds.reduce((a,b)=>a+b,0)))} step="1" value={Number.isFinite(breathingCycles)?breathingCycles:''} onChange={e=>setBreathingCycles(e.target.value===''?NaN:Number(e.target.value))}/></details><p className="muted">One cycle includes the full inhale, any holds, and exhale. {Number.isFinite(breathingCycles)&&`${formatDuration(patterns[preset as PatternId].seconds.reduce((a,b)=>a+b,0)*breathingCycles)} breathing + 25-second introduction.`}</p></> : <HormesisDetails config={selectedPractice() as Extract<ExerciseConfig,{kind:'hormesis'}>}/>}
      <PracticeAudioControls value={practiceAudio} hormesis={hormesis} onChange={next=>{setPracticeAudio(next);onPreferencesChange?.({...preferences,practiceAudio:next});}}/>
      <label className="theme"><input type="checkbox" checked={addMeditation} onChange={e=>setAddMeditation(e.target.checked)}/>Add meditation afterward</label>
      {addMeditation&&<><label htmlFor="followup-minutes">Meditation afterward · minutes</label><select id="followup-minutes" value={meditationMinutes} onChange={e=>setMeditationMinutes(Number(e.target.value))}>{[5,10,15,20,30].map(n=><option value={n} key={n}>{n} minutes</option>)}</select><AcousticScenePicker id="followup-scene" value={meditationScene} seconds={meditationMinutes*60} onChange={s=>{if(s!=='legacy')setMeditationScene(s);}}/><p className="muted">After the final recovery and a short transition, meditation begins automatically. No preparation is repeated.</p></>}
      {plannedSeconds!==undefined&&<p className="muted" role="status">Total planned time: {formatDuration(plannedSeconds)}, including the introduction{addMeditation?', transition and meditation':''}. Retention can be released early.</p>}
      <button className="primary" onClick={() => start()}>Start practice</button>
      <p className="muted">Marshall introduces your exercise before the Soft Felt notes begin.{hormesis?' Your selected introduction lasts 90 seconds, including space between phrases.':' All selected cycles begin after the 25-second introduction and finish in full.'}</p>
      <p className="muted">Voice and breath levels can be adjusted in Settings.</p>
    </section>
  </>;
}
