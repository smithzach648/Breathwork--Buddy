export type StageKind = 'settling' | 'patterned-breathing' | 'hormesis' | 'timed-retention' | 'manual-retention' | 'recovery-inhale' | 'recovery-hold' | 'meditation' | 'journal';
import type { ExerciseConfig } from '../session/config';
export type RoutineStage = ExerciseConfig & { readonly id: string };
export interface Routine {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly favorite?: boolean;
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
    endReason?: 'ended-early';
    meditation?: { plannedDurationSeconds: number; actualDurationSeconds: number };
    routineName?: string;
    blocksCompleted?: number;
    totalBlocks?: number;
    blocks?: {
        id: string;
        name: string;
        kind: ExerciseConfig['kind'];
        outcome: 'completed' | 'cancelled' | 'not-started';
        plannedDurationSeconds: number;
        actualDurationSeconds: number;
        retentions: NonNullable<SessionResult['retentions']>;
    }[];
    retentions?: {
        stageId: string;
        blockId?: string;
        durationSeconds: number;
        round?: number;
        outcome?: 'completed' | 'released' | 'cancelled';
    }[];
}
