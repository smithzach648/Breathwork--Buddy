import { useEffect, useState, useRef, useSyncExternalStore } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { defaultPreferences, type Theme } from '../settings/preferences';
import { loadPreferences, savePreferences } from '../storage/repositories';
import { detectLegacyData } from '../storage/legacy';
import { Navigation, type Page } from '../components/Navigation';
import { Home } from '../features/home/Home';
import { Practice } from '../features/practice/Practice';
import { Journal } from '../features/journal/Journal';
import { History } from '../features/history/History';
import { Settings } from '../features/settings/Settings';
import { createBrowserRuntime, canActivateUpdate, type PracticeRuntime } from '../session/runtime';
import type { Preferences } from '../settings/preferences';
import { Routines } from '../features/routines/Routines';
import { routineRepository } from '../routines/repository';
export function App({ runtime: providedRuntime }: {
    runtime?: PracticeRuntime;
} = {}) {
    const [runtime] = useState(() => providedRuntime || createBrowserRuntime());
    const practiceState = useSyncExternalStore(runtime.subscribe, runtime.getState);
    const [page, setPage] = useState<Page>('Home');
    const [routinesOpen, setRoutinesOpen] = useState(false);
    const [prefs, setPrefs] = useState(defaultPreferences);
    const latestPrefs = useRef(prefs);
    const saves = useRef(Promise.resolve());
    const [ready, setReady] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [legacy] = useState(detectLegacyData);
    const { needRefresh: [needRefresh], offlineReady: [offlineReady], updateServiceWorker } = useRegisterSW({
        onRegisterError: () => setError('Offline setup could not finish. Please reload when connected.')
    });
    useEffect(() => {
        let live = true;
        loadPreferences().then(preferences => {
            if (live) {
                latestPrefs.current = preferences;
                setPrefs(preferences);
                runtime.preferencesChanged(preferences);
                setReady(true);
            }
        }).catch(() => {
            if (live)
                setError('Local storage is unavailable. Your preferences cannot be saved.');
        });
        return () => { live = false; };
    }, [runtime]);
    useEffect(() => {
        const visible = () => runtime.visibilityChanged(document.visibilityState === 'visible');
        document.addEventListener('visibilitychange', visible);
        visible();
        return () => { document.removeEventListener('visibilitychange', visible); runtime.cancelStart(); runtime.engine.stop(); runtime.background?.dispose(); };
    }, [runtime]);
    useEffect(() => {
        const media = matchMedia('(prefers-color-scheme: dark)');
        const apply = () => {
            document.documentElement.dataset.theme = prefs.theme === 'system' ? (media.matches ? 'dark' : 'light') : prefs.theme;
        };
        apply();
        media.addEventListener('change', apply);
        return () => media.removeEventListener('change', apply);
    }, [prefs.theme]);
    function saveSettings(next: Preferences) {
        latestPrefs.current = next;
        setPrefs(next);
        runtime.preferencesChanged(next);
        setSaving(true);
        saves.current = saves.current.then(() => savePreferences(next)).then(() => setError('')).catch(() => setError('Your preference could not be saved. Please try again.')).finally(() => setSaving(false));
    }
    function changeTheme(theme: Theme) { saveSettings({ ...latestPrefs.current, theme }); }
    function navigate(destination: Page) {
        setRoutinesOpen(false);
        setPage(destination);
        document.getElementById('content')?.focus();
        window.scrollTo({ top: 0, behavior: 'instant' });
    }
    async function update() {
        if (runtime.getState().starting || !canActivateUpdate(runtime.engine.getState().status))
            return;
        try {
            await updateServiceWorker(true);
        }
        catch {
            setError('The update could not finish. Please try again when connected.');
        }
    }
    async function startRoutine(id: string) {
        void runtime.audio.unlock();
        const routine = await routineRepository.read(id);
        navigate('Practice');
        try { await runtime.start({ kind: 'routine', routine }); }
        catch (error) { setError(error instanceof Error ? error.message : 'Routine could not start.'); throw error; }
    }
    return <div className="shell">
    <a className="skip" href="#content">Skip to content</a>
    <header><button className="brand" onClick={() => navigate('Home')} aria-label="Breathwork Buddy home">
      <span className="brand-mark" aria-hidden="true">◡</span>breathwork buddy<span className="version">2.0</span>
    </button><span className="status">{offlineReady ? 'Ready offline' : 'Your daily space'}</span></header>
    <main id="content" tabIndex={-1}>
      {error && <p role="alert" className="notice">{error}</p>}
      {practiceState.saveError && <div role="alert" className="notice">{practiceState.saveError} <button onClick={() => runtime.retrySaving()}>Retry saving</button></div>}
      {needRefresh && <div className="notice" role="status">{practiceState.starting || practiceState.session.status === 'running' ? 'An update is ready. Finish or stop your practice to update.' : <>A new version is ready. <button onClick={() => void update()}>Update app</button></>}</div>}
      {routinesOpen ? <Routines onStart={startRoutine} onBack={() => navigate('Home')}/> : <>
      {page === 'Home' && <Home onExplore={() => navigate('Practice')} onRoutines={() => setRoutinesOpen(true)} onStartRoutine={startRoutine}/>}
      {page === 'Practice' && <Practice runtime={runtime} state={practiceState} onDone={() => navigate('Home')} onRoutines={() => setRoutinesOpen(true)}/>}
      {page === 'Journal' && <Journal />}
      {page === 'History' && <History version={practiceState.historyVersion}/>}
      {page === 'Settings' && <Settings theme={prefs.theme} volumes={prefs.volumes} ready={ready} saving={saving} storageFailed={!!error} legacy={legacy} onThemeChange={changeTheme} onVolumeChange={(bus, value) => saveSettings({ ...latestPrefs.current, volumes: { ...latestPrefs.current.volumes, [bus]: value } })} preferences={prefs} onPreferencesChange={saveSettings} background={runtime.background} running={practiceState.session.status === 'running'}/>}
      </>}
    </main>
    <Navigation page={page} onNavigate={navigate}/>
  </div>;
}
