import type { PlannedStage } from './config';
import type { PracticeSnapshot } from './config';
export interface StageAudio {
    readonly sessionId: string;
    readonly stageId: string;
    readonly start: number;
    readonly deadline: number;
    readonly stage: PlannedStage;
    readonly resuming?: boolean;
}
export interface SessionAudio {
    beginSession?(snapshot: PracticeSnapshot, start: number, sessionId: string): void;
    enter(stage: StageAudio): void;
    cancelStage(stageId: string): void;
    cancelSession(sessionId: string): void;
    completeStage?(stage: StageAudio): void;
    finishSession?(sessionId: string, outcome: 'completed' | 'cancelled'): void;
}
