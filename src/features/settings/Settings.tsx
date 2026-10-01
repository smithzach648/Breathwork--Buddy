import type { Theme } from '../../settings/preferences';
import type { LegacyStatus } from '../../storage/legacy';
import type { Preferences } from '../../settings/preferences';
interface Props {
    theme: Theme;
    volumes: Preferences['volumes'];
    ready: boolean;
    saving: boolean;
    storageFailed: boolean;
    legacy: LegacyStatus;
    onThemeChange: (theme: Theme) => void;
    onVolumeChange: (bus: 'master' | 'voice' | 'breath', value: number) => void;
}
export function Settings({ theme, volumes, ready, saving, storageFailed, legacy, onThemeChange, onVolumeChange }: Props) {
    return <>
    <p className="eyebrow">MAKE YOURSELF AT HOME</p><h1>Settings</h1>
    <section className="panel"><h2>Appearance</h2><p>Choose what feels comfortable.</p>
      <fieldset disabled={!ready || saving}><legend className="sr-only">Theme</legend>
        {(['system', 'light', 'dark'] as const).map(value => <label className="theme" key={value}>
          <input type="radio" name="theme" checked={theme === value} onChange={() => onThemeChange(value)}/>
          {value === 'system' ? 'Follow device' : value === 'light' ? 'Light' : 'Dark'}
        </label>)}
      </fieldset>
    </section>
    <section className="panel"><h2>Audio levels</h2><p>Adjust these independently, including during practice.</p>
      <fieldset disabled={!ready}>{(['master', 'voice', 'breath'] as const).map(bus => <label className="volume-control" key={bus}>
        <span>{bus[0].toUpperCase() + bus.slice(1)} <output>{Math.round(volumes[bus] * 100)}%</output></span>
        <input type="range" min="0" max="1" step="0.01" aria-label={`${bus[0].toUpperCase() + bus.slice(1)} volume`} value={volumes[bus]} onChange={e => onVolumeChange(bus, Number(e.target.value))}/>
      </label>)}</fieldset>
    </section>
    <section className="panel"><h2>On this device</h2>
      <p>{ready ? 'Preferences are saved locally.' : storageFailed ? 'Local storage is unavailable.' : 'Connecting to local storage…'}</p>
      <p>{legacy === 'present' ? 'Your legacy Breathwork Buddy data was found and remains untouched. Migration will be offered in a later phase.' : legacy === 'unavailable' ? 'Legacy data could not be checked in this browser.' : 'No legacy Breathwork Buddy data was detected on this origin.'}</p>
    </section>
  </>;
}
