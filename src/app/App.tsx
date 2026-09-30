import { useEffect,useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { defaultPreferences,type Theme } from '../settings/preferences';
import { loadPreferences,savePreferences } from '../storage/repositories';
import { detectLegacyData } from '../storage/legacy';
import { Navigation,type Page } from '../components/Navigation';
import { Home } from '../features/home/Home';
import { Practice } from '../features/practice/Practice';
import { Journal } from '../features/journal/Journal';
import { History } from '../features/history/History';
import { Settings } from '../features/settings/Settings';

export function App() {
  const [page,setPage]=useState<Page>('Home');
  const [prefs,setPrefs]=useState(defaultPreferences);
  const [ready,setReady]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [legacy]=useState(detectLegacyData);
  const {needRefresh:[needRefresh],offlineReady:[offlineReady],updateServiceWorker}=useRegisterSW({
    onRegisterError:()=>setError('Offline setup could not finish. Please reload when connected.')
  });

  useEffect(()=>{
    let live=true;
    loadPreferences().then(preferences=>{
      if(live){setPrefs(preferences);setReady(true);}
    }).catch(()=>{
      if(live)setError('Local storage is unavailable. Your preferences cannot be saved.');
    });
    return ()=>{live=false;};
  },[]);

  useEffect(()=>{
    const media=matchMedia('(prefers-color-scheme: dark)');
    const apply=()=>{
      document.documentElement.dataset.theme=prefs.theme==='system'?(media.matches?'dark':'light'):prefs.theme;
    };
    apply();
    media.addEventListener('change',apply);
    return ()=>media.removeEventListener('change',apply);
  },[prefs.theme]);

  async function changeTheme(theme:Theme) {
    setSaving(true);
    const next={...prefs,theme};
    try {await savePreferences(next);setPrefs(next);setError('');}
    catch {setError('Theme could not be saved. Please try again.');}
    finally {setSaving(false);}
  }

  function navigate(destination:Page) {
    setPage(destination);
    document.getElementById('content')?.focus();
    window.scrollTo({top:0,behavior:'instant'});
  }

  async function update() {
    try {await updateServiceWorker(true);}
    catch {setError('The update could not finish. Please try again when connected.');}
  }

  return <div className="shell">
    <a className="skip" href="#content">Skip to content</a>
    <header><button className="brand" onClick={()=>navigate('Home')} aria-label="Breathwork Buddy home">
      <span className="brand-mark" aria-hidden="true">◡</span>breathwork buddy<span className="version">2.0</span>
    </button><span className="status">{offlineReady?'Ready offline':'Your daily space'}</span></header>
    <main id="content" tabIndex={-1}>
      {error&&<p role="alert" className="notice">{error}</p>}
      {needRefresh&&<div className="notice" role="status">A new version is ready. <button onClick={()=>void update()}>Update app</button></div>}
      {page==='Home'&&<Home onExplore={()=>navigate('Practice')}/>}
      {page==='Practice'&&<Practice/>}
      {page==='Journal'&&<Journal/>}
      {page==='History'&&<History/>}
      {page==='Settings'&&<Settings theme={prefs.theme} ready={ready} saving={saving} storageFailed={!!error} legacy={legacy} onThemeChange={theme=>void changeTheme(theme)}/>}
    </main>
    <Navigation page={page} onNavigate={navigate}/>
  </div>;
}
