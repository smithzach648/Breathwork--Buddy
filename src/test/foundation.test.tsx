import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../app/App';
import { BuddyDatabase, database } from '../storage/database';
import { defaultPreferences, validPreferences } from '../settings/preferences';
import { audioCatalog, availableAudio } from '../audio/catalog';
import { detectLegacyData } from '../storage/legacy';
import * as persistence from '../storage/repositories';
vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: () => ({ needRefresh: [false], offlineReady: [false], updateServiceWorker: vi.fn() }) }));
describe('foundation', () => {
    it('renders and navigates every destination', async () => {
        render(<App />);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Come back');
        for (const name of ['Practice', 'Journal', 'History', 'Settings']) {
            fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
            expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(name);
        }
        await waitFor(() => expect(screen.getByLabelText('Dark')).toBeEnabled());
    });
    it('persists theme and restores it on a fresh mount', async () => { await database.preferences.clear(); const view = render(<App />); fireEvent.click(screen.getByRole('button', { name: /Settings/ })); await waitFor(() => expect(screen.getByLabelText('Dark')).toBeEnabled()); fireEvent.click(screen.getByLabelText('Dark')); await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark')); view.unmount(); render(<App />); await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark')); expect((await database.preferences.get('preferences'))?.theme).toBe('dark'); });
    it('restores a Meditation deep link only after saved sound settings load',async()=>{const p=defaultPreferences();p.meditation.binaural.mode='layered';await database.preferences.put(p);history.replaceState(null,'','#meditation');const view=render(<App/>);expect(screen.queryByLabelText('Binaural layer')).toBeNull();expect(screen.getByText('Loading your saved settings…')).toBeInTheDocument();await waitFor(()=>expect(screen.getByLabelText('Binaural layer')).toHaveValue('layered'));view.unmount();history.replaceState(null,'','#home');});
    it('storage failure leaves Meditation available with an explicit saving error',async()=>{vi.spyOn(persistence,'loadPreferences').mockRejectedValueOnce(new Error('storage unavailable'));history.replaceState(null,'','#meditation');const view=render(<App/>);await waitFor(()=>expect(screen.getByRole('button',{name:'Start meditation'})).toBeEnabled());expect(screen.getByRole('alert')).toHaveTextContent('preferences cannot be saved');view.unmount();history.replaceState(null,'','#home');});
    it('validates defaults and rejects invalid volumes', () => { const p = defaultPreferences(); expect(validPreferences(p)).toBe(true); p.volumes.master = 2; expect(validPreferences(p)).toBe(false); });
    it('initializes all versioned tables', async () => { const db = new BuddyDatabase('test-foundation'); await db.open(); expect(db.verno).toBe(3); expect(db.tables.map(t => t.name).sort()).toEqual(['history', 'journal', 'media', 'migrations', 'preferences', 'routines']); await db.delete(); });
    it('does not require optional audio', () => { expect(audioCatalog).toHaveLength(23); expect(availableAudio()).toHaveLength(23); expect(new Set(audioCatalog.map(a => a.id)).size).toBe(audioCatalog.length); });
    it('detects legacy data without changing its contents', () => { const raw = '{"journal":["keep"]}'; localStorage.setItem('breathwork_data', raw); expect(detectLegacyData()).toBe('present'); expect(localStorage.getItem('breathwork_data')).toBe(raw); localStorage.removeItem('breathwork_data'); expect(detectLegacyData()).toBe('absent'); });
});
