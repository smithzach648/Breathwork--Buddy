import { useEffect, useState } from 'react';
import type { Routine, RoutineStage } from '../../types/domain';
import { patterns, type PatternId } from '../../session/config';
import { blockName, MAX_BLOCKS, MAX_NAME, newBlock, repairDraft, validateRoutine } from '../../routines/model';
import { routineRepository, type RoutineRepository } from '../../routines/repository';

export function Routines({ onStart, onBack, repository = routineRepository, binauralSelected=false }: { onStart: (id: string) => Promise<void>; onBack: () => void; repository?: RoutineRepository; binauralSelected?:boolean }) {
    const [rows, setRows] = useState<Routine[]>([]), [draft, setDraft] = useState<Routine>(), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [deleting, setDeleting] = useState<string>(), [repair, setRepair] = useState(false);
    async function reload() { setRows(await repository.list()); setLoading(false); }
    useEffect(() => { let live = true; repository.list().then(rows => { if (live) { setRows(rows); setLoading(false); } }).catch(() => { if (live) { setError('Routines could not be read. Please try again.'); setLoading(false); } }); return () => { live = false; }; }, [repository]);
    async function action(work: () => Promise<unknown>, message: string) { setBusy(true); setError(''); try { await work(); } catch (error) { setError(`${message} ${error instanceof Error ? error.message : 'Please try again.'}`); } finally { setBusy(false); } }
    function edit(row?: Routine) { let valid = true; try { if (row) validateRoutine(row); } catch { valid = false; } setDraft(row ? valid ? structuredClone(row) : repairDraft(row) : { ...repairDraft({}), stages: [newBlock()] }); setRepair(!valid); setError(''); }
    function replace(index: number, block: RoutineStage) { if (draft) setDraft({ ...draft, stages: draft.stages.map((existing, i) => i === index ? block : existing) }); }
    function move(index: number, direction: number) { if (!draft) return; const blocks = [...draft.stages]; [blocks[index], blocks[index + direction]] = [blocks[index + direction], blocks[index]]; setDraft({ ...draft, stages: blocks }); }
    return <>
        <p className="eyebrow">YOUR PRACTICE, YOUR WAY</p><h1>{draft ? 'Build a routine' : 'My Routines'}</h1>
        {binauralSelected&&<p className="notice">Meditation blocks shorter than 10 minutes use masking and selected audio only. Longer blocks use your selected binaural layer. Silent blocks stay silent.</p>}
        {error && <p role="alert" className="notice">{error}</p>}
        {draft ? <form className="panel routine-editor" onSubmit={event => { event.preventDefault(); void action(async () => { await repository.save(draft); setDraft(undefined); await reload(); }, 'Your edits are still here. Saving failed.'); }}>
            {repair && <p className="notice" role="status">This record needs repair. Unsupported blocks have editable defaults. Review every block before saving.</p>}
            <label htmlFor="routine-name">Routine name</label><input id="routine-name" value={draft.name} maxLength={MAX_NAME} onChange={event => setDraft({ ...draft, name: event.target.value })} disabled={busy} />
            <h2>Blocks</h2><p className="muted">Prepare once at the beginning, with a quiet 3-second pause between blocks.</p>
            <ol className="routine-blocks">{draft.stages.map((block, index) => <li key={block.id}><fieldset disabled={busy}>
                <legend>Block {index + 1} · {blockName(block)}</legend>
                <label htmlFor={`type-${block.id}`}>Block {index + 1} practice</label>
                <select id={`type-${block.id}`} value={block.presetId} onChange={event => { const presetId = event.target.value; replace(index, presetId === 'meditation' ? { id: block.id, kind: 'meditation', presetId: 'meditation', durationSeconds: 600, audioPolicy: 'defaults' } : presetId.startsWith('hormesis') ? { id: block.id, kind: 'hormesis', presetId: presetId as 'hormesis-60' | 'hormesis-progressive', intervalSeconds: block.kind === 'hormesis' ? block.intervalSeconds : 2, cycles: block.kind === 'hormesis' ? block.cycles : 30, retentions: presetId === 'hormesis-60' ? [60, 60, 60] : [60, 90, 90], recoveryHoldSeconds: 15 } : { id: block.id, kind: 'patterned', presetId: presetId as PatternId, durationSeconds: block.kind === 'patterned' ? block.durationSeconds : 300 }); }}>
                    {Object.entries(patterns).map(([id, value]) => <option key={id} value={id}>{value.name}</option>)}<option value="meditation">Meditation</option><option value="hormesis-60">Hormesis 60 / 60 / 60</option><option value="hormesis-progressive">Hormesis 60 / 90 / 90</option>
                </select>
                {block.kind === 'patterned' ? <><label htmlFor={`duration-${block.id}`}>Block {index + 1} duration</label><select id={`duration-${block.id}`} value={block.durationSeconds} onChange={event => replace(index, { ...block, durationSeconds: Number(event.target.value) })}>{[180, 300, 600].map(seconds => <option key={seconds} value={seconds}>{seconds / 60} minutes</option>)}</select></> : block.kind === 'meditation' ? <>
                    <label htmlFor={`minutes-${block.id}`}>Block {index + 1} meditation minutes</label><input id={`minutes-${block.id}`} type="number" min="1" max="60" step="1" value={Number.isFinite(block.durationSeconds) ? block.durationSeconds / 60 : ''} onChange={event => replace(index, { ...block, durationSeconds: event.target.value === '' ? NaN : Number(event.target.value) * 60 })}/>
                    <label htmlFor={`policy-${block.id}`}>Block {index + 1} sound environment</label><select id={`policy-${block.id}`} value={block.audioPolicy} onChange={event => replace(index, { ...block, audioPolicy: event.target.value as 'defaults' | 'silent' })}><option value="defaults">Use Meditation sound defaults</option><option value="silent">Silent, including signals</option></select>
                </> : <>
                    <label htmlFor={`cadence-${block.id}`}>Block {index + 1} inhale / exhale interval</label><select id={`cadence-${block.id}`} value={block.intervalSeconds} onChange={event => replace(index, { ...block, intervalSeconds: Number(event.target.value) as 2 | 3 })}><option value="2">2 seconds each</option><option value="3">3 seconds each</option></select>
                    <label htmlFor={`cycles-${block.id}`}>Block {index + 1} breaths per round</label><select id={`cycles-${block.id}`} value={block.cycles} onChange={event => replace(index, { ...block, cycles: Number(event.target.value) as 20 | 30 | 40 })}>{[20, 30, 40].map(cycles => <option key={cycles}>{cycles}</option>)}</select>
                    <p className="muted">Recovery: inhale 4 seconds, hold 15, exhale 6, settle 3.</p>
                </>}
                <div className="practice-actions"><button type="button" aria-label={`Move block ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}>Move up</button><button type="button" aria-label={`Move block ${index + 1} down`} disabled={index === draft.stages.length - 1} onClick={() => move(index, 1)}>Move down</button><button type="button" aria-label={`Remove block ${index + 1}`} onClick={() => setDraft({ ...draft, stages: draft.stages.filter((_, i) => i !== index) })}>Remove</button></div>
            </fieldset></li>)}</ol>
            {draft.stages.some(block => block.kind === 'hormesis') && <p className="muted">Practice seated or lying down somewhere safe. Never while driving or in or near water. Release or stop whenever uncomfortable.</p>}
            <div className="practice-actions"><button type="button" disabled={busy || draft.stages.length >= MAX_BLOCKS} onClick={() => setDraft({ ...draft, stages: [...draft.stages, newBlock()] })}>Add block</button><button className="primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save routine'}</button><button type="button" disabled={busy} onClick={() => { setDraft(undefined); setError(''); }}>Cancel editing</button></div>
        </form> : <>
            <p className="intro">Combine familiar practices and save them on this device.</p>
            <button className="primary" disabled={busy} onClick={() => edit()}>Create routine</button>
            {loading ? <p>Loading routines…</p> : !rows.length ? <p>No saved routines yet.</p> : <ul className="routine-list">{rows.map((row, index) => {
                let issue = ''; try { validateRoutine(row); } catch (error) { issue = error instanceof Error ? error.message : 'Invalid routine.'; }
                const name = typeof row?.name === 'string' && row.name.trim() ? row.name : `Routine ${index + 1}`;
                return <li className="panel" key={row.id}><h2>{name}</h2>{issue ? <p className="notice" role="status">{issue}</p> : <p className="muted">{row.stages.length} {row.stages.length === 1 ? 'block' : 'blocks'}</p>}
                    <div className="practice-actions"><button className="primary" disabled={busy || !!issue} aria-label={`Start ${name}`} onClick={() => void action(() => onStart(row.id), 'Routine could not start.')}>Start</button><button disabled={busy} aria-label={`Edit ${name}`} onClick={() => edit(row)}>Edit</button><button disabled={busy || !!issue} aria-label={`Duplicate ${name}`} onClick={() => void action(async () => { await repository.duplicate(row.id); await reload(); }, 'Duplicate could not be saved.')}>Duplicate</button><button disabled={busy} aria-label={`Delete ${name}`} onClick={() => setDeleting(row.id)}>Delete</button></div>
                    {deleting === row.id && <section className="notice" role="alertdialog" aria-label={`Delete ${name}?`}><p>Delete “{name}” from this device? Your previous History stays saved.</p><button disabled={busy} onClick={() => void action(async () => { await repository.remove(row.id); setDeleting(undefined); await reload(); }, 'Delete failed. Your routine is still saved.')}>Confirm delete</button> <button disabled={busy} onClick={() => setDeleting(undefined)}>Keep routine</button></section>}
                </li>;
            })}</ul>}
            <button onClick={onBack}>Back to Home</button>
        </>}
    </>;
}
