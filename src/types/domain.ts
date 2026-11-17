export type StageKind = 'settling' | 'patterned-breathing' | 'hormesis' | 'timed-retention' | 'manual-retention' | 'recovery-inhale' | 'recovery-hold' | 'meditation' | 'journal';
import type { ExerciseConfig } from '../session/config';
import type { FrozenSound } from '../meditation/profile';
import type { SoundRecipe } from '../meditation/environment';
export type RoutineStage = ExerciseConfig & { readonly id: string };
export interface Routine {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly favorite?: boolean;
    readonly foundation?: SoundRecipe;
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
export interface PatternedBreathingResult {presetId:import('../session/config').PatternId;requestedCycles:number;completedCycles:number}
export interface SessionResult {
    patternedBreathing?:PatternedBreathingResult;
    guidanceProfile?:'soft-felt-marshall.1';
    soundMixChanges?:{atSeconds:number;mix:import('../meditation-suite/mix').ListenerMix;blockId?:string}[];
    journey?: { snapshot: import('../meditation-suite/model').JourneyConfig; naturalBreathingAtSeconds?: number };
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
    soundProfile?: FrozenSound;
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
        soundRecipe?: SoundRecipe;
        patternedBreathing?:PatternedBreathingResult;
        customPattern?: { inhaleSeconds: number; holdInSeconds: number; exhaleSeconds: number; holdOutSeconds: number; requestedCycles: number; completedCycles: number };
        hormesisRound?: { preparationBreaths: number; intervalSeconds: number; retentionTargetSeconds: number; recoveryCompleted: boolean };
    }[];
    retentions?: {
        stageId: string;
        blockId?: string;
        durationSeconds: number;
        round?: number;
        outcome?: 'completed' | 'released' | 'cancelled';
    }[];
}
