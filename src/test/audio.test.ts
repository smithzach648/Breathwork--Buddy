import { describe, it, expect, vi } from 'vitest';
import { BrowserAudio } from '../audio/web-audio';
import { stageCues } from '../audio/cues';
import { resolveAsset, assetUrl } from '../audio/catalog';
import { defaultPreferences } from '../settings/preferences';
import { createSnapshot } from '../session/config';
import type { StageAudio } from '../session/audio-port';
import { FakeTiming } from './fake-time';
import type { Phase } from '../session/config';
import { voiceDurations } from '../audio/voice-metadata';
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function nativeFixture(fetcher: typeof fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response))) {
    const timing = new FakeTiming();
    const sources: any[] = [];
    const gains: any[] = [];
    const context = { state: 'running', currentTime: 100, destination: {}, resume: vi.fn(async () => { }), addEventListener: vi.fn(), decodeAudioData: vi.fn(async () => ({ duration: 8 })), createGain: () => { const g = { connect: vi.fn(), disconnect: vi.fn(), gain: { setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() } }; gains.push(g); return g; }, createBufferSource: () => { const s = { buffer: null, loop: true, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null }; sources.push(s); return s; } };
    const audio = new BrowserAudio(timing, defaultPreferences(), () => context as unknown as AudioContext, fetcher);
    return { timing, sources, gains, context, audio, fetcher };
}
function scope(phase: Phase = 'inhale', seconds = 4): StageAudio {
    const stage = createSnapshot({ kind: 'patterned', presetId: 'box', durationSeconds: 16 }).stages[0];
    return { sessionId: 'one', stageId: 'one/0', start: 0, deadline: seconds * 1000, stage: { ...stage, phase, round: 1, durationMs: seconds * 1000 } };
}
describe('real audio mappings and deadlines', () => {
    it('first AudioContext statechange must not swallow the Prepare entry cues', async () => {
        const f = nativeFixture();let resume!:()=>void;
        f.context.resume.mockImplementation(()=>new Promise<void>(resolve=>{resume=()=>{const callback=f.context.addEventListener.mock.calls[0][1] as ()=>void;callback();resolve();};}));
        const unlocking=f.audio.unlock();f.audio.enter(scope('prepare-inhale'));resume();await unlocking;await flush();
        expect(f.sources).toHaveLength(2);expect(f.audio.diagnostics().scheduled).toBe(2);
    });
    it('a statechange delivered after unlock preserves the same fresh entry timeline', async()=>{
        const f=nativeFixture();await f.audio.unlock();f.audio.enter(scope('prepare-inhale'));await flush();
        const callback=f.context.addEventListener.mock.calls[0][1] as ()=>void;callback();await flush();
        expect(f.audio.diagnostics().playing).toBe(2);expect(f.sources).toHaveLength(4);
        expect(f.sources[2].start).toHaveBeenCalledWith(100,0,4);
    });
    it('allows the recovery instruction to finish only into the adjacent quiet hold', async () => {
        const f = nativeFixture();
        await f.audio.unlock();
        f.audio.enter(scope('recovery-inhale'));
        await flush();
        const instruction = f.sources[0], breath = f.sources[1];
        expect(instruction.start).toHaveBeenCalledWith(100, 0, voiceDurations['voice.recoveryInhaleHold15']);
        f.timing.jump(4000);
        f.context.currentTime = 104;
        f.audio.cancelStage('one/0');
        f.audio.enter({ ...scope('recovery-hold', 15), stageId: 'one/1', start: 4000, deadline: 19000 });
        await flush();
        expect(instruction.stop).toHaveBeenCalledTimes(1);
        expect(breath.stop).toHaveBeenCalledTimes(2);
        expect(f.sources).toHaveLength(2);
        f.audio.cancelSession('one');
        expect(instruction.stop).toHaveBeenCalledTimes(2);
        expect(f.audio.diagnostics().playing).toBe(0);
    });
    it('cancels a carried instruction when reconciliation skips its intended hold', async () => {
        const f = nativeFixture();
        await f.audio.unlock();
        f.audio.enter(scope('recovery-inhale'));
        await flush();
        const instruction = f.sources[0];
        f.audio.cancelStage('one/0');
        f.timing.jump(20000);
        f.context.currentTime = 120;
        f.audio.enter({ ...scope('recovery-exhale', 6), stageId: 'one/2', start: 19000, deadline: 25000 });
        await flush();
        expect(instruction.stop).toHaveBeenCalledTimes(2);
    });
    it.each(['prepare-inhale', 'round-announcement', 'recovery-inhale', 'recovery-exhale'] as const)('late %s loads cannot survive stop and attach to a new session', async (phase) => {
        const resolves: ((r: Response) => void)[] = [];
        const f = nativeFixture(vi.fn(() => new Promise<Response>(r => resolves.push(r))));
        await f.audio.unlock();
        f.audio.enter(scope(phase));
        f.audio.cancelSession('one');
        f.audio.enter({ ...scope('prepare-settle', 3), sessionId: 'two', stageId: 'two/0' });
        resolves.forEach(r => r({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response));
        await flush();
        expect(f.sources).toHaveLength(0);
    });
    it('uses approved exhale files and the longer inhale for six-second phases', () => { expect(stageCues(scope('exhale', 4)).map(c => c.id)).toContain('breath.out4'); expect(stageCues(scope('exhale', 6)).map(c => c.id)).toContain('breath.out8'); expect(stageCues(scope('inhale', 6)).map(c => c.id)).toContain('breath.in6'); expect(assetUrl(resolveAsset('breath.out8')!)).toContain('Exhale%208%20seconds.wav'); expect(resolveAsset('missing')).toBeUndefined(); });
    it('maps countdown sources to absolute AudioContext time and never loops', async () => { const f = nativeFixture(); await f.audio.unlock(); f.audio.enter(scope('retention', 60)); await flush(); expect(f.sources.map(s => s.start.mock.calls[0][0]).sort((a, b) => a - b)).toEqual([100, 155, 156, 157, 158, 159]); expect(f.sources.every(s => s.loop === false)).toBe(true); f.audio.cancelSession('one'); expect(f.sources.every(s => s.stop.mock.calls.length === 2)).toBe(true); expect(f.audio.diagnostics().playing).toBe(0); });
    it('truncates and fades a breath at the engine deadline', async () => { const f = nativeFixture(); await f.audio.unlock(); f.audio.enter(scope('exhale', 6)); await flush(); expect(f.sources[1].start).toHaveBeenCalledWith(100, 0, 6); expect(f.sources[1].stop).toHaveBeenCalledWith(106); expect(f.gains[4].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 106); });
    it('preloads voice and breath once without downloading ambience', async () => { const f = nativeFixture(); await f.audio.unlock(); await flush(); await Promise.all([f.audio.load('voice.in'), f.audio.load('voice.in')]); expect(f.fetcher).toHaveBeenCalledTimes(21); expect(f.context.decodeAudioData).toHaveBeenCalledTimes(21); expect((f.fetcher as ReturnType<typeof vi.fn>).mock.calls.flat().join(' ')).not.toContain('ambience'); });
    it('discards a pending load after Stop and restart', async () => { const resolves: ((r: Response) => void)[] = []; const f = nativeFixture(vi.fn(() => new Promise<Response>(r => resolves.push(r)))); await f.audio.unlock(); f.audio.enter(scope()); f.audio.cancelSession('one'); f.audio.enter({ ...scope(), sessionId: 'two', stageId: 'two/0' }); resolves.forEach(r => r({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response)); await flush(); expect(f.sources).toHaveLength(2); f.audio.cancelSession('one'); expect(f.audio.diagnostics().playing).toBe(2); f.audio.cancelSession('two'); expect(f.audio.diagnostics().playing).toBe(0); });
    it('never replays overdue cues after a delayed download', async () => { const resolves: ((r: Response) => void)[] = []; const f = nativeFixture(vi.fn(() => new Promise<Response>(r => resolves.push(r)))); await f.audio.unlock(); f.audio.enter(scope()); f.timing.jump(1000); resolves.forEach(r => r({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response)); await flush(); expect(f.sources).toHaveLength(0); expect(f.audio.diagnostics().skipped).toBe(2); });
    it('reconciliation schedules only future countdowns', async () => { const f = nativeFixture(); await f.audio.unlock(); f.timing.jump(57000); f.audio.resynchronize(); f.audio.enter({ ...scope('retention', 60), resuming: true }); await flush(); expect(f.sources.map(s => s.start.mock.calls[0][0]).sort((a, b) => a - b)).toEqual([101, 102]); });
    it('missing audio and unavailable AudioContext fail safely', async () => { const f = nativeFixture(vi.fn(async () => { throw new Error('offline missing'); })); await f.audio.unlock(); await flush(); f.audio.enter(scope()); await flush(); expect(f.sources).toHaveLength(0); expect(f.audio.diagnostics().failures.length).toBeGreaterThan(0); const missing = new BrowserAudio(new FakeTiming(), defaultPreferences(), () => { throw new Error('unsupported'); }); await missing.unlock(); expect(missing.diagnostics().failures).toContain('Audio unavailable'); });
    it('updates three independent gain buses while playing', async () => { const f = nativeFixture(); await f.audio.unlock(); const p = defaultPreferences(); p.volumes = { ...p.volumes, master: 0.4, voice: 0.2, breath: 0 }; f.audio.setPreferences(p); expect(f.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.4, 100, 0.015); expect(f.gains[1].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.2, 100, 0.015); expect(f.gains[2].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 100, 0.015); });
});
