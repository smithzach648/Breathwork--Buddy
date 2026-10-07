import { describe, it, expect, vi } from 'vitest';
import { createSnapshot, validateConfig, type PracticeConfig, type Phase } from '../session/config';
import { DeterministicSessionEngine } from '../session/engine';
import { stageCues } from '../audio/cues';
import { roundAnnouncementMs, voiceDurations, roundVoiceIds } from '../audio/voice-metadata';
import { resolveAsset } from '../audio/catalog';
import { FakeTiming } from './fake-time';
import type { StageAudio } from '../session/audio-port';
const hormone = (progressive = false): PracticeConfig => ({ kind: 'hormesis', presetId: progressive ? 'hormesis-progressive' : 'hormesis-60', intervalSeconds: 2, cycles: 20, retentions: progressive ? [60, 90, 90] : [60, 60, 60], recoveryHoldSeconds: 15 });
const presets: PracticeConfig[] = ['box', '478', 'calm', 'coherent'].map(presetId => ({ kind: 'patterned', presetId, durationSeconds: 180 } as PracticeConfig)).concat([hormone(), hormone(true)]);
function fixture(config: PracticeConfig = hormone()) {
    const timing = new FakeTiming(), audio = { enter: vi.fn<(scope: StageAudio) => void>(), cancelStage: vi.fn(), cancelSession: vi.fn() };
    const engine = new DeterministicSessionEngine(timing, timing, audio);
    engine.start(createSnapshot(config));
    return { timing, audio, engine };
}
function advanceTo(f: ReturnType<typeof fixture>, phase: Phase, round = 1) {
    while (f.engine.getState().status === 'running' && (f.engine.getState().stage!.phase !== phase || f.engine.getState().stage!.round !== round))
        f.timing.advance(f.engine.getState().remainingMs);
    expect(f.engine.getState().stage?.phase).toBe(phase);
    expect(f.engine.getState().stage?.round).toBe(round);
}
describe('universal preparation', () => {
    it.each(presets)('$presetId receives exact 4/6/3 preparation before normal practice', config => {
        const f = fixture(config);
        expect(f.engine.getState().stage?.phase).toBe('prepare-inhale');
        expect(f.engine.getState().remainingMs).toBe(4000);
        expect(stageCues(f.audio.enter.mock.calls.at(-1)![0]).map(c => c.id)).toEqual(['voice.prepare', 'breath.in4']);
        f.timing.advance(4000);
        expect(f.engine.getState().stage?.phase).toBe('prepare-exhale');
        expect(stageCues(f.audio.enter.mock.calls.at(-1)![0]).map(c => c.id)).toEqual(['breath.out8']);
        f.timing.advance(6000);
        expect(f.engine.getState().stage?.phase).toBe('prepare-settle');
        expect(stageCues(f.audio.enter.mock.calls.at(-1)![0])).toEqual([]);
        f.timing.advance(2999);
        expect(f.engine.getState().stage?.phase).toBe('prepare-settle');
        f.timing.advance(1);
        expect(f.engine.getState().stage?.phase).toBe(config.kind === 'hormesis' ? 'round-announcement' : 'inhale');
    });
    it.each([180, 300, 600])('preserves %s seconds of selected breathing after preparation', seconds => {
        const f = fixture({ kind: 'patterned', presetId: '478', durationSeconds: seconds });
        f.timing.advance(13000 + seconds * 1000 - 1);
        expect(f.engine.getState().status).toBe('running');
        f.timing.advance(1);
        const result = f.engine.getState().result!;
        expect(result.plannedDurationSeconds).toBe(seconds);
        expect(result.actualDurationSeconds).toBe(seconds + 13);
        expect(result.stagesCompleted).toBe(f.engine.getState().snapshot!.stages.length);
    });
    it('Stop/restart during Prepare rejects obsolete work', () => { const f = fixture(); const old = f.audio.enter.mock.calls[0][0]; const callbacks = f.timing.jobs.map(j => j.callback); f.timing.advance(1200); f.engine.stop(); expect(f.audio.cancelSession).toHaveBeenCalledWith(old.sessionId); f.engine.start(createSnapshot(hormone())); callbacks.forEach(cb => cb()); expect(f.engine.getState().stage?.phase).toBe('prepare-inhale'); expect(f.engine.getState().elapsedMs).toBe(0); expect(f.engine.getState().sessionId).not.toBe(old.sessionId); });
});
describe('measured announcements and complete recovery', () => {
    it.each([false, true])('uses correct announcement/recovery/closing order; progressive=%s', progressive => {
        const f = fixture(hormone(progressive));
        f.timing.advance(13000);
        for (let round = 1; round <= 3; round++) {
            const announcement = f.audio.enter.mock.calls.at(-1)![0];
            expect(announcement.stage.phase).toBe('round-announcement');
            expect(announcement.stage.label).toBe(round === 3 ? 'Final round' : `Round ${round}`);
            expect(stageCues(announcement).map(c => c.id)).toEqual([roundVoiceIds[round - 1]]);
            expect(announcement.deadline - announcement.start).toBe(roundAnnouncementMs[round - 1]);
            expect(roundAnnouncementMs[round - 1] - voiceDurations[roundVoiceIds[round - 1]] * 1000).toBeGreaterThanOrEqual(400);
            f.timing.advance(roundAnnouncementMs[round - 1] - 1);
            expect(f.engine.getState().stage?.phase).toBe('round-announcement');
            f.timing.advance(1);
            expect(f.engine.getState().stage?.phase).toBe('inhale');
            advanceTo(f, 'retention', round);
            f.timing.advance((progressive && round > 1 ? 90 : 60) * 1000);
            expect(f.engine.getState().stage?.phase).toBe('recovery-inhale');
            expect(stageCues(f.audio.enter.mock.calls.at(-1)![0]).map(c => c.id)).toEqual(['voice.recoveryInhaleHold15', 'breath.in4']);
            f.timing.advance(4000);
            expect(f.engine.getState().stage?.phase).toBe('recovery-hold');
            expect(stageCues(f.audio.enter.mock.calls.at(-1)![0])).toEqual([]);
            f.timing.advance(15000);
            expect(f.engine.getState().stage?.phase).toBe('recovery-exhale');
            expect(stageCues(f.audio.enter.mock.calls.at(-1)![0]).map(c => c.id)).toEqual(['voice.recoveryExhale', 'breath.out8']);
            f.timing.advance(6000);
            expect(f.engine.getState().stage?.phase).toBe('round-settle');
            expect(stageCues(f.audio.enter.mock.calls.at(-1)![0])).toEqual([]);
            expect(f.engine.getState().roundsCompleted).toBe(round - 1);
            f.timing.advance(3000);
            expect(f.engine.getState().roundsCompleted).toBe(round);
        }
        expect(f.engine.getState().status).toBe('completed');
        expect(f.audio.enter.mock.calls.filter(([s]) => s.stage.phase === 'round-announcement')).toHaveLength(3);
        expect(f.engine.getState().result?.retentions?.map(r => r.durationSeconds)).toEqual(progressive ? [60, 90, 90] : [60, 60, 60]);
    });
    it.each([12300, 57500])('Release at %s ms records actual retention and enters identical shifted recovery', elapsed => {
        const f = fixture();
        advanceTo(f, 'retention');
        const hold = f.engine.getState();
        const stale = f.timing.jobs.map(j => j.callback);
        f.timing.advance(elapsed);
        const releasedAt = f.timing.now();
        f.engine.releaseRetention();
        stale.forEach(cb => cb());
        expect(f.engine.getState().stage?.phase).toBe('recovery-inhale');
        expect(f.engine.getState().deadline).toBe(releasedAt + 4000);
        expect(f.audio.cancelStage).toHaveBeenCalledWith(hold.stageId);
        f.timing.advance(4000 + 15000);
        expect(f.engine.getState().stage?.phase).toBe('recovery-exhale');
        f.timing.advance(6000 + 3000);
        expect(f.engine.getState().stage?.phase).toBe('round-announcement');
        expect(f.engine.getState().stage?.round).toBe(2);
        // Cross the original retention deadline; no duplicate recovery may be entered.
        if (f.timing.now() < hold.deadline!)
            f.timing.advance(hold.deadline! - f.timing.now() + 1);
        expect(f.engine.getState().stage?.round).toBe(2);
        f.engine.stop();
        expect(f.engine.getState().result?.retentions?.[0]).toMatchObject({ durationSeconds: elapsed / 1000, outcome: 'released' });
    });
    it('rejects a spoken-duration mismatch instead of accepting 10/20-second guided holds', () => { for (const recoveryHoldSeconds of [10, 20])
        expect(() => validateConfig({ ...hormone(), recoveryHoldSeconds } as PracticeConfig)).toThrow(); });
    it('new logical cues resolve to actual filenames and measured metadata', () => {
        for (const id of [...roundVoiceIds, 'voice.recoveryInhaleHold15', 'voice.recoveryExhale'] as const) {
            expect(resolveAsset(id)?.durationSeconds).toBe(voiceDurations[id]);
            expect(resolveAsset(id)?.localPath).toMatch(/\.mp3$/);
        }
        expect(resolveAsset('voice.prepare')?.localPath).toContain('Prepare');
        expect(resolveAsset('voice.in')?.localPath).toContain('breath-in.wav');
    });
    it('missing new audio cannot alter deterministic announcement/flow timing', () => { const timing = new FakeTiming(); const engine = new DeterministicSessionEngine(timing, timing, { enter() { throw new Error('missing'); }, cancelStage() { }, cancelSession() { } }); const snapshot = createSnapshot(hormone()); engine.start(snapshot); timing.jump(snapshot.plannedDurationSeconds * 1000); engine.reconcile(); expect(engine.getState().status).toBe('completed'); expect(engine.getState().result?.roundsCompleted).toBe(3); });
});
describe('visibility reconciliation of new phases', () => {
    it.each([
        [2500, 'prepare-inhale', 1500], [6500, 'prepare-exhale', 3500], [11500, 'prepare-settle', 1500],
        [13500, 'round-announcement', 2826], [17000, 'inhale', 1326],
        [183500, 'round-settle', 2826], [187000, 'round-announcement', 1372], [189500, 'inhale', 872],
    ] as const)('return at %s enters %s without replaying old cues', (at, phase, remaining) => {
        const f = fixture();
        f.engine.setVisible(false);
        f.timing.jump(at);
        f.engine.setVisible(true);
        expect(f.engine.getState().stage?.phase).toBe(phase);
        expect(f.engine.getState().remainingMs).toBe(remaining);
        const scope = f.audio.enter.mock.calls.at(-1)![0];
        expect(scope.resuming).toBe(true);
        expect(stageCues(scope).filter(c => c.at > f.timing.now())).toEqual([]);
    });
});
