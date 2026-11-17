import { useEffect, useState, useRef, useSyncExternalStore } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { defaultPreferences, type Theme } from '../settings/preferences';
import { loadPreferences, savePreferences } from '../storage/repositories';
import { detectLegacyData } from '../storage/legacy';
import { Navigation, pages, type Page } from '../components/Navigation';
import { Home } from '../features/home/Home';
import { Practice } from '../features/practice/Practice';
import { Journal, type ReflectionRequest } from '../features/journal/Journal';
import { History } from '../features/history/History';
import { Settings } from '../features/settings/Settings';
import { createBrowserRuntime, canActivateUpdate, type PracticeRuntime } from '../session/runtime';
import type { Preferences } from '../settings/preferences';
import { Routines } from '../features/routines/Routines';
import { routineRepository } from '../routines/repository';
import { Meditation } from '../features/meditation/Meditation';
import type { PracticeConfig } from '../session/config';
import { Meditate } from '../features/meditation-suite/Meditate';
import {Icon} from '../components/Icon';
import {PracticeLibrary} from '../features/library/PracticeLibrary';
import {readLibrary,saveLibrary,type PracticeCard,type Category,type LibraryState} from '../features/library/catalog';
import {QuickRoutines} from '../features/routines/QuickRoutines';
import {SimpleRoutineBuilder} from '../features/routines/SimpleRoutineBuilder';
import type {PatternId} from '../session/config';
import type {JourneyId} from '../meditation-suite/model';
import {formatDuration} from '../shared/format';
export function App({ runtime: providedRuntime }: {
    runtime?: PracticeRuntime;
} = {}) {
    const [runtime] = useState(() => providedRuntime || createBrowserRuntime());
    const practiceState = useSyncExternalStore(runtime.subscribe, runtime.getState);
    const [page, setPage] = useState<Page>(()=>pages.find(name=>`#${name.toLowerCase()}`===location.hash)||'Home');
    const [routinesOpen, setRoutinesOpen] = useState(false);
    const [builderOpen,setBuilderOpen]=useState(false);
    const [library,setLibrary]=useState(readLibrary),[category,setCategory]=useState<Category>('all');
    const [selectedPreset,setSelectedPreset]=useState<PatternId|'hormesis-foundation'|'hormesis-advanced'>('box');
    const [selectedJourney,setSelectedJourney]=useState<JourneyId>();
    const [reflectTab,setReflectTab]=useState<'journal'|'history'>(()=>location.hash==='#history'?'history':'journal');
    const [reflection,setReflection]=useState<ReflectionRequest>();
    const settingsReturn=useRef<Page>('Home');
    const reflectionToken=useRef(0);
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
            if (live) {
                runtime.preferencesChanged(defaultPreferences());
                setReady(true);
                setError('Local storage is unavailable. Your preferences cannot be saved.');
            }
        });
        return () => { live = false; };
    }, [runtime]);
    useEffect(() => {
        const visible = () => runtime.visibilityChanged(document.visibilityState === 'visible');
        document.addEventListener('visibilitychange', visible);
        visible();
        return () => { document.removeEventListener('visibilitychange', visible); runtime.cancelStart(); runtime.engine.stop(); runtime.background?.dispose(); runtime.noise?.dispose(); runtime.binaural?.dispose(); };
    }, [runtime]);
    useEffect(()=>{const change=()=>{runtime.stopNoisePreview();setRoutinesOpen(false);setBuilderOpen(false);setReflection(undefined);if(location.hash==='#history')setReflectTab('history');if(location.hash==='#journal')setReflectTab('journal');setPage(pages.find(name=>`#${name.toLowerCase()}`===location.hash)||'Home');};window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[runtime]);
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
        runtime.stopNoisePreview();
        setRoutinesOpen(false);setBuilderOpen(false);
        setReflection(undefined);
        if(destination==='History')setReflectTab('history');
        if(destination==='Journal')setReflectTab('journal');
        setPage(destination);
        history.replaceState(null,'',`#${destination.toLowerCase()}`);
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
        void runtime.audio.unlock(false);
        const routine = await routineRepository.read(id);
        navigate('Practice');
        try { await runtime.start({ kind: 'routine', routine,guidanceProfile:'soft-felt-marshall.1' }); }
        catch (error) { setError(error instanceof Error ? error.message : 'Routine could not start.'); throw error; }
    }
    function openMeditation() { navigate('Meditation'); }
    function startMeditation(config:PracticeConfig) { navigate('Meditation'); try { const starting=runtime.start(config); void starting?.catch(error=>setError(error instanceof Error?error.message:'Meditation could not start.')); } catch(error) {setError(error instanceof Error?error.message:'Meditation could not start.');} }
    function updateLibrary(next:LibraryState){try{saveLibrary(next);setLibrary(next);}catch{setError('Your saved practices could not be updated on this device. Please try again.');}}
    function favorite(id:string){updateLibrary({...library,favorites:library.favorites.includes(id)?library.favorites.filter(v=>v!==id):[...library.favorites,id]});}
    function chooseCategory(next:Category){setCategory(next);navigate('Practices');}
    function openCard(card:PracticeCard){
        if(runtime.getState().starting||runtime.getState().session.status==='running'){navigate(activePage);return;}
        runtime.engine.reset();updateLibrary({...library,last:card.id});
        if(card.preset){setSelectedPreset(card.preset);navigate('Practice');}
        else if(card.journey){setSelectedJourney(card.journey);navigate('Meditate');}
        else if(card.scene){saveSettings({...latestPrefs.current,meditation:{...latestPrefs.current.meditation,acousticScene:card.scene}});navigate('Meditation');}
    }
    function writeReflection(sessionId?:string,sessionName?:string){navigate('Reflect');setReflectTab('journal');setReflection({token:++reflectionToken.current,sessionId,sessionName});}
    const activePage:Page=practiceState.session.snapshot?.config.kind==='meditation-journey'?'Meditate':practiceState.session.snapshot?.config.kind==='meditation'?'Meditation':'Practice';
    const active=practiceState.starting||practiceState.session.status==='running';
    const showMini=active&&page!==activePage&&!(page==='Practice'&&activePage==='Meditate');
    const reflectPage=['Reflect','Journal','History'].includes(page);
    return <div className="shell app-shell">
    <a className="skip" href="#content">Skip to content</a>
    <header className="topbar"><button className="brand wordmark" onClick={() => navigate('Home')} aria-label="Breathward home"><Icon name="leaf" size={25}/>breathward</button><button className="icon-button" aria-label="Settings" onClick={()=>{settingsReturn.current=page==='Settings'?'Home':page;navigate('Settings');}}><Icon name="settings" size={19}/></button></header>
    <main id="content" tabIndex={-1} className={showMini?'with-mini':undefined}>
      {error && <p role="alert" className="notice">{error}</p>}
      {practiceState.saveError && <div role="alert" className="notice">{practiceState.saveError} <button onClick={() => runtime.retrySaving()}>Retry saving</button></div>}
      {needRefresh && <div className="notice" role="status">{practiceState.starting || practiceState.session.status === 'running' ? 'An update is ready. Finish or stop your practice to update.' : <>A new version is ready. <button onClick={() => void update()}>Update app</button></>}</div>}
      {builderOpen?<SimpleRoutineBuilder preferences={prefs} onSaved={()=>navigate('Saved')} onBack={()=>navigate('Saved')}/>:routinesOpen ? <Routines preferences={prefs} runtime={runtime} onStart={startRoutine} onBack={() => navigate('Saved')} /> : <>
      {page === 'Home' && <Home last={library.last} onOpen={openCard} onCategory={chooseCategory} onWrite={()=>writeReflection()}/>}
      {page==='Practices'&&<PracticeLibrary category={category} onCategory={setCategory} favorites={library.favorites} onFavorite={favorite} onOpen={openCard}/>}
      {page==='Saved'&&<><PracticeLibrary saved category="all" onCategory={setCategory} favorites={library.favorites} onFavorite={favorite} onOpen={openCard} onBuild={()=>setBuilderOpen(true)}/><QuickRoutines onOpen={()=>setRoutinesOpen(true)} onStart={startRoutine}/></>}
      {['Practice','Meditate','Meditation'].includes(page)&&!active&&!practiceState.session.result&&<button className="back" onClick={()=>navigate('Practices')}><Icon name="back" size={16}/>All practices</button>}
      {(page==='Meditate'||page==='Practice'&&practiceState.session.snapshot?.config.kind==='meditation-journey')&&(ready?<Meditate key={selectedJourney??'journeys'} initialJourney={selectedJourney} runtime={runtime} state={practiceState} onTimer={openMeditation} preferences={prefs} onPreferencesChange={saveSettings} onReflect={writeReflection}/>:<p role="status">Loading your saved settings…</p>)}
      {page === 'Practice' && practiceState.session.snapshot?.config.kind!=='meditation-journey' && (ready?<Practice key={selectedPreset} initialPreset={selectedPreset} runtime={runtime} state={practiceState} onDone={() => navigate('Home')} onRoutines={() => {navigate('Saved');setRoutinesOpen(true);}} onMeditation={openMeditation} preferences={prefs} onPreferencesChange={saveSettings} onReflect={writeReflection}/>:<p role="status">Loading your saved settings…</p>)}
      {page === 'Meditation' && !ready && <p role="status">Loading your saved settings…</p>}
      {page === 'Meditation' && ready && (practiceState.starting || practiceState.session.snapshot?.config.kind==='meditation' && (practiceState.session.status==='running' || practiceState.session.result) ? <Practice runtime={runtime} state={practiceState} onDone={()=>{runtime.engine.reset();navigate('Meditation');}} preferences={prefs} onPreferencesChange={saveSettings} onReflect={writeReflection}/> : <Meditation preferences={prefs} onChange={saveSettings} runtime={runtime} onStart={startMeditation} onChooseTrack={()=>navigate('Settings')}/>)}
      {reflectPage&&<><p className="eyebrow">SPACE FOR REFLECTION</p><h1>Your words.<br/>Your own meaning.</h1><p className="intro">Write after a practice, or whenever something asks for your attention.</p><div className="tabs" role="tablist" aria-label="Reflection view"><button className="tab" role="tab" aria-selected={reflectTab==='journal'} onClick={()=>setReflectTab('journal')}>Journal</button><button className="tab" role="tab" aria-selected={reflectTab==='history'} onClick={()=>setReflectTab('history')}>Practice history</button></div>{reflectTab==='journal'?<Journal request={reflection}/>:<History embedded version={practiceState.historyVersion} onReflect={writeReflection}/>}</>}
      {page === 'Settings' && <><button className="back" onClick={()=>navigate(active?activePage:settingsReturn.current)}><Icon name="back" size={16}/>{active?(activePage==='Meditate'?'Return to journey':'Return to practice'):'Back'}</button><Settings theme={prefs.theme} volumes={prefs.volumes} ready={ready} saving={saving} storageFailed={!!error} legacy={legacy} onThemeChange={changeTheme} onVolumeChange={(bus, value) => saveSettings({ ...latestPrefs.current, volumes: { ...latestPrefs.current.volumes, [bus]: value } })} preferences={prefs} onPreferencesChange={saveSettings} background={runtime.background} running={practiceState.session.status === 'running'} onJourneyMixChange={mix=>runtime.setJourneyMix(mix)} liveJourneyMix={practiceState.audio.journey?.liveMix??practiceState.audio.acoustic?.liveMix}/></>}
      </>}
      {offlineReady&&<p className="offline-note">Ready offline</p>}
    </main>
    {showMini&&<button className="mini" aria-label="Return to active practice" onClick={()=>navigate(activePage)}><span className="mini-dot" aria-hidden="true"/><span><strong>{practiceState.session.snapshot?.name??'Getting ready'}</strong><small>{practiceState.starting?'Preparing sound…':formatDuration(practiceState.session.remainingMs/1000)+' in this stage'}</small></span><span className="arrow" aria-hidden="true">›</span></button>}
    <Navigation page={routinesOpen||builderOpen?'Saved':page} onNavigate={navigate}/>
  </div>;
}
