import Dexie, { type Table } from 'dexie';
import type { Preferences } from '../settings/preferences';
import type { Routine, SessionResult } from '../types/domain';
import type { JournalEntry } from '../journal/types';
import type { LocalMediaRecord } from '../media/library';
import { normalizePreferences } from '../settings/preferences';
export interface MigrationMetadata {
    id: string;
    completedAt: string;
    sourceVersion: string;
}
export class BuddyDatabase extends Dexie {
    preferences!: Table<Preferences, string>;
    routines!: Table<Routine, string>;
    journal!: Table<JournalEntry, string>;
    history!: Table<SessionResult, string>;
    migrations!: Table<MigrationMetadata, string>;
    media!: Table<LocalMediaRecord, string>;
    constructor(name = 'breathwork-buddy-v2') {
        super(name);
        this.version(1).stores({ preferences: 'id', routines: 'id,updatedAt', journal: 'id,createdAt,sessionId', history: 'id,startedAt,routineId', migrations: 'id' });
        // Version 1 remains intact. New index only; existing rows and preferences are preserved.
        this.version(2).stores({ history: 'id,startedAt,routineId,outcome' });
        this.version(3).stores({ media: 'id,importedAt' }).upgrade(async tx => {
            const saved = await tx.table('preferences').get('preferences');
            if (saved) await tx.table('preferences').put(normalizePreferences(saved));
        });
    }
}
export const database = new BuddyDatabase();
