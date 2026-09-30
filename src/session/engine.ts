import type { SessionSnapshot } from '../types/domain';
export interface SessionState {
    readonly sessionId: string;
    readonly status: 'idle' | 'running' | 'completed' | 'cancelled';
    readonly stageIndex: number;
}
/** Phase 2 contract. Clock and cancellation belong in the engine, never React. */
export interface SessionEngine {
    start(snapshot: SessionSnapshot): void;
    cancel(): void;
    subscribe(listener: (state: SessionState) => void): () => void;
}
