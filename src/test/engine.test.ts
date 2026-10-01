import { describe, it, expect, vi } from 'vitest';
import { DeterministicSessionEngine } from '../session/engine';
import { createSnapshot, patternedStages, type PracticeConfig, type PatternId } from '../session/config';
import { stageCues } from '../audio/cues';
import { FakeTiming } from './fake-time';
const patterned = (presetId: PatternId = 'box', durationSeconds = 180): PracticeConfig => ({ kind: 'patterned', presetId, durationSeconds });
const hormone = (progressive = false, intervalSeconds: 2 | 3 = 2, cycles: 20 | 30 | 40 = 20): PracticeConfig => ({ kind: 'hormesis', presetId: progressive ? 'hormesis-progressive' : 'hormesis-60', intervalSeconds, cycles, retentions: progressive ? [60, 90, 90] : [60, 60, 60], recoveryHoldSeconds: 15 });
function fixture() { const timing = new FakeTiming(); const audio = { enter: vi.fn(), cancelStage: vi.fn(), cancelSession: vi.fn() }; const engine = new DeterministicSessionEngine(timing, timing, audio); const start = (config: PracticeConfig) => engine.start(createSnapshot(config, 'test', '2026-09-30T00:00:00Z')); return { timing, audio, engine, start }; }
describe('patterned deadlines', () => {
    it.each([
        ['box', [['inhale', 4], ['hold-in', 4], ['exhale', 4], ['hold-out', 4]]],
        ['478', [['inhale', 4], ['hold-in', 7], ['exhale', 8]]],
        ['calm', [['inhale', 4], ['hold-in', 4], ['exhale', 6], ['hold-out', 2]]],
        ['coherent', [['inhale', 6], ['exhale', 6]]],
    ] as const)('%s progresses exactly, without phantom phases', (id, expected) => {
        const { timing, engine, start, audio } = fixture();
        start(patterned(id));
        for (const [phase, seconds] of expected) {
            expect(engine.getState().stage?.phase).toBe(phase);
            timing.advance(seconds * 1000 - 1);
            expect(engine.getState().stage?.phase).toBe(phase);
            timing.advance(1);
        }
        expect(engine.getState().stage?.phase).toBe('inhale');
        expect(engine.getState().stage?.cycle).toBe(2);
        expect(audio.enter).toHaveBeenCalledTimes(expected.length + 1);
    });
    it('skips zero durations and rejects empty patterns', () => { const stages = patternedStages([1, 0, 1, 0], 5); expect(stages.map(s => s.phase)).toEqual(['inhale', 'exhale', 'inhale', 'exhale', 'inhale']); expect(stages.every(s => s.durationMs > 0)).toBe(true); expect(() => patternedStages([0, 0, 0, 0], 3)).toThrow(); });
    it.each([180, 300, 600])('ends exactly at total deadline %s even mid-pattern', (seconds) => { const f = fixture(); f.start(patterned('478', seconds)); f.timing.advance(seconds * 1000); expect(f.engine.getState().status).toBe('completed'); expect(f.engine.getState().result?.actualDurationSeconds).toBe(seconds); expect(f.engine.getState().result?.endedAt).toBe(new Date(Date.parse('2026-09-30T00:00:00Z') + seconds * 1000).toISOString()); });
});
describe('Hormesis', () => {
    it.each([2, 3] as const)('uses exactly 20 full cycles at %s seconds per phase', (interval) => { const f = fixture(); f.start(hormone(false, interval)); f.timing.advance(20 * 2 * interval * 1000); expect(f.engine.getState().stage?.phase).toBe('retention'); expect(f.audio.enter.mock.calls.filter(([s]) => ['inhale', 'exhale'].includes(s.stage.phase))).toHaveLength(40); expect(f.engine.getState().stage?.cycle).toBe(20); });
    it.each([20, 30, 40] as const)('supports %s cycles', (cycles) => { const f = fixture(); f.start(hormone(false, 2, cycles)); f.timing.advance(cycles * 4000); expect(f.engine.getState().stage?.phase).toBe('retention'); });
    it.each([false, true])('executes all structured rounds, retention deadlines and recovery ordering; progressive=%s', (progressive) => {
        const f = fixture();
        f.start(hormone(progressive));
        const holds = progressive ? [60, 90, 90] : [60, 60, 60];
        for (let round = 1; round <= 3; round++) {
            f.timing.advance(80000);
            expect(f.engine.getState().stage?.phase).toBe('retention');
            expect(f.engine.getState().stage?.round).toBe(round);
            f.timing.advance(holds[round - 1] * 1000 - 1);
            expect(f.engine.getState().stage?.phase).toBe('retention');
            f.timing.advance(1);
            expect(f.engine.getState().stage?.phase).toBe('recovery-inhale');
            f.timing.advance(2000);
            expect(f.engine.getState().stage?.phase).toBe('recovery-hold');
            f.timing.advance(15000);
            if (round < 3)
                expect(f.engine.getState().stage?.round).toBe(round + 1);
        }
        expect(f.engine.getState().status).toBe('completed');
        expect(f.engine.getState().result?.retentions?.map(r => r.durationSeconds)).toEqual(holds);
        expect(f.engine.getState().result?.roundsCompleted).toBe(3);
    });
    it('countdown cues are at absolute final-five seconds', () => { const f = fixture(); f.start(hormone(true)); f.timing.advance(80000); const scope = f.audio.enter.mock.calls.at(-1)![0]; const cues = stageCues(scope); expect(cues.slice(1).map(c => c.at - scope.start)).toEqual([55000, 56000, 57000, 58000, 59000]); expect(cues.slice(1).map(c => c.id)).toEqual(['voice.five', 'voice.four', 'voice.three', 'voice.two', 'voice.one']); });
});
describe('release, cancellation and identities', () => {
    it('records early release and invalidates the old deadline/countdown', () => {
        const f = fixture();
        f.start(hormone());
        f.timing.advance(80000);
        const oldStage = f.engine.getState().stageId;
        const oldCallbacks = f.timing.jobs.map(j => j.callback);
        f.timing.advance(12500);
        f.engine.releaseRetention();
        expect(f.engine.getState().stage?.phase).toBe('recovery-inhale');
        expect(f.audio.cancelStage).toHaveBeenCalledWith(oldStage);
        oldCallbacks.forEach(callback => callback());
        expect(f.engine.getState().stage?.phase).toBe('recovery-inhale');
        f.timing.advance(2000);
        expect(f.engine.getState().stage?.phase).toBe('recovery-hold');
        f.timing.advance(15000);
        expect(f.engine.getState().stage?.round).toBe(2);
        f.timing.advance(140000 - 109500);
        expect(f.engine.getState().stage?.phase).toBe('exhale');
        f.engine.stop();
        expect(f.engine.getState().result?.retentions?.[0].durationSeconds).toBe(12.5);
        expect(f.engine.getState().result?.retentions?.[0].outcome).toBe('released');
    });
    it('Stop cancels future work; stop/restart rejects old callbacks', () => { const f = fixture(); f.start(patterned()); const oldId = f.engine.getState().sessionId; const callbacks = f.timing.jobs.map(j => j.callback); f.timing.advance(1234); f.engine.stop(); expect(f.engine.getState().result?.outcome).toBe('cancelled'); expect(f.audio.cancelSession).toHaveBeenCalledWith(oldId); f.start(patterned('coherent')); expect(f.engine.getState().sessionId).not.toBe(oldId); callbacks.forEach(cb => cb()); expect(f.engine.getState().stage?.phase).toBe('inhale'); expect(f.engine.getState().elapsedMs).toBe(0); });
    it('active source config cannot mutate the runtime snapshot', () => { const config = hormone(); const snapshot = createSnapshot(config); const f = fixture(); f.engine.start(snapshot); (config as Extract<PracticeConfig, {
        kind: 'hormesis';
    }>).cycles = 40; expect(f.engine.getState().snapshot?.config).not.toBe(config); expect((f.engine.getState().snapshot?.config as Extract<PracticeConfig, {
        kind: 'hormesis';
    }>).cycles).toBe(20); expect(Object.isFrozen(f.engine.getState().snapshot?.config)).toBe(true); expect(() => { (f.engine.getState().snapshot!.stages[0] as {
        durationMs: number;
    }).durationMs = 1; }).toThrow(); });
    it('audio exceptions never break engine timing', () => { const timing = new FakeTiming(); const engine = new DeterministicSessionEngine(timing, timing, { enter() { throw new Error('missing audio'); }, cancelStage() { throw new Error(); }, cancelSession() { throw new Error(); } }); engine.start(createSnapshot(patterned('box', 10))); timing.advance(10000); expect(engine.getState().status).toBe('completed'); });
});
describe('background reconciliation', () => {
    it('jumps to the surviving stage rather than replaying expired stages', () => { const f = fixture(); f.start(patterned('box')); f.timing.jump(13500); f.engine.reconcile(); expect(f.engine.getState().stage?.phase).toBe('hold-out'); expect(f.engine.getState().remainingMs).toBe(2500); expect(f.audio.enter).toHaveBeenCalledTimes(2); });
    it('expired retention never extends the deadline', () => { const f = fixture(); f.start(hormone()); f.timing.advance(80000); f.engine.setVisible(false); f.timing.jump(65000); f.engine.setVisible(true); expect(f.engine.getState().stage?.phase).toBe('recovery-hold'); expect(f.engine.getState().remainingMs).toBe(12000); expect(f.audio.enter.mock.calls.at(-1)![0].resuming).toBe(true); });
    it('returning after the whole session records deadline duration', () => { const f = fixture(); f.start(hormone()); f.timing.jump(1000000); f.engine.reconcile(); expect(f.engine.getState().status).toBe('completed'); expect(f.engine.getState().result?.actualDurationSeconds).toBe(471); expect(f.engine.getState().result?.retentions?.map(r => r.durationSeconds)).toEqual([60, 60, 60]); });
});
