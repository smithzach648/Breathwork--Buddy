export type StageKind = 'settling' | 'patterned-breathing' | 'hormesis' | 'timed-retention' | 'manual-retention' | 'recovery-inhale' | 'recovery-hold' | 'meditation' | 'journal';
export interface RoutineStage {
    readonly id: string;
    readonly kind: StageKind;
    readonly durationSeconds?: number;
}
export interface Routine {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly favorite: boolean;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly stages: readonly RoutineStage[];
}
export interface SessionSnapshot {
    readonly id: string;
    readonly startedAt: string;
    readonly routine: Routine;
    readonly plannedDurationSeconds?: number;
}
export interface SessionResult {
    id: string;
    routineId: string;
    practiceName?: string;
    startedAt: string;
    endedAt: string;
    plannedDurationSeconds?: number;
    actualDurationSeconds: number;
    outcome: 'completed' | 'cancelled';
    stagesCompleted: number;
    roundsCompleted?: number;
    retentions?: {
        stageId: string;
        durationSeconds: number;
        round?: number;
        outcome?: 'completed' | 'released' | 'cancelled';
    }[];
}
