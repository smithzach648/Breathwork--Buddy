import { MeditationAudio } from '../meditation/Meditation';
import { defaultPreferences, type Preferences } from '../../settings/preferences';
import { useState } from 'react';
import type { PracticeRuntime, RuntimeState } from '../../session/runtime';
import { patterns, type PatternId, type PracticeConfig } from '../../session/config';
import { formatDuration } from '../../shared/format';
import { BackgroundControls } from '../../media/MediaSettings';
export function Practice({ runtime, state, onDone, onRoutines, onMeditation, preferences = defaultPreferences(), onPreferencesChange }: {
    runtime: PracticeRuntime;
    state: RuntimeState;
    onDone: () => void;
    onRoutines?: () => void;
    onMeditation?: () => void;
    preferences?: Preferences;
    onPreferencesChange?: (p:Preferences)=>void;
}) {
    const [preset, setPreset] = useState<PatternId | 'hormesis-60' | 'hormesis-progressive'>('box');
    const [duration, setDuration] = useState(300);
    const [interval, setInterval] = useState<2 | 3>(2);
    const [cycles, setCycles] = useState<20 | 30 | 40>(30);
    const [error, setError] = useState('');
    const session = state.session;
    const meditating = session.stage?.phase === 'meditation';
    const hormesis = preset.startsWith('hormesis');
    async function start(config?: PracticeConfig) {
        try {
            await runtime.start(config || (hormesis ? { kind: 'hormesis', presetId: preset as 'hormesis-60' | 'hormesis-progressive', intervalSeconds: interval, cycles, retentions: preset === 'hormesis-60' ? [60, 60, 60] : [60, 90, 90], recoveryHoldSeconds: 15 } : { kind: 'patterned', presetId: preset as PatternId, durationSeconds: duration }));
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
      <p className={meditating ? 'stage-title sr-only' : 'stage-title'}>{session.stage!.label}</p>
      {(!meditating || preferences.meditation.showTimer) && <p className="stage-time" role="timer" aria-live="off" aria-label="Stage time remaining">{formatDuration(session.remainingMs / 1000)}</p>}
      <p className={meditating ? 'sr-only' : undefined} role="status" aria-live="polite" aria-atomic="true">{session.stage!.label}{(session.snapshot!.config.kind === 'hormesis' || session.stage!.blockKind === 'hormesis') && session.stage!.round > 0 && session.stage!.phase !== 'round-announcement' ? ` · Round ${session.stage!.round} of ${session.stage!.totalRounds}` : ''}</p>
      {(session.stage!.phase === 'inhale' || session.stage!.phase === 'exhale') && <p className="muted">{(session.snapshot!.config.kind === 'hormesis' || session.stage!.blockKind === 'hormesis') ? 'Breath' : 'Cycle'} {session.stage!.cycle} of {session.stage!.totalCycles}</p>}
      {meditating && onPreferencesChange && <button onClick={() => onPreferencesChange({...preferences,meditation:{...preferences.meditation,showTimer:!preferences.meditation.showTimer}})}>{preferences.meditation.showTimer ? 'Hide timer' : 'Show timer'}</button>}
      <div className="practice-actions">
        {session.releaseAvailable && <button className="primary" onClick={() => runtime.engine.releaseRetention()}>Release retention</button>}
        <button onClick={() => runtime.engine.stop(meditating ? 'ended-early' : undefined)}>{meditating ? 'End Early' : 'Stop practice'}</button>
      </div>
      {!meditating && <p className="muted">Elapsed {formatDuration(session.elapsedMs / 1000)}</p>}
      {meditating && session.stage?.meditationPolicy === 'silent' ? <p className="muted">Silent environment</p> : meditating && onPreferencesChange ? <MeditationAudio preferences={preferences} onChange={onPreferencesChange} runtime={runtime} running/> : <BackgroundControls controller={runtime.background}/>}
      {session.snapshot!.config.kind === 'patterned' && runtime.background?.getMode() === 'retention' && <p className="muted">Retention-only background is unavailable for this practice. Choose Entire practice in Settings to hear background audio.</p>}
      {state.audio.failures.length > 0 && <p className="muted">Some audio is unavailable. Practice timing continues normally.</p>}
    </section>
  </>;
    if (session.result)
        return <>
    <p className="eyebrow">YOUR PRACTICE</p><h1>{session.status === 'completed' ? 'Completed' : session.result.endReason === 'ended-early' ? 'Ended early' : 'Cancelled'}</h1>
    <section className="panel">
      <h2>{session.snapshot!.name}</h2><p>Duration {formatDuration(session.result.actualDurationSeconds)}</p>
      {session.result.meditation && <p>Meditation time {formatDuration(session.result.meditation.actualDurationSeconds)} of {formatDuration(session.result.meditation.plannedDurationSeconds)} planned</p>}
      {session.result.blocks && <><p>{session.result.blocksCompleted} of {session.result.totalBlocks} blocks completed</p><ul>{session.result.blocks.map(block => <li key={block.id}>{block.name} · {block.outcome === 'not-started' ? 'not started' : block.outcome}</li>)}</ul></>}
      {session.snapshot!.config.kind === 'hormesis' && <p>Rounds completed: {session.result.roundsCompleted} of {session.snapshot!.config.retentions.length}</p>}
      {!!session.result.retentions?.length && <ul className="retention-results">{session.result.retentions.map(r => <li key={r.stageId}>Round {r.round}: {r.durationSeconds.toFixed(1)} seconds{r.outcome === 'released' ? ' · released early' : r.outcome === 'cancelled' ? ' · cancelled' : ''}</li>)}</ul>}
      <p className="muted">{state.saving ? 'Saving on this device…' : state.saveError ? 'Not yet saved. Retry using the message above.' : 'Saved on this device.'}</p>
      {session.status === 'completed' && <BackgroundControls controller={runtime.background}/>}
      <div className="practice-actions"><button className="primary" onClick={() => start(session.snapshot!.config)}>Start again</button><button onClick={() => { runtime.engine.reset(); onDone(); }}>Done / Home</button></div>
    </section>
  </>;
    return <>
    <p className="eyebrow">MAKE A LITTLE SPACE</p><h1>Practice</h1>
    <p className="intro">Choose a rhythm. Follow the guidance at a pace that feels comfortable.</p>
    {onMeditation && <p><button onClick={onMeditation}>Explore meditation</button></p>}
    {onRoutines && <p><button onClick={onRoutines}>My Routines</button></p>}
    {error && <p role="alert" className="notice">{error}</p>}
    <section className="panel practice-config">
      <label htmlFor="preset">Practice</label>
      <select id="preset" value={preset} onChange={e => setPreset(e.target.value as typeof preset)}>
        {Object.entries(patterns).map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}
        <option value="hormesis-60">Hormesis 60 / 60 / 60</option><option value="hormesis-progressive">Hormesis 60 / 90 / 90</option>
      </select>
      {!hormesis ? <><label htmlFor="duration">Duration</label><select id="duration" value={duration} onChange={e => setDuration(Number(e.target.value))}>{[180, 300, 600].map(n => <option key={n} value={n}>{n / 60} minutes</option>)}</select></> : <>
        <label htmlFor="interval">Inhale / exhale interval</label><select id="interval" value={interval} onChange={e => setInterval(Number(e.target.value) as 2 | 3)}><option value="2">2 seconds each</option><option value="3">3 seconds each</option></select>
        <label htmlFor="cycles">Breaths per round</label><select id="cycles" value={cycles} onChange={e => setCycles(Number(e.target.value) as 20 | 30 | 40)}>{[20, 30, 40].map(n => <option key={n} value={n}>{n}</option>)}</select>
        <p className="muted">Recovery: inhale 4 seconds, hold 15, exhale 6, then settle for 3.</p>
        <p className="muted">The final exhale before each retention lasts 4 seconds: exhale fully.</p>
        <p className="muted">Practice seated or lying down somewhere safe. Never while driving or in or near water. Release or stop whenever uncomfortable.</p>
      </>}
      <button className="primary" onClick={() => start()}>Start practice</button>
      <p className="muted">Start with a 4-second inhale, 6-second exhale, and 3 seconds to settle.{!hormesis && ' Your selected practice time begins after preparation.'}</p>
      <p className="muted">Voice and breath levels can be adjusted in Settings.</p>
    </section>
  </>;
}
