import { useEffect, useState } from 'react';
import { recentSessions } from '../../storage/repositories';
import type { SessionResult } from '../../types/domain';
import { formatDuration } from '../../shared/format';
export function History({ version = 0 }: {
    version?: number;
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
    return <><p className="eyebrow">YOUR PRACTICE, OVER TIME</p><h1>History</h1>
    {error && <p role="alert" className="notice">{error}</p>}
    {loading ? <p>Loading your sessions…</p> : sessions.length === 0 ? <section className="panel"><h2>A fresh start</h2><p>Your completed and cancelled practices will appear here.</p></section> : <ol className="history-list">{sessions.map(result => <li className="panel" key={result.id}>
      <h2>{result.practiceName || result.routineId}</h2><p><time dateTime={result.startedAt}>{new Date(result.startedAt).toLocaleString()}</time></p>
      <p>{result.outcome === 'completed' ? 'Completed' : 'Cancelled'} · {formatDuration(result.actualDurationSeconds)}</p>
      {!!result.retentions?.length && <p className="muted">Retentions: {result.retentions.map(r => `${r.durationSeconds.toFixed(1)}s${r.outcome === 'released' ? ' (released)' : ''}`).join(' · ')}</p>}
    </li>)}</ol>}
  </>;
}
