import { database, type BuddyDatabase } from '../storage/database';
import type { Routine } from '../types/domain';
import { MAX_NAME, validateRoutine } from './model';
export class RoutineRepository {
    constructor(private db: BuddyDatabase = database) {}
    list() { return this.db.routines.toArray(); }
    async read(id: string) { const row = await this.db.routines.get(id); if (!row) throw new Error('This routine was not found.'); validateRoutine(row); return structuredClone(row); }
    async save(draft: Routine) {
        const copy = structuredClone(draft); validateRoutine(copy);
        return this.db.transaction('rw', this.db.routines, async () => {
            const existing = await this.db.routines.get(copy.id);
            const now = Date.now();
            const saved = { ...copy, name: copy.name.trim(), createdAt: existing && Number.isFinite(Date.parse(existing.createdAt)) ? existing.createdAt : copy.createdAt, updatedAt: new Date(Math.max(now, (Date.parse(existing?.updatedAt || '') || 0) + 1)).toISOString() };
            await this.db.routines.put(saved); return saved;
        });
    }
    async duplicate(id: string) {
        const row = await this.read(id), now = new Date().toISOString();
        const copy = { ...row, id: crypto.randomUUID(), name: `${row.name.slice(0, MAX_NAME - 5)} copy`, createdAt: now, updatedAt: now, stages: row.stages.map(block => ({ ...block, id: crypto.randomUUID() })) };
        validateRoutine(copy); await this.db.routines.add(copy); return copy;
    }
    remove(id: string) { return this.db.routines.delete(id); }
}
export const routineRepository = new RoutineRepository();
