import type { Clock, Scheduler } from './clock';
import { createSnapshot, deepFreeze, type PracticeSnapshot, type PlannedStage } from './config';
import type { SessionAudio } from './audio-port';
import type { SessionResult } from '../types/domain';
export interface SessionState {
    readonly status: 'idle' | 'running' | 'completed' | 'cancelled';
    readonly sessionId?: string;
    readonly snapshot?: PracticeSnapshot;
    readonly stageId?: string;
    readonly stage?: PlannedStage;
    readonly stageStart?: number;
    readonly deadline?: number;
    readonly remainingMs: number;
    readonly elapsedMs: number;
    readonly stagesCompleted: number;
    readonly roundsCompleted: number;
    readonly releaseAvailable: boolean;
    readonly result?: SessionResult;
}
const idle: SessionState = Object.freeze({ status: 'idle', remainingMs: 0, elapsedMs: 0, stagesCompleted: 0, roundsCompleted: 0, releaseAvailable: false });
const silent: SessionAudio = { enter() { }, cancelStage() { }, cancelSession() { } };
/** Deadlines advance from the previous deadline, never from callback arrival time. */
export class DeterministicSessionEngine {
    private state: SessionState = idle;
    private listeners = new Set<() => void>();
    private cancelWakeup: (() => void) | undefined;
    private generation = 0;
    private index = 0;
    private startTime = 0;
    private stageStart = 0;
    private deadline = 0;
    private stagesCompleted = 0;
    private roundsCompleted = 0;
    private retentions: NonNullable<SessionResult['retentions']> = [];
    private audioEnabled = true;
    constructor(private clock: Clock, private scheduler: Scheduler, private audio: SessionAudio = silent) { }
    getState = () => this.state;
    subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    private notify() { this.listeners.forEach(listener => listener()); }
    private sound(action: () => void) { try {
        action();
    }
    catch { /* Audio cannot affect session truth. */ } }
    private stageToken() { return `${this.state.sessionId}/stage-${this.index}`; }
    start(input: PracticeSnapshot) {
        if (this.state.status === 'running')
            throw new Error('Stop the active practice before starting another.');
        const snapshot = createSnapshot(input.config, input.id, input.startedAt);
        this.generation++;
        this.index = 0;
        this.stagesCompleted = 0;
        this.roundsCompleted = 0;
        this.retentions = [];
        this.startTime = this.clock.now();
        this.stageStart = this.startTime;
        this.deadline = this.stageStart + snapshot.stages[0].durationMs;
        this.state = { ...idle, status: 'running', sessionId: `${snapshot.id}/${this.generation}`, snapshot };
        this.publish(this.startTime);
        this.enterAudio();
        this.arm();
    }
    private publish(now: number) {
        const stage = this.state.snapshot!.stages[this.index];
        this.state = Object.freeze({ ...this.state, stageId: this.stageToken(), stage, stageStart: this.stageStart, deadline: this.deadline, remainingMs: Math.max(0, this.deadline - now), elapsedMs: Math.max(0, now - this.startTime), stagesCompleted: this.stagesCompleted, roundsCompleted: this.roundsCompleted, releaseAvailable: stage.phase === 'retention' });
        this.notify();
    }
    private enterAudio(resuming = false) { if (this.audioEnabled) {
        const { sessionId, stageId, stage } = this.state;
        this.sound(() => this.audio.enter({ sessionId: sessionId!, stageId: stageId!, stage: stage!, start: this.stageStart, deadline: this.deadline, resuming }));
    } }
    private arm() {
        this.cancelWakeup?.();
        if (this.state.status !== 'running')
            return;
        const generation = this.generation;
        const stageId = this.state.stageId;
        this.cancelWakeup = this.scheduler.at(Math.min(this.deadline, this.clock.now() + 100), () => { if (generation !== this.generation || stageId !== this.state.stageId || this.state.status !== 'running')
            return; this.reconcile(); });
    }
    private finishStage(end: number, outcome: 'completed' | 'released' | 'cancelled' = 'completed') {
        const stage = this.state.snapshot!.stages[this.index];
        if (stage.phase === 'retention')
            this.retentions.push({ stageId: this.stageToken(), round: stage.round, durationSeconds: Math.max(0, end - this.stageStart) / 1000, outcome });
        if (outcome !== 'cancelled') {
            this.stagesCompleted++;
            if (stage.phase === 'recovery-hold')
                this.roundsCompleted++;
        }
    }
    reconcile() {
        if (this.state.status !== 'running')
            return;
        this.cancelWakeup?.();
        this.cancelWakeup = undefined;
        const now = this.clock.now();
        const stages = this.state.snapshot!.stages;
        let changed = false;
        while (now >= this.deadline) {
            this.sound(() => this.audio.cancelStage(this.stageToken()));
            this.finishStage(this.deadline);
            this.index++;
            changed = true;
            if (this.index === stages.length) {
                this.finish('completed', this.deadline);
                return;
            }
            this.stageStart = this.deadline;
            this.deadline += stages[this.index].durationMs;
        }
        this.publish(now);
        if (changed)
            this.enterAudio();
        this.arm();
    }
    releaseRetention() {
        this.reconcile();
        if (!this.state.releaseAvailable || this.state.status !== 'running')
            return;
        const now = this.clock.now();
        this.cancelWakeup?.();
        this.sound(() => this.audio.cancelStage(this.stageToken()));
        this.finishStage(now, 'released');
        this.index++;
        this.stageStart = now;
        this.deadline = now + this.state.snapshot!.stages[this.index].durationMs;
        this.publish(now);
        this.enterAudio();
        this.arm();
    }
    stop() { this.reconcile(); if (this.state.status !== 'running')
        return; const now = this.clock.now(); this.finishStage(now, 'cancelled'); this.finish('cancelled', now); }
    private finish(outcome: 'completed' | 'cancelled', end: number) {
        const sessionId = this.state.sessionId!;
        const snapshot = this.state.snapshot!;
        this.cancelWakeup?.();
        this.cancelWakeup = undefined;
        this.sound(() => this.audio.cancelSession(sessionId));
        const result: SessionResult = { id: sessionId, routineId: snapshot.config.presetId, practiceName: snapshot.name, startedAt: snapshot.startedAt, endedAt: new Date(Date.parse(snapshot.startedAt) + Math.max(0, end - this.startTime)).toISOString(), plannedDurationSeconds: snapshot.plannedDurationSeconds, actualDurationSeconds: Math.max(0, end - this.startTime) / 1000, outcome, stagesCompleted: this.stagesCompleted, roundsCompleted: snapshot.config.kind === 'hormesis' ? this.roundsCompleted : undefined, retentions: this.retentions.length ? structuredClone(this.retentions) : undefined };
        this.state = deepFreeze({ ...this.state, status: outcome, remainingMs: 0, elapsedMs: Math.max(0, end - this.startTime), stagesCompleted: this.stagesCompleted, roundsCompleted: this.roundsCompleted, releaseAvailable: false, result });
        this.notify();
    }
    setVisible(visible: boolean) { const wasVisible = this.audioEnabled; this.audioEnabled = visible; if (!visible && this.state.sessionId)
        this.sound(() => this.audio.cancelSession(this.state.sessionId!)); this.reconcile(); if (visible && !wasVisible && this.state.status === 'running')
        this.enterAudio(true); }
    reset() { if (this.state.status === 'running')
        throw new Error('Cannot reset active practice.'); this.state = idle; this.notify(); }
}
