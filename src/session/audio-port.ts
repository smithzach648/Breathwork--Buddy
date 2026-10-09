import type { PlannedStage } from './config';
export interface StageAudio {
    readonly sessionId: string;
    readonly stageId: string;
    readonly start: number;
    readonly deadline: number;
    readonly stage: PlannedStage;
    readonly resuming?: boolean;
}
export interface SessionAudio {
    enter(stage: StageAudio): void;
    cancelStage(stageId: string): void;
    cancelSession(sessionId: string): void;
    completeStage?(stage: StageAudio): void;
    finishSession?(sessionId: string, outcome: 'completed' | 'cancelled'): void;
}
