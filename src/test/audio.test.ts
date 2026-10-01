import { describe, it, expect, vi } from 'vitest';
import { BrowserAudio } from '../audio/web-audio';
import { stageCues } from '../audio/cues';
import { resolveAsset, assetUrl } from '../audio/catalog';
import { defaultPreferences } from '../settings/preferences';
import { createSnapshot } from '../session/config';
import type { StageAudio } from '../session/audio-port';
import { FakeTiming } from './fake-time';
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function nativeFixture(fetcher: typeof fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response))) {
    const timing = new FakeTiming();
    const sources: any[] = [];
    const gains: any[] = [];
    const context = { state: 'running', currentTime: 100, destination: {}, resume: vi.fn(async () => { }), addEventListener: vi.fn(), decodeAudioData: vi.fn(async () => ({ duration: 8 })), createGain: () => { const g = { connect: vi.fn(), disconnect: vi.fn(), gain: { setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() } }; gains.push(g); return g; }, createBufferSource: () => { const s = { buffer: null, loop: true, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null }; sources.push(s); return s; } };
    const audio = new BrowserAudio(timing, defaultPreferences(), () => context as unknown as AudioContext, fetcher);
    return { timing, sources, gains, context, audio, fetcher };
}
function scope(phase: 'inhale' | 'exhale' | 'retention' = 'inhale', seconds = 4): StageAudio {
    const stage = createSnapshot({ kind: 'patterned', presetId: 'box', durationSeconds: 16 }).stages[0];
    return { sessionId: 'one', stageId: 'one/0', start: 0, deadline: seconds * 1000, stage: { ...stage, phase, durationMs: seconds * 1000 } };
}
describe('real audio mappings and deadlines', () => {
    it('uses approved exhale files and the longer inhale for six-second phases', () => { expect(stageCues(scope('exhale', 4)).map(c => c.id)).toContain('breath.out4'); expect(stageCues(scope('exhale', 6)).map(c => c.id)).toContain('breath.out8'); expect(stageCues(scope('inhale', 6)).map(c => c.id)).toContain('breath.in6'); expect(assetUrl(resolveAsset('breath.out8')!)).toContain('Exhale%208%20seconds.mp3'); expect(resolveAsset('missing')).toBeUndefined(); });
    it('maps countdown sources to absolute AudioContext time and never loops', async () => { const f = nativeFixture(); await f.audio.unlock(); f.audio.enter(scope('retention', 60)); await flush(); expect(f.sources.map(s => s.start.mock.calls[0][0]).sort((a, b) => a - b)).toEqual([100, 155, 156, 157, 158, 159]); expect(f.sources.every(s => s.loop === false)).toBe(true); f.audio.cancelSession('one'); expect(f.sources.every(s => s.stop.mock.calls.length === 2)).toBe(true); expect(f.audio.diagnostics().playing).toBe(0); });
    it('truncates and fades a breath at the engine deadline', async () => { const f = nativeFixture(); await f.audio.unlock(); f.audio.enter(scope('exhale', 6)); await flush(); expect(f.sources[1].start).toHaveBeenCalledWith(100, 0, 6); expect(f.sources[1].stop).toHaveBeenCalledWith(106); expect(f.gains[4].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 106); });
    it('preloads voice and breath once without downloading ambience', async () => { const f = nativeFixture(); await f.audio.unlock(); await flush(); await Promise.all([f.audio.load('voice.in'), f.audio.load('voice.in')]); expect(f.fetcher).toHaveBeenCalledTimes(15); expect(f.context.decodeAudioData).toHaveBeenCalledTimes(15); expect((f.fetcher as ReturnType<typeof vi.fn>).mock.calls.flat().join(' ')).not.toContain('ambience'); });
    it('discards a pending load after Stop and restart', async () => { const resolves: ((r: Response) => void)[] = []; const f = nativeFixture(vi.fn(() => new Promise<Response>(r => resolves.push(r)))); await f.audio.unlock(); f.audio.enter(scope()); f.audio.cancelSession('one'); f.audio.enter({ ...scope(), sessionId: 'two', stageId: 'two/0' }); resolves.forEach(r => r({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response)); await flush(); expect(f.sources).toHaveLength(2); f.audio.cancelSession('one'); expect(f.audio.diagnostics().playing).toBe(2); f.audio.cancelSession('two'); expect(f.audio.diagnostics().playing).toBe(0); });
    it('never replays overdue cues after a delayed download', async () => { const resolves: ((r: Response) => void)[] = []; const f = nativeFixture(vi.fn(() => new Promise<Response>(r => resolves.push(r)))); await f.audio.unlock(); f.audio.enter(scope()); f.timing.jump(1000); resolves.forEach(r => r({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response)); await flush(); expect(f.sources).toHaveLength(0); expect(f.audio.diagnostics().skipped).toBe(2); });
    it('reconciliation schedules only future countdowns', async () => { const f = nativeFixture(); await f.audio.unlock(); f.timing.jump(57000); f.audio.resynchronize(); f.audio.enter({ ...scope('retention', 60), resuming: true }); await flush(); expect(f.sources.map(s => s.start.mock.calls[0][0]).sort((a, b) => a - b)).toEqual([101, 102]); });
    it('missing audio and unavailable AudioContext fail safely', async () => { const f = nativeFixture(vi.fn(async () => { throw new Error('offline missing'); })); await f.audio.unlock(); await flush(); f.audio.enter(scope()); await flush(); expect(f.sources).toHaveLength(0); expect(f.audio.diagnostics().failures.length).toBeGreaterThan(0); const missing = new BrowserAudio(new FakeTiming(), defaultPreferences(), () => { throw new Error('unsupported'); }); await missing.unlock(); expect(missing.diagnostics().failures).toContain('Audio unavailable'); });
    it('updates three independent gain buses while playing', async () => { const f = nativeFixture(); await f.audio.unlock(); const p = defaultPreferences(); p.volumes = { ...p.volumes, master: 0.4, voice: 0.2, breath: 0 }; f.audio.setPreferences(p); expect(f.gains[0].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.4, 100, 0.015); expect(f.gains[1].gain.setTargetAtTime).toHaveBeenLastCalledWith(0.2, 100, 0.015); expect(f.gains[2].gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 100, 0.015); });
});
