export type PatternId = 'box' | '478' | 'calm' | 'coherent';
export type PracticeConfig = {
    kind: 'patterned';
    presetId: PatternId;
    durationSeconds: number;
} | {
    kind: 'hormesis';
    presetId: 'hormesis-60' | 'hormesis-progressive';
    intervalSeconds: 2 | 3;
    cycles: 20 | 30 | 40;
    retentions: readonly (60 | 90)[];
    recoveryHoldSeconds: 10 | 15 | 20;
};
export type Phase = 'inhale' | 'hold-in' | 'exhale' | 'hold-out' | 'retention' | 'recovery-inhale' | 'recovery-hold';
export interface PlannedStage {
    readonly phase: Phase;
    readonly label: string;
    readonly durationMs: number;
    readonly round: number;
    readonly totalRounds: number;
    readonly cycle: number;
    readonly totalCycles: number;
}
export interface PracticeSnapshot {
    readonly id: string;
    readonly startedAt: string;
    readonly name: string;
    readonly config: PracticeConfig;
    readonly stages: readonly PlannedStage[];
    readonly plannedDurationSeconds: number;
}
export const patterns: Record<PatternId, {
    name: string;
    seconds: readonly number[];
}> = {
    box: { name: 'Box 4-4-4-4', seconds: [4, 4, 4, 4] }, '478': { name: '4-7-8', seconds: [4, 7, 8, 0] }, calm: { name: 'Calm 4-4-6-2', seconds: [4, 4, 6, 2] }, coherent: { name: 'Coherent 6-6', seconds: [6, 0, 6, 0] },
};
const phases = ['inhale', 'hold-in', 'exhale', 'hold-out'] as const;
const labels: Record<Phase, string> = { inhale: 'Inhale', 'hold-in': 'Hold in', exhale: 'Exhale', 'hold-out': 'Hold out', retention: 'Hold', 'recovery-inhale': 'Recovery inhale', 'recovery-hold': 'Recovery hold' };
export function validateConfig(config: PracticeConfig) {
    if (config.kind === 'patterned') {
        if (!Object.hasOwn(patterns, config.presetId) || !Number.isFinite(config.durationSeconds) || config.durationSeconds <= 0 || config.durationSeconds > 600)
            throw new Error('Choose a valid practice duration.');
    }
    else if (config.kind === 'hormesis') {
        const expected = config.presetId === 'hormesis-60' ? [60, 60, 60] : config.presetId === 'hormesis-progressive' ? [60, 90, 90] : [];
        if (![2, 3].includes(config.intervalSeconds) || ![20, 30, 40].includes(config.cycles) || ![10, 15, 20].includes(config.recoveryHoldSeconds) || config.retentions.length !== 3 || !expected.every((n, i) => config.retentions[i] === n) || expected.length !== 3)
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
    if (config.kind === 'patterned')
        return patternedStages(patterns[config.presetId].seconds, config.durationSeconds);
    const stages: PlannedStage[] = [];
    config.retentions.forEach((retention, index) => {
        const round = index + 1;
        const add = (phase: Phase, seconds: number, cycle: number) => stages.push({ phase, label: labels[phase], durationMs: seconds * 1000, round, totalRounds: config.retentions.length, cycle, totalCycles: config.cycles });
        for (let cycle = 1; cycle <= config.cycles; cycle++) {
            add('inhale', config.intervalSeconds, cycle);
            add('exhale', config.intervalSeconds, cycle);
        }
        add('retention', retention, config.cycles);
        add('recovery-inhale', 2, config.cycles);
        add('recovery-hold', config.recoveryHoldSeconds, config.cycles);
    });
    return stages;
}
export function deepFreeze<T>(value: T): T { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
} return value; }
export function createSnapshot(config: PracticeConfig, id: string = crypto.randomUUID(), startedAt = new Date().toISOString()): PracticeSnapshot {
    const copy = structuredClone(config);
    const stages = compileStages(copy);
    if (!Number.isFinite(Date.parse(startedAt)))
        throw new Error('Invalid session start time.');
    return deepFreeze({ id, startedAt, name: copy.kind === 'patterned' ? patterns[copy.presetId].name : copy.presetId === 'hormesis-60' ? 'Hormesis 60 / 60 / 60' : 'Hormesis 60 / 90 / 90', config: copy, stages, plannedDurationSeconds: stages.reduce((sum, s) => sum + s.durationMs, 0) / 1000 });
}
