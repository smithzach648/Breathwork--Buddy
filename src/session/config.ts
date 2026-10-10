import { roundAnnouncementMs } from '../audio/voice-metadata';
import type { Routine } from '../types/domain';
import { validateRoutine, blockName } from '../routines/model';
import { validSound, type FrozenSound } from '../meditation/profile';
import {validateRecipe,type SoundRecipe} from '../meditation/environment';
export type PatternId = 'box' | '478' | 'calm' | 'coherent';
export type ExerciseConfig = {
    kind: 'patterned';
    presetId: PatternId;
    durationSeconds: number;
} | {
    kind: 'hormesis';
    presetId: 'hormesis-60' | 'hormesis-progressive';
    intervalSeconds: 2 | 3;
    cycles: 20 | 30 | 40;
    retentions: readonly (60 | 90)[];
    recoveryHoldSeconds: 15;
} | {
    kind: 'meditation';
    presetId: 'meditation';
    durationSeconds: number;
    audioPolicy: 'defaults' | 'silent' | 'custom';
    sound?: SoundRecipe;
} | {
    kind: 'custom-pattern';
    presetId: 'custom-pattern';
    inhaleSeconds: number;
    holdInSeconds: number;
    exhaleSeconds: number;
    holdOutSeconds: number;
    cycles: number;
} | {
    kind: 'hormesis-round';
    presetId: 'hormesis-round';
    intervalSeconds: 2 | 3;
    cycles: 20 | 30 | 40;
    retentionSeconds: 60 | 90;
} | {
    kind: 'settling';
    presetId: 'settling';
    durationSeconds: number;
};
export type PracticeConfig = ExerciseConfig | { kind: 'routine'; routine: Routine };
export type Phase = 'natural-settling' | 'meditation' | 'block-transition' | 'prepare-inhale' | 'prepare-exhale' | 'prepare-settle' | 'round-announcement' | 'inhale' | 'hold-in' | 'exhale' | 'hold-out' | 'pre-retention-exhale' | 'retention' | 'recovery-inhale' | 'recovery-hold' | 'recovery-exhale' | 'round-settle';
export interface PlannedStage {
    readonly phase: Phase;
    readonly label: string;
    readonly durationMs: number;
    readonly round: number;
    readonly totalRounds: number;
    readonly cycle: number;
    readonly totalCycles: number;
    readonly blockId?: string;
    readonly blockIndex?: number;
    readonly blockName?: string;
    readonly blockKind?: ExerciseConfig['kind'];
    readonly meditationPolicy?: 'defaults' | 'silent' | 'custom';
    readonly soundRecipe?: SoundRecipe;
}
export interface PracticeSnapshot {
    readonly id: string;
    readonly startedAt: string;
    readonly name: string;
    readonly config: PracticeConfig;
    readonly stages: readonly PlannedStage[];
    readonly plannedDurationSeconds: number;
    readonly meditationSound?: FrozenSound;
}
export const patterns: Record<PatternId, {
    name: string;
    seconds: readonly number[];
}> = {
    box: { name: 'Box 4-4-4-4', seconds: [4, 4, 4, 4] }, '478': { name: '4-7-8', seconds: [4, 7, 8, 0] }, calm: { name: 'Calm 4-4-6-2', seconds: [4, 4, 6, 2] }, coherent: { name: 'Coherent 6-6', seconds: [6, 0, 6, 0] },
};
const phases = ['inhale', 'hold-in', 'exhale', 'hold-out'] as const;
const labels: Record<Phase, string> = { 'natural-settling': 'Breathe naturally / settle', meditation: 'Meditation', 'block-transition': 'Next block', 'prepare-inhale': 'Prepare · Inhale', 'prepare-exhale': 'Prepare · Exhale', 'prepare-settle': 'Settle', 'round-announcement': 'Round', inhale: 'Inhale', 'hold-in': 'Hold in', exhale: 'Exhale', 'hold-out': 'Hold out', 'pre-retention-exhale': 'Exhale fully', retention: 'Hold', 'recovery-inhale': 'Recovery inhale', 'recovery-hold': 'Recovery hold', 'recovery-exhale': 'Recovery exhale', 'round-settle': 'Settle' };
export function validateConfig(config: PracticeConfig) {
    if (config.kind === 'routine') { validateRoutine(config.routine); return; }
    if (config.kind === 'custom-pattern') {
        const integer = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
        if (config.presetId !== 'custom-pattern' || !integer(config.inhaleSeconds, 1, 20) || !integer(config.exhaleSeconds, 1, 20) || !integer(config.holdInSeconds, 0, 20) || !integer(config.holdOutSeconds, 0, 20) || !integer(config.cycles, 1, 100) || customDuration(config) > 1800)
            throw new Error('Use whole seconds: inhale/exhale 1–20, holds 0–20 (0 = no hold), 1–100 cycles, at most 30 minutes per custom block.');
        return;
    }
    if (config.kind === 'hormesis-round') {
        if (config.presetId !== 'hormesis-round' || ![2, 3].includes(config.intervalSeconds) || ![20, 30, 40].includes(config.cycles) || ![60, 90].includes(config.retentionSeconds)) throw new Error('Choose 20, 30 or 40 breaths, 2 or 3 seconds each, and a 60 or 90 second retention target.');
        return;
    }
    if (config.kind === 'settling') {
        if (config.presetId !== 'settling' || !Number.isInteger(config.durationSeconds) || config.durationSeconds < 30 || config.durationSeconds > 600) throw new Error('Choose 30–600 whole seconds of natural settling.');
        return;
    }
    if (config.kind === 'meditation') {
        if (config.presetId !== 'meditation' || !Number.isInteger(config.durationSeconds) || config.durationSeconds < 60 || config.durationSeconds > 3600 || config.durationSeconds % 60 || !['defaults','silent','custom'].includes(config.audioPolicy)) throw new Error('Choose a meditation duration of 1–60 whole minutes and a supported sound policy.');
        if (config.audioPolicy==='custom') validateRecipe(config.sound);
        return;
    }
    if (config.kind === 'patterned') {
        if (!Object.hasOwn(patterns, config.presetId) || !Number.isFinite(config.durationSeconds) || config.durationSeconds <= 0 || config.durationSeconds > 600)
            throw new Error('Choose a valid practice duration.');
    }
    else if (config.kind === 'hormesis') {
        const expected = config.presetId === 'hormesis-60' ? [60, 60, 60] : config.presetId === 'hormesis-progressive' ? [60, 90, 90] : [];
        if (![2, 3].includes(config.intervalSeconds) || ![20, 30, 40].includes(config.cycles) || config.recoveryHoldSeconds !== 15 || !Array.isArray(config.retentions) || config.retentions.length !== 3 || !expected.every((n, i) => config.retentions[i] === n) || expected.length !== 3)
            throw new Error('Choose a valid Hormesis preset.');
    }
    else
        throw new Error('Unknown practice.');
}
export function patternedStages(seconds: readonly number[], durationSeconds: number): PlannedStage[] {
    if (seconds.length !== 4 || seconds.some(n => !Number.isFinite(n) || n < 0) || !seconds.some(n => n > 0) || !Number.isFinite(durationSeconds) || durationSeconds <= 0)
        throw new Error('Invalid breathing pattern.');
    const stages: PlannedStage[] = [];
    let elapsed = 0;
    let cycle = 1;
    const duration = durationSeconds * 1000;
    const totalCycles = Math.ceil(durationSeconds / seconds.reduce((a, b) => a + b, 0));
    while (elapsed < duration) {
        for (let i = 0; i < 4 && elapsed < duration; i++) {
            if (seconds[i] === 0)
                continue;
            const durationMs = Math.min(seconds[i] * 1000, duration - elapsed);
            stages.push({ phase: phases[i], label: labels[phases[i]], durationMs, round: 1, totalRounds: 1, cycle, totalCycles });
            elapsed += durationMs;
        }
        cycle++;
    }
    return stages;
}
export function compileStages(config: PracticeConfig): PlannedStage[] {
    validateConfig(config);
    const stages: PlannedStage[] = (['prepare-inhale', 'prepare-exhale', 'prepare-settle'] as const).map((phase, i) => ({ phase, label: labels[phase], durationMs: [4000, 6000, 3000][i], round: 0, totalRounds: config.kind === 'hormesis' ? 3 : 1, cycle: 0, totalCycles: 0 }));
    if (config.kind === 'routine') {
        config.routine.stages.forEach((block, index) => {
            if (index) stages.push({ phase: 'block-transition', label: `Next · ${blockName(block)}`, durationMs: 3000, round: 0, totalRounds: 0, cycle: 0, totalCycles: 0 });
            stages.push(...compileStages(block).slice(3).map(stage => ({ ...stage, blockId: block.id, blockIndex: index, blockName: blockName(block), blockKind: block.kind })));
        });
        return stages;
    }
    if (config.kind === 'patterned')
        return [...stages, ...patternedStages(patterns[config.presetId].seconds, config.durationSeconds)];
    if (config.kind === 'custom-pattern') return [...stages, ...patternedStages(customSeconds(config), customDuration(config))];
    if (config.kind === 'settling') return [...stages, { phase: 'natural-settling', label: 'Breathe naturally / settle', durationMs: config.durationSeconds * 1000, round: 0, totalRounds: 0, cycle: 0, totalCycles: 0 }];
    if (config.kind === 'meditation') return [...stages, { phase: 'meditation', label: 'Meditation', durationMs: config.durationSeconds * 1000, round: 0, totalRounds: 0, cycle: 0, totalCycles: 0, meditationPolicy: config.audioPolicy }];
    if (config.kind === 'hormesis-round') return [...stages, ...compileHormesisRound(config.intervalSeconds, config.cycles, config.retentionSeconds, 1, 1, false)];
    config.retentions.forEach((retention, index) => {
        stages.push(...compileHormesisRound(config.intervalSeconds, config.cycles, retention, index + 1, config.retentions.length, true));
    });
    return stages;
}
export function customSeconds(config: Extract<ExerciseConfig, { kind: 'custom-pattern' }>) {
    return [config.inhaleSeconds, config.holdInSeconds, config.exhaleSeconds, config.holdOutSeconds];
}
export function customDuration(config: Extract<ExerciseConfig, { kind: 'custom-pattern' }>) {
    return customSeconds(config).reduce((sum, n) => sum + n, 0) * config.cycles;
}
/** Shared timing for legacy three-round prescriptions and independent rounds. */
function compileHormesisRound(interval: 2 | 3, cycles: number, retention: number, round: number, totalRounds: number, announce: boolean): PlannedStage[] {
    const stages: PlannedStage[] = [];
    const add = (phase: Phase, seconds: number, cycle: number) => stages.push({ phase, label: labels[phase], durationMs: seconds * 1000, round, totalRounds, cycle, totalCycles: cycles });
    if (announce) stages.push({ phase: 'round-announcement', label: round === 3 ? 'Final round' : `Round ${round}`, durationMs: roundAnnouncementMs[round - 1], round, totalRounds, cycle: 0, totalCycles: cycles });
    for (let cycle = 1; cycle <= cycles; cycle++) {
        add('inhale', interval, cycle);
        add(cycle === cycles ? 'pre-retention-exhale' : 'exhale', cycle === cycles ? 4 : interval, cycle);
    }
    add('retention', retention, cycles);
    add('recovery-inhale', 4, cycles);
    add('recovery-hold', 15, cycles);
    add('recovery-exhale', 6, cycles);
    add('round-settle', 3, cycles);
    return stages;
}
export function deepFreeze<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(deepFreeze);
        Object.freeze(value);
    }
    return value;
}
export function createSnapshot(config: PracticeConfig, id: string = crypto.randomUUID(), startedAt = new Date().toISOString(), meditationSound?:FrozenSound): PracticeSnapshot {
    const copy = structuredClone(config);
    const stages = compileStages(copy);
    if(meditationSound && !validSound(meditationSound))throw new Error('Invalid meditation sound profile');
    if(meditationSound?.environment) for(let i=0;i<stages.length;i++) if(stages[i].phase==='meditation') {
        const recipe=meditationSound.environment.blocks[stages[i].blockId||'standalone'];validateRecipe(recipe);
        stages[i]={...stages[i],soundRecipe:structuredClone(recipe)};
    }
    if (!Number.isFinite(Date.parse(startedAt)))
        throw new Error('Invalid session start time.');
    return deepFreeze({ id, startedAt, name: copy.kind === 'routine' ? copy.routine.name.trim() : blockName(copy), config: copy, stages, plannedDurationSeconds: copy.kind === 'patterned' || copy.kind === 'meditation' ? copy.durationSeconds : stages.reduce((sum, s) => sum + s.durationMs, 0) / 1000, ...(meditationSound?{meditationSound:structuredClone(meditationSound)}:{}) });
}
