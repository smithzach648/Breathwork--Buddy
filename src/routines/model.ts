import { patterns, validateConfig, type ExerciseConfig } from '../session/config';
import type { Routine, RoutineStage } from '../types/domain';
import {validateRecipe} from '../meditation/environment';
export const MAX_BLOCKS = 20;
export const MAX_NAME = 80;
const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function validateRoutine(value: unknown): asserts value is Routine {
    if (!record(value) || !validId(value.id)) throw new Error('Routine identity is invalid. Delete this record and create a new routine.');
    if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > MAX_NAME) throw new Error('Give your routine a name of 1–80 characters.');
    if (typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) || !Number.isFinite(Date.parse(value.updatedAt))) throw new Error('Routine dates are invalid. Edit and save to repair them.');
    if (!Array.isArray(value.stages) || !value.stages.length || value.stages.length > MAX_BLOCKS) throw new Error('Add between 1 and 20 blocks.');
    if(value.foundation!==undefined) validateRecipe(value.foundation);
    const ids = new Set<string>();
    Array.from(value.stages).forEach((stage: unknown, index: number) => {
        try {
            if (!record(stage) || !validId(stage.id) || ids.has(stage.id)) throw new Error('Each block needs a unique valid identity.');
            ids.add(stage.id);
            if (stage.kind === 'patterned') {
                if (![180, 300, 600].includes(stage.durationSeconds as number)) throw new Error('Choose 3, 5, or 10 minutes.');
            } else if (stage.kind === 'hormesis') {
                if (!Array.isArray(stage.retentions)) throw new Error('Choose a supported retention sequence.');
            } else if (stage.kind === 'meditation') {
                // Meditation validation includes its exact minute boundaries and minimal policy.
            } else if (!['custom-pattern', 'hormesis-round', 'settling'].includes(stage.kind as string)) throw new Error('Choose a supported routine block. This record may need repair.');
            validateConfig(stage as unknown as ExerciseConfig);
        } catch (error) { throw new Error(`Block ${index + 1}: ${error instanceof Error ? error.message : 'Invalid block.'}`); }
    });
}
export function blockName(block: ExerciseConfig) {
    if (block.kind === 'custom-pattern') {
        const seconds = [block.inhaleSeconds, ...(block.holdInSeconds ? [block.holdInSeconds] : []), block.exhaleSeconds, ...(block.holdOutSeconds ? [block.holdOutSeconds] : [])];
        return `Custom ${seconds.join('–')} × ${block.cycles}`;
    }
    if (block.kind === 'hormesis-round') return `One Hormesis Round · ${block.cycles} breaths · ${block.retentionSeconds}s target`;
    if (block.kind === 'settling') return 'Breathe naturally / settle';
    return block.kind === 'meditation' ? 'Meditation' : block.kind === 'patterned' ? patterns[block.presetId].name : block.presetId === 'hormesis-60' ? 'Hormesis 60 / 60 / 60' : 'Hormesis 60 / 90 / 90';
}
export function newBlock(): Extract<RoutineStage, { kind: 'patterned' }> { return { id: crypto.randomUUID(), kind: 'patterned', presetId: 'coherent', durationSeconds: 300 }; }
/** Repair supplies an editable draft; nothing is written automatically. */
export function repairDraft(value: unknown): Routine {
    const row = record(value) ? value : {};
    const now = new Date().toISOString();
    const stages: RoutineStage[] = [];
    if (Array.isArray(row.stages)) for (const raw of row.stages.slice(0, MAX_BLOCKS)) {
        const block = record(raw) ? { ...raw, id: crypto.randomUUID() } : newBlock();
        const candidate = { id: crypto.randomUUID(), name: 'Check', createdAt: now, updatedAt: now, stages: [block] };
        try { validateRoutine(candidate); stages.push(candidate.stages[0]); } catch { stages.push(newBlock()); }
    }
    return { id: validId(row.id) ? row.id : crypto.randomUUID(), name: typeof row.name === 'string' ? row.name.slice(0, MAX_NAME) : '', createdAt: typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt)) ? row.createdAt : now, updatedAt: now, stages };
}
