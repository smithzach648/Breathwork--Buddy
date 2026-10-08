import { useEffect, useState } from 'react';
import { routineRepository } from '../../routines/repository';
import { validateRoutine } from '../../routines/model';
import type { Routine } from '../../types/domain';
export function QuickRoutines({ onOpen, onStart }: { onOpen: () => void; onStart: (id: string) => Promise<void> }) {
    const [rows, setRows] = useState<Routine[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    useEffect(() => { let live = true; routineRepository.list().then(rows => { if (live) setRows(rows.filter(row => { try { validateRoutine(row); return true; } catch { return false; } }).slice(0, 2)); }).catch(() => { if (live) setError('Saved routines could not be read.'); }); return () => { live = false; }; }, []);
    return <section className="panel quick-routines"><h2>Saved routines</h2>{error && <p role="alert">{error}</p>}{rows.length ? <ul>{rows.map(row => <li key={row.id}><span>{row.name}</span><button disabled={busy} aria-label={`Start ${row.name}`} onClick={async () => { setBusy(true); try { await onStart(row.id); } catch { setError('Routine could not start. Please try again.'); } finally { setBusy(false); } }}>Start</button></li>)}</ul> : <p>Create a routine from your favorite breathing practices.</p>}<button onClick={onOpen}>My Routines</button></section>;
}
