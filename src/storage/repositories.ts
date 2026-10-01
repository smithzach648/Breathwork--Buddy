import { database } from './database';
import type { SessionResult } from '../types/domain';
import { defaultPreferences, validPreferences, type Preferences } from '../settings/preferences';
export async function loadPreferences(): Promise<Preferences> {
    const saved = await database.preferences.get('preferences');
    if (validPreferences(saved))
        return saved;
    const defaults = defaultPreferences();
    await database.preferences.put(defaults);
    return defaults;
}
export async function savePreferences(preferences: Preferences) {
    if (!validPreferences(preferences))
        throw new Error('Invalid preferences');
    await database.preferences.put(preferences);
}
export const repositories = { routines: database.routines, journal: database.journal, history: database.history };
export async function saveSessionResult(result: SessionResult) { return database.history.put(result); }
export async function recentSessions(limit = 30) { return database.history.orderBy('startedAt').reverse().limit(limit).toArray(); }
