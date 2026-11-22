import { BlockDetails } from './BlockDetails';
import { useEffect, useState } from 'react';
import { recentSessions } from '../../storage/repositories';
import type { SessionResult } from '../../types/domain';
import {recipeSummary} from '../../meditation/environment';
import { formatDuration } from '../../shared/format';
export function History({ version = 0, embedded=false,onReflect }: {
    version?: number;
    embedded?:boolean;
    onReflect?:(id:string,name:string)=>void;
}) {
    const [sessions, setSessions] = useState<SessionResult[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    useEffect(() => { let live = true; recentSessions().then(rows => { if (live) {
        setSessions(rows);
        setLoading(false);
    } }).catch(() => { if (live) {
        setError('History could not be read on this device.');
        setLoading(false);
    } }); return () => { live = false; }; }, [version]);
    return <>{!embedded&&<><p className="eyebrow">YOUR PRACTICE, OVER TIME</p><h1>History</h1></>}
    {error && <p role="alert" className="notice">{error}</p>}
    {loading ? <p>Loading your sessions…</p> : sessions.length === 0 ? <section className="panel"><h2>A fresh start</h2><p>Your completed and cancelled practices will appear here.</p></section> : <ol className="history-list">{sessions.map(result => <li className="panel" key={result.id}>
      <h2>{result.practiceName || result.routineId}</h2><p><time dateTime={result.startedAt}>{new Date(result.startedAt).toLocaleString()}</time></p>
      <p>{result.outcome === 'completed' ? 'Completed' : result.endReason === 'ended-early' ? 'Ended early' : 'Cancelled'} · {formatDuration(result.actualDurationSeconds)}</p>
      {result.journey&&<><p className="muted">Meditation journey · {result.journey.snapshot.guidance==='guided'?'Guided':'Familiar'} · preparation breathing {result.journey.snapshot.breathing} · {formatDuration(result.plannedDurationSeconds||0)} planned.</p><p className="muted">Your original journey settings and sound recipes are saved with this session. No private intention or emotional notes were recorded.{result.journey.naturalBreathingAtSeconds!==undefined?' Natural breathing was chosen during preparation.':''}</p></>}
      {result.soundProfile?.environment?.practice&&<p className="muted">Practice background: {{off:'Silence',floating:'Floating','home-again':'Home Again',warm:'Soft Warm masking'}[result.soundProfile.environment.practice.source]} · {result.soundProfile.environment.practice.timing==='retention'?'retentions only':'entire practice'}{result.soundProfile.environment.practice.holdGuidance?' · gentle hold guidance':''}.</p>}
      {result.recoveryHoldSound&&<p className="muted">Recovery hold sound: {{chords:'Warm chord pulses',quiet:'Quiet',single:'Single note'}[result.recoveryHoldSound]}.</p>}
      {result.guidanceProfile&&<p className="muted">{result.practiceNarration?`Practice narration: ${{full:'Full',brief:'Brief',off:'Off'}[result.practiceNarration.mode]} · Soft Felt breathing notes.`:'Marshall introductions · Soft Felt breathing notes.'}</p>}
      {!!result.soundMixChanges?.length&&<p className="muted">Live sound balance was adjusted during this session. Starting settings and {result.soundMixChanges.length} timed adjustment{result.soundMixChanges.length===1?'':'s'} are saved on this device.</p>}
      {result.hormesisPractice&&<p className='muted'>Hormesis · {result.hormesisPractice.retentionTargets.length} rounds of {result.hormesisPractice.breathsPerRound} breaths · {result.hormesisPractice.intervalSeconds}s in/out · optional targets {result.hormesisPractice.retentionTargets.join(' / ')}s.</p>}
      {result.patternedBreathing&&<p className="muted">{result.patternedBreathing.completedCycles} of {result.patternedBreathing.requestedCycles} complete breathing cycles</p>}
      {result.meditation && <p className="muted">Meditation: {formatDuration(result.meditation.actualDurationSeconds)} of {formatDuration(result.meditation.plannedDurationSeconds)} planned</p>}
      {result.soundProfile?.environment?.blocks.standalone&&!result.blocks&&<p className="muted">Sound: {recipeSummary(result.soundProfile.environment.blocks.standalone)}</p>}
      {result.soundProfile&&!result.soundProfile.environment&&<p className="muted">Sound: {{off:'Off',baseline:'Baseline',layered:'Layered',modulated:'Experimental Modulated'}[result.soundProfile.mode]} · {{off:'masking Off',brown:'Warm',pink:'Balanced',white:'Broad Masking'}[result.soundProfile.texture]}{result.soundProfile.music?' · selected audio':''}. {result.soundProfile.mode!=='off'&&result.blocks?.some(block=>block.kind==='meditation'&&block.plannedDurationSeconds<600)&&'Short blocks use masking and selected audio only.'}</p>}
      {result.blocks && <><p className="muted">{result.blocksCompleted} of {result.totalBlocks} blocks completed</p><ul>{result.blocks.map(block => <li key={block.id}>{block.name} · {block.outcome === 'not-started' ? 'not started' : block.outcome}<BlockDetails block={block}/></li>)}</ul></>}
      {!!result.retentions?.length && <p className="muted">Retentions: {result.retentions.map(r => `${r.durationSeconds.toFixed(1)}s${r.outcome === 'released' ? ' (released)' : ''}`).join(' · ')}</p>}
      {onReflect&&<button className="card-link" onClick={()=>onReflect(result.id,result.practiceName||result.routineId)}>Open reflection →</button>}
    </li>)}</ol>}
  </>;
}
