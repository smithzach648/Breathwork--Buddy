import { useState } from 'react';
import type { PracticeRuntime, RuntimeState } from '../../session/runtime';
import { patterns, type PatternId, type PracticeConfig } from '../../session/config';
import { formatDuration } from '../../shared/format';
export function Practice({ runtime, state, onDone }: {
    runtime: PracticeRuntime;
    state: RuntimeState;
    onDone: () => void;
}) {
    const [preset, setPreset] = useState<PatternId | 'hormesis-60' | 'hormesis-progressive'>('box');
    const [duration, setDuration] = useState(300);
    const [interval, setInterval] = useState<2 | 3>(2);
    const [cycles, setCycles] = useState<20 | 30 | 40>(30);
    const [error, setError] = useState('');
    const session = state.session;
    const hormesis = preset.startsWith('hormesis');
    function start(config?: PracticeConfig) {
        try {
            runtime.start(config || (hormesis ? { kind: 'hormesis', presetId: preset as 'hormesis-60' | 'hormesis-progressive', intervalSeconds: interval, cycles, retentions: preset === 'hormesis-60' ? [60, 60, 60] : [60, 90, 90], recoveryHoldSeconds: 15 } : { kind: 'patterned', presetId: preset as PatternId, durationSeconds: duration }));
            setError('');
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Practice could not start.');
        }
    }
    if (session.status === 'running')
        return <>
    <p className="eyebrow">YOUR PRACTICE</p><h1>Practice</h1>
    <section className="panel active-practice">
      <p>{session.snapshot!.name}</p>
      <p className="stage-title">{session.stage!.label}</p>
      <p className="stage-time" role="timer" aria-live="off" aria-label="Stage time remaining">{formatDuration(session.remainingMs / 1000)}</p>
      <p role="status" aria-live="polite" aria-atomic="true">{session.stage!.label}{session.snapshot!.config.kind === 'hormesis' && session.stage!.round > 0 && session.stage!.phase !== 'round-announcement' ? ` · Round ${session.stage!.round} of ${session.stage!.totalRounds}` : ''}</p>
      {(session.stage!.phase === 'inhale' || session.stage!.phase === 'exhale') && <p className="muted">{session.snapshot!.config.kind === 'hormesis' ? 'Breath' : 'Cycle'} {session.stage!.cycle} of {session.stage!.totalCycles}</p>}
      <div className="practice-actions">
        {session.releaseAvailable && <button className="primary" onClick={() => runtime.engine.releaseRetention()}>Release retention</button>}
        <button onClick={() => runtime.engine.stop()}>Stop practice</button>
      </div>
      <p className="muted">Elapsed {formatDuration(session.elapsedMs / 1000)}</p>
      {state.audio.failures.length > 0 && <p className="muted">Some audio is unavailable. Practice timing continues normally.</p>}
    </section>
  </>;
    if (session.result)
        return <>
    <p className="eyebrow">YOUR PRACTICE</p><h1>{session.status === 'completed' ? 'Completed' : 'Cancelled'}</h1>
    <section className="panel">
      <h2>{session.snapshot!.name}</h2><p>Duration {formatDuration(session.result.actualDurationSeconds)}</p>
      {session.snapshot!.config.kind === 'hormesis' && <p>Rounds completed: {session.result.roundsCompleted} of {session.snapshot!.config.retentions.length}</p>}
      {!!session.result.retentions?.length && <ul className="retention-results">{session.result.retentions.map(r => <li key={r.stageId}>Round {r.round}: {r.durationSeconds.toFixed(1)} seconds{r.outcome === 'released' ? ' · released early' : r.outcome === 'cancelled' ? ' · cancelled' : ''}</li>)}</ul>}
      <p className="muted">{state.saving ? 'Saving on this device…' : state.saveError ? 'Not yet saved. Retry using the message above.' : 'Saved on this device.'}</p>
      <div className="practice-actions"><button className="primary" onClick={() => start(session.snapshot!.config)}>Start again</button><button onClick={() => { runtime.engine.reset(); onDone(); }}>Done / Home</button></div>
    </section>
  </>;
    return <>
    <p className="eyebrow">MAKE A LITTLE SPACE</p><h1>Practice</h1>
    <p className="intro">Choose a rhythm. Follow the guidance at a pace that feels comfortable.</p>
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
        <p className="muted">Practice seated or lying down somewhere safe. Never while driving or in or near water. Release or stop whenever uncomfortable.</p>
      </>}
      <button className="primary" onClick={() => start()}>Start practice</button>
      <p className="muted">Start with a 4-second inhale, 6-second exhale, and 3 seconds to settle.{!hormesis && ' Your selected practice time begins after preparation.'}</p>
      <p className="muted">Voice and breath levels can be adjusted in Settings.</p>
    </section>
  </>;
}
