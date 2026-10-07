import { useEffect, useState, useSyncExternalStore, useRef } from 'react';
import type { Preferences } from '../settings/preferences';
import { builtins, mediaLibrary, mediaError, storageInfo, type LocalMediaRecord } from './library';
import type { BackgroundController } from './background';
import { formatDuration } from '../shared/format';
const empty = { source: 'none', name: '', playing: false, position: 0, duration: 0, error: '', preview: false };
const subscribeEmpty = () => () => {};
const getEmpty = () => empty;
export function BackgroundControls({ controller }: { controller?: BackgroundController }) {
    const state = useSyncExternalStore(controller?.subscribe || subscribeEmpty, controller?.getState || getEmpty);
    if (!controller || state.source === 'none') return null;
    return <div className="background-controls">
        <p>Background: {state.name || 'Selected audio'}{state.preview ? ' · Preview' : ''}</p>
        <p className="muted">{formatDuration(state.position)}{state.duration > 0 ? ` / ${formatDuration(state.duration)}` : ''}</p>
        <div className="practice-actions"><button disabled={!state.playing && !controller.canPlay()} onClick={() => state.playing ? controller.pause() : controller.play()}>{state.playing ? 'Pause background' : 'Play background'}</button><button onClick={() => controller.stop()}>Stop background</button></div>
        {state.error && <p role="status" className="notice">{state.error}</p>}
    </div>;
}
const size = (bytes?: number) => bytes === undefined ? 'Unavailable' : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
export function MediaSettings({ preferences, onChange, controller, running }: { preferences: Preferences; onChange: (p: Preferences) => void; controller?: BackgroundController; running: boolean }) {
    const latest = useRef(preferences); latest.current = preferences;
    const [records, setRecords] = useState<LocalMediaRecord[]>([]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState('');
    const [storage, setStorage] = useState<Awaited<ReturnType<typeof storageInfo>>>({ usage: undefined, quota: undefined, persistent: undefined });
    useEffect(() => { let live = true; Promise.all([mediaLibrary.list(), storageInfo()]).then(([items, info]) => { if (live) { setRecords(items); setStorage(info); } }).catch(() => { if (live) setError('Media storage is unavailable on this device. Practice still works.'); }); return () => { live = false; }; }, []);
    async function action(id: string, task: () => Promise<unknown>) {
        setBusy(id); setError('');
        try { await task(); setRecords(await mediaLibrary.list()); setStorage(await storageInfo()); }
        catch (e) { setError(mediaError(e)); }
        finally { setBusy(''); }
    }
    const update = (change: Partial<Preferences['background']>) => onChange({ ...latest.current, background: { ...latest.current.background, ...change } });
    const imported = records.filter(record => record.id.startsWith('local:'));
    return <>
        <section className="panel"><h2>Background audio</h2>
            <label htmlFor="background-source">Background source</label>
            <select id="background-source" value={preferences.background.source} onChange={e => update({ source: e.target.value })}>
                <option value="none">None</option>{builtins.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}{imported.map(item => <option value={item.id} key={item.id}>{item.displayName}</option>)}
                {preferences.background.source !== 'none' && !builtins.some(item => item.id === preferences.background.source) && !imported.some(item => item.id === preferences.background.source) && <option value={preferences.background.source}>Unavailable local audio — choose another source</option>}
            </select>
            <label htmlFor="background-mode">Background mode</label>
            <select id="background-mode" value={preferences.background.mode} onChange={e => update({ mode: e.target.value as Preferences['background']['mode'] })}>
                <option value="off">Off</option><option value="entire">Entire practice</option><option value="retention">Hormesis retention only</option><option value="after">After practice</option>
            </select>
            <p className="muted">Retention-only playback is available for Hormesis practices. It pauses during recovery and resumes its position in the next retention.</p>
            <label className="theme"><input type="checkbox" checked={preferences.background.loop} onChange={e => update({ loop: e.target.checked })}/>Loop background audio</label>
            <BackgroundControls controller={controller}/>
            <p className="muted">Choose a source and playback mode before Start. Preview is available when no practice is running. Background playback on a locked screen depends on your device.</p>
        </section>
        <section className="panel media-library"><h2>Media Library</h2>
            {error && <p role="alert" className="notice">{error}</p>}
            <h3>Built-in</h3>
            {builtins.map(item => {
                const offline = records.some(record => record.id === `offline:${item.id}`);
                return <div className="media-item" key={item.id}><h4>{item.name}</h4><p className="muted">{offline ? 'Available offline' : 'Available online · not saved offline'}</p>
                    <div className="practice-actions"><button disabled={running} aria-label={`Preview ${item.name}`} onClick={() => controller?.preview(item.id)}>Preview</button><button onClick={() => update({ source: item.id })} aria-label={`Select ${item.name}`}>{preferences.background.source === item.id ? 'Selected' : 'Select'}</button>
                        <button disabled={!!busy} onClick={() => void action(item.id, async () => {
                            if (offline) { controller?.removeSource(item.id); await mediaLibrary.remove(`offline:${item.id}`); }
                            else await mediaLibrary.download(item.id);
                            if (latest.current.background.source === item.id && !controller?.getState().preview) await controller?.select(item.id);
                        })}>{busy === item.id ? 'Please wait…' : offline ? `Remove offline copy of ${item.name}` : `Make ${item.name} available offline`}</button>
                    </div></div>;
            })}
            <h3>My Audio</h3>
            <label className="import-label">Import audio from device<input type="file" accept="audio/*" disabled={!!busy} onChange={e => {
                const file = e.target.files?.[0]; e.target.value = '';
                if (file) void action('import', () => mediaLibrary.import(file));
            }}/></label>
            {busy === 'import' && <p role="status">Checking and saving audio…</p>}
            {!imported.length && <p className="muted">Your local audio will appear here.</p>}
            {imported.map(item => <div className="media-item" key={item.id}><h4>{item.displayName}</h4><p className="muted">{size(item.byteSize)}{item.durationSeconds ? ` · ${formatDuration(item.durationSeconds)}` : ''} · On this device</p>
                <div className="practice-actions"><button disabled={running} aria-label={`Preview ${item.displayName}`} onClick={() => controller?.preview(item.id)}>Preview</button><button aria-label={`Select ${item.displayName}`} onClick={() => update({ source: item.id })}>{preferences.background.source === item.id ? 'Selected' : 'Select'}</button><button disabled={!!busy} aria-label={`Delete ${item.displayName}`} onClick={() => void action(item.id, async () => {
                    controller?.removeSource(item.id); await mediaLibrary.remove(item.id);
                    if (latest.current.background.source === item.id) update({ source: 'none' });
                })}>Delete</button></div>
            </div>)}
            <p>Imported audio stays on this device and is never uploaded.</p>
            <p className="muted">Storage used: {size(storage.usage)} · Approximate quota: {size(storage.quota)}. {storage.persistent === undefined ? 'Persistent-storage status is unavailable.' : storage.persistent ? 'Persistent storage is granted.' : 'Persistent storage is not granted.'}</p>
            <p className="muted">Clearing site data, browser eviction, or device storage pressure may remove local audio and offline copies. Keep your original files.</p>
        </section>
    </>;
}
