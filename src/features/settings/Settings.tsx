import type { Theme } from '../../settings/preferences';
import type { LegacyStatus } from '../../storage/legacy';
interface Props { theme:Theme; ready:boolean; saving:boolean; storageFailed:boolean; legacy:LegacyStatus; onThemeChange:(theme:Theme)=>void; }
export function Settings({theme,ready,saving,storageFailed,legacy,onThemeChange}:Props) {
  return <>
    <p className="eyebrow">MAKE YOURSELF AT HOME</p><h1>Settings</h1>
    <section className="panel"><h2>Appearance</h2><p>Choose what feels comfortable.</p>
      <fieldset disabled={!ready||saving}><legend className="sr-only">Theme</legend>
        {(['system','light','dark'] as const).map(value=><label className="theme" key={value}>
          <input type="radio" name="theme" checked={theme===value} onChange={()=>onThemeChange(value)}/>
          {value==='system'?'Follow device':value==='light'?'Light':'Dark'}
        </label>)}
      </fieldset>
    </section>
    <section className="panel"><h2>On this device</h2>
      <p>{ready?'Preferences are saved locally.':storageFailed?'Local storage is unavailable.':'Connecting to local storage…'}</p>
      <p>{legacy==='present'?'Your legacy Breathwork Buddy data was found and remains untouched. Migration will be offered in a later phase.':legacy==='unavailable'?'Legacy data could not be checked in this browser.':'No legacy Breathwork Buddy data was detected on this origin.'}</p>
    </section>
  </>;
}
