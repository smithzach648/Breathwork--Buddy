import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { Blob as NativeBlob, File as NativeFile } from 'node:buffer';
import Dexie from 'dexie';
import { createSnapshot, type PracticeConfig } from '../session/config';
import { DeterministicSessionEngine, type SessionState } from '../session/engine';
import { FakeTiming } from './fake-time';
import { stageCues } from '../audio/cues';
import { cueEnabled, guidanceCategory } from '../audio/guidance';
import { defaultPreferences, normalizePreferences } from '../settings/preferences';
import { BuddyDatabase } from '../storage/database';
import { MediaLibrary, mediaError, probeAudio } from '../media/library';
import { BackgroundController } from '../media/background';
import { BrowserAudio } from '../audio/web-audio';
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const hormone = (progressive = false, intervalSeconds: 2 | 3 = 2): PracticeConfig => ({ kind: 'hormesis', presetId: progressive ? 'hormesis-progressive' : 'hormesis-60', intervalSeconds, cycles: 20, retentions: progressive ? [60, 90, 90] : [60, 60, 60], recoveryHoldSeconds: 15 });

describe('Full Exhale is engine truth', () => {
    it.each([[false, 2], [true, 2], [false, 3], [true, 3]] as const)('replaces final exhale in every round: progressive=%s cadence=%s', (progressive, cadence) => {
        const snapshot = createSnapshot(hormone(progressive, cadence));
        const timing = new FakeTiming(), audio = { enter: vi.fn(), cancelStage: vi.fn(), cancelSession: vi.fn() };
        const engine = new DeterministicSessionEngine(timing, timing, audio); engine.start(snapshot);
        for (let round = 1; round <= 3; round++) {
            const stages = snapshot.stages.filter(stage => stage.round === round);
            expect(stages.filter(stage => stage.phase === 'inhale')).toHaveLength(20);
            expect(stages.filter(stage => stage.phase === 'exhale')).toHaveLength(19);
            expect(stages.filter(stage => stage.phase === 'pre-retention-exhale')).toHaveLength(1);
            while (engine.getState().stage?.phase !== 'pre-retention-exhale') timing.advance(engine.getState().remainingMs);
            const state = engine.getState(), stale = timing.jobs.map(job => job.callback);
            expect(state.stage?.cycle).toBe(20); expect(state.remainingMs).toBe(4000);
            expect(stageCues(audio.enter.mock.calls.at(-1)![0]).map(cue => cue.id)).toEqual(['voice.fullExhale', 'breath.out4']);
            timing.advance(3999); stale.forEach(callback => callback());
            expect(engine.getState().stage?.phase).toBe('pre-retention-exhale'); expect(engine.getState().releaseAvailable).toBe(false);
            timing.advance(1); expect(engine.getState().stage?.phase).toBe('retention'); expect(engine.getState().stageStart).toBe(state.deadline);
            timing.advance((progressive && round > 1 ? 90 : 60) * 1000 + 28000);
        }
        expect(engine.getState().status).toBe('completed'); expect(engine.getState().result?.roundsCompleted).toBe(3);
    });
    it.each([[true, true], [false, true], [true, false], [false, false]] as const)('Full Exhale matrix breath=%s spoken=%s never changes deadlines', (breath, spoken) => {
        const preferences = defaultPreferences(); preferences.guidance.breathSounds = breath; preferences.guidance.spokenBreath = spoken;
        const snapshot = createSnapshot(hormone()), stage = snapshot.stages.find(s => s.phase === 'pre-retention-exhale')!;
        const cues = stageCues({ stage, sessionId: 's', stageId: 'x', start: 0, deadline: 4000 });
        expect(cues.filter(cue => cueEnabled(cue.id, preferences)).map(cue => cue.id)).toEqual([...(spoken ? ['voice.fullExhale'] : []), ...(breath ? ['breath.out4'] : [])]);
        expect(stage.durationMs).toBe(4000);
    });
    it('all-silent Release and completion retain deadlines/results', () => {
        const timing = new FakeTiming(), preferences = defaultPreferences(); preferences.guidance = { breathSounds: false, spokenBreath: false, generalVoice: false, ducking: true };
        const audible: string[] = [];
        const engine = new DeterministicSessionEngine(timing, timing, { enter(scope) { audible.push(...stageCues(scope).filter(cue => cueEnabled(cue.id, preferences)).map(cue => cue.id)); }, cancelStage() {}, cancelSession() {} });
        engine.start(createSnapshot(hormone())); while (engine.getState().stage?.phase !== 'retention') timing.advance(engine.getState().remainingMs);
        timing.advance(12000); engine.releaseRetention(); expect(engine.getState().remainingMs).toBe(4000);
        timing.advance(1000000); expect(engine.getState().status).toBe('completed'); expect(engine.getState().result?.retentions?.[0].durationSeconds).toBe(12); expect(audible).toEqual([]);
    });
});

describe('central guidance categorization', () => {
    it('maps every cue to its independent control', () => {
        const ids = [...new Set(createSnapshot(hormone(true)).stages.flatMap(stage => stageCues({ stage, sessionId: 's', stageId: 'x', start: 0, deadline: stage.durationMs }).map(cue => cue.id)))];
        for (const key of ['breathSounds', 'spokenBreath', 'generalVoice'] as const) {
            const p = defaultPreferences(); p.guidance[key] = false;
            const category = key === 'breathSounds' ? 'breath-sound' : key === 'spokenBreath' ? 'spoken-breath' : 'general-voice';
            for (const id of ids) expect(cueEnabled(id, p)).toBe(guidanceCategory(id) !== category);
        }
    });
    it('turning OFF a category cancels its active and pending clips, without replay on ON', async () => {
        const sources: { stop: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> }[] = [];
        const context = { state: 'running', currentTime: 0, destination: {}, resume: async () => {}, addEventListener() {}, decodeAudioData: async () => ({ duration: 8 }), createGain: () => ({ connect() {}, disconnect() {}, gain: { setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} } }), createBufferSource: () => { const source = { connect() {}, disconnect() {}, stop: vi.fn(), start: vi.fn(), onended: null }; sources.push(source); return source; } };
        const timing = new FakeTiming(), p = defaultPreferences();
        const audio = new BrowserAudio(timing, p, () => context as unknown as AudioContext, vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response)));
        await audio.unlock(); await flush();
        const stage = createSnapshot(hormone()).stages.find(s => s.phase === 'pre-retention-exhale')!;
        audio.enter({ stage, sessionId: 's', stageId: 'x', start: 0, deadline: 4000 }); await flush();
        expect(audio.diagnostics().playing).toBe(2); p.guidance.spokenBreath = false; audio.setPreferences(p);
        expect(audio.diagnostics().playing).toBe(1); expect(sources[0].stop).toHaveBeenCalledTimes(2);
        p.guidance.spokenBreath = true; audio.setPreferences(p); expect(sources).toHaveLength(2);
        p.guidance.breathSounds = false; audio.setPreferences(p); expect(audio.diagnostics().playing).toBe(0);
    });
});

describe('private persistent media', () => {
    // fake-indexeddb uses Node structuredClone; use its native Blob/File implementation.
    beforeEach(() => { vi.stubGlobal('Blob', NativeBlob); vi.stubGlobal('File', NativeFile); });
    it('validates, stores metadata and Blob, reopens, and deletes without object URLs in storage', async () => {
        const name = `media-${crypto.randomUUID()}`, db = new BuddyDatabase(name), probe = vi.fn(async () => 2.5), lib = new MediaLibrary(db, probe);
        const file = new File([new Uint8Array([1, 2, 3])], 'my-audio.wav', { type: 'audio/wav' });
        const record = await lib.import(file); expect(probe).toHaveBeenCalledWith(file);
        expect(record).toMatchObject({ displayName: 'my-audio', originalFilename: 'my-audio.wav', mimeType: 'audio/wav', byteSize: 3, durationSeconds: 2.5 });
        db.close(); const reopened = new BuddyDatabase(name); const saved = await reopened.media.get(record.id); expect(saved?.blob.size).toBe(3); expect(saved?.id.startsWith('local:')).toBe(true);
        await reopened.media.delete(record.id); expect(await reopened.media.count()).toBe(0); await reopened.delete();
    });
    it('unsupported media never writes a partial record', async () => {
        const db = new BuddyDatabase(`unsupported-${crypto.randomUUID()}`), lib = new MediaLibrary(db, async () => { throw new Error('Unsupported audio'); });
        await expect(lib.import(new File(['a'], 'bad.mp3'))).rejects.toThrow('Unsupported'); expect(await db.media.count()).toBe(0); await db.delete();
    });
    it('quota failure keeps existing audio and gives a clear message', async () => {
        const db = new BuddyDatabase(`quota-${crypto.randomUUID()}`), lib = new MediaLibrary(db, async () => 1);
        await lib.import(new File(['a'], 'first.wav')); const error = new DOMException('Quota reached', 'QuotaExceededError');
        const spy = vi.spyOn(db.media, 'add').mockRejectedValueOnce(error); await expect(lib.import(new File(['b'], 'second.wav'))).rejects.toThrow(); spy.mockRestore();
        expect(await db.media.count()).toBe(1); expect(mediaError(error)).toMatch(/storage is full/); await db.delete();
    });
    it('upgrades actual version-2 settings/history without resetting existing values', async () => {
        const name = `migration-${crypto.randomUUID()}`, old = new Dexie(name);
        old.version(2).stores({ preferences: 'id', routines: 'id,updatedAt', journal: 'id,createdAt,sessionId', history: 'id,startedAt,routineId,outcome', migrations: 'id' });
        const p = defaultPreferences(); p.theme = 'dark'; p.volumes.voice = 0.23;
        const legacy = { id: p.id, theme: p.theme, volumes: p.volumes };
        await old.table('preferences').put(legacy); await old.table('history').put({ id: 'old', startedAt: '2026-10-01', outcome: 'completed' }); old.close();
        const upgraded = new BuddyDatabase(name); await upgraded.open(); expect(upgraded.verno).toBe(3);
        expect(await upgraded.preferences.get('preferences')).toEqual(normalizePreferences(legacy)); expect(await upgraded.history.get('old')).toMatchObject({ id: 'old', outcome: 'completed' });
        expect(await upgraded.media.count()).toBe(0); await upgraded.delete();
    });
    it('built-in offline copies are explicit Blobs; failed replacement preserves the copy', async () => {
        const db = new BuddyDatabase(`offline-${crypto.randomUUID()}`), fetcher = vi.fn(async () => ({ ok: true, blob: async () => new Blob(['sample'], { type: 'audio/mpeg' }) } as Response));
        const lib = new MediaLibrary(db, async () => 600, fetcher);
        await lib.download('ambience.floating'); expect((await lib.get('offline:ambience.floating'))?.blob.size).toBe(6);
        fetcher.mockRejectedValueOnce(new Error('offline')); await expect(lib.download('ambience.floating')).rejects.toThrow(); expect((await lib.list())).toHaveLength(1);
        await lib.remove('offline:ambience.floating'); expect(await db.media.count()).toBe(0); await db.delete();
    });
    it('probe confirms native playability and revokes its temporary URL on success and error', async () => {
        const elements: any[] = [], revoked = vi.fn();
        vi.stubGlobal('Audio', class { duration = 1.5; oncanplay: any; onerror: any; preload = ''; src = ''; constructor() { elements.push(this); } removeAttribute() {} load() {} });
        vi.stubGlobal('URL', { createObjectURL: () => 'blob:probe', revokeObjectURL: revoked });
        try { const good = probeAudio(new Blob(['a'])); elements[0].oncanplay(); expect(await good).toBe(1.5); const bad = probeAudio(new Blob(['bad'])); elements[1].onerror(); await expect(bad).rejects.toThrow('cannot play'); expect(revoked).toHaveBeenCalledTimes(2); } finally { vi.unstubAllGlobals(); }
    });
});

function mediaFixture(mode: 'off' | 'entire' | 'retention' | 'after' = 'entire') {
    vi.useFakeTimers();
    const listeners = new Map<string, () => void>();
    const audio = { paused: true, ended: false, volume: 0, currentTime: 0, duration: 600, loop: false, preload: '', src: '', addEventListener: (name: string, callback: () => void) => listeners.set(name, callback), play: vi.fn(async () => { audio.paused = false; }), pause: vi.fn(() => { audio.paused = true; }), load: vi.fn(), removeAttribute: vi.fn() };
    const revoke = vi.fn(); vi.stubGlobal('URL', { revokeObjectURL: revoke });
    const resolve = vi.fn(async (id: string) => ({ url: `blob:${id}`, owned: true, name: id }));
    const controller = new BackgroundController({ resolve }, () => audio as unknown as HTMLAudioElement);
    const preferences = defaultPreferences(); preferences.background = { source: 'ambience.floating', mode, loop: false }; controller.setPreferences(preferences);
    const snapshot = createSnapshot(hormone());
    const session = (phase: string, status: SessionState['status'] = 'running', id = 's'): SessionState => ({ status, sessionId: id, snapshot, stage: snapshot.stages.find(s => s.phase === phase), remainingMs: 0, elapsedMs: 0, roundsCompleted: 0, stagesCompleted: 0, releaseAvailable: phase === 'retention' });
    return { controller, audio, preferences, resolve, revoke, listeners, session };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('one long-media player', () => {
    it('entire practice starts once, keeps stages continuous, and stops on cancellation/restart', async () => {
        const f = mediaFixture(); await flush(); expect(f.audio.play).not.toHaveBeenCalled();
        f.controller.sync(f.session('prepare-inhale')); await flush(); f.controller.sync(f.session('inhale')); f.controller.sync(f.session('retention')); await flush(); expect(f.audio.play).toHaveBeenCalledTimes(1);
        f.controller.sync(f.session('', 'cancelled')); expect(f.audio.paused).toBe(true); expect(f.audio.currentTime).toBe(0);
        f.controller.sync(f.session('prepare-inhale', 'running', 'new')); await flush(); expect(f.audio.play).toHaveBeenCalledTimes(2); f.controller.dispose(); expect(f.revoke).toHaveBeenCalledTimes(1);
    });
    it('retention only preserves position, fades on Release/recovery, resumes next round, and ends cleanly', async () => {
        const f = mediaFixture('retention'); await flush(); f.controller.sync(f.session('inhale')); expect(f.audio.play).not.toHaveBeenCalled();
        f.controller.sync(f.session('retention')); await flush(); await vi.advanceTimersByTimeAsync(750); f.audio.currentTime = 12;
        f.controller.sync(f.session('recovery-inhale')); await vi.advanceTimersByTimeAsync(750); expect(f.audio.paused).toBe(true); expect(f.audio.currentTime).toBe(12);
        f.controller.sync(f.session('round-announcement')); f.controller.sync(f.session('retention')); await flush(); expect(f.audio.currentTime).toBe(12); expect(f.audio.play).toHaveBeenCalledTimes(2);
        f.controller.sync(f.session('', 'completed')); await vi.advanceTimersByTimeAsync(750); expect(f.audio.paused).toBe(true); f.controller.dispose();
    });
    it('retention mode is inactive for patterned practice', async () => {
        const f = mediaFixture('retention'); await flush(); const state = f.session('retention'); f.controller.sync({ ...state, snapshot: createSnapshot({ kind: 'patterned', presetId: 'box', durationSeconds: 180 }) }); expect(f.audio.play).not.toHaveBeenCalled(); f.controller.dispose();
    });
    it('manual Play respects Off and retention-only restrictions during practice', async () => {
        const f = mediaFixture('off'); await flush(); f.controller.sync(f.session('inhale')); f.controller.play(); expect(f.audio.play).not.toHaveBeenCalled();
        f.preferences.background.mode = 'retention'; f.controller.setPreferences(f.preferences); f.controller.play(); expect(f.audio.play).not.toHaveBeenCalled();
        f.controller.sync(f.session('retention')); await flush(); expect(f.audio.play).toHaveBeenCalledTimes(1); f.controller.dispose();
    });
    it('after practice starts only on normal completion and has manual Stop', async () => {
        const f = mediaFixture('after'); await flush(); f.controller.sync(f.session('prepare-inhale')); expect(f.audio.play).not.toHaveBeenCalled(); f.controller.sync(f.session('', 'cancelled')); expect(f.audio.play).not.toHaveBeenCalled();
        f.controller.sync(f.session('prepare-inhale', 'running', 'next')); f.controller.sync(f.session('', 'completed', 'next')); await flush(); expect(f.audio.play).toHaveBeenCalledTimes(1); f.controller.stop(); expect(f.audio.paused).toBe(true); f.controller.dispose();
    });
    it('a non-looping natural end does not restart at later stages', async () => {
        const f = mediaFixture(); await flush(); f.controller.sync(f.session('inhale')); await flush(); f.audio.ended = true; f.listeners.get('ended')!(); f.controller.sync(f.session('retention')); expect(f.audio.play).toHaveBeenCalledTimes(1); f.controller.dispose();
    });
    it('source changes reject/revoke stale resolutions and deletion stops the active source', async () => {
        const f = mediaFixture(); await flush(); let resolve!: (value: { url: string; owned: boolean; name: string }) => void;
        f.resolve.mockImplementationOnce(() => new Promise(r => { resolve = r; })); const stale = f.controller.select('local:old'); const current = f.controller.select('local:new'); await current;
        resolve({ url: 'blob:old', owned: true, name: 'old' }); await stale; expect(f.audio.src).toBe('blob:local:new'); expect(f.revoke).toHaveBeenCalledWith('blob:old');
        f.controller.play(); await flush(); f.controller.removeSource('local:new'); expect(f.audio.paused).toBe(true); expect(f.revoke).toHaveBeenCalledWith('blob:local:new'); f.controller.dispose();
    });
    it('Stop rejects a pending preview and cannot restart media after resolution', async () => {
        const f = mediaFixture(); await flush(); let resolve!: (value: { url: string; owned: boolean; name: string }) => void; f.resolve.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
        f.controller.preview('local:late'); f.controller.stop(); resolve({ url: 'blob:late', owned: true, name: 'late' }); await flush(); expect(f.audio.play).not.toHaveBeenCalled(); expect(f.revoke).toHaveBeenCalledWith('blob:late'); f.controller.dispose();
    });
    it('visibility suspends immediately, preserves position, and resumes only the current mode', async () => {
        const f = mediaFixture('retention'); await flush(); f.controller.sync(f.session('retention')); await flush(); f.audio.currentTime = 8; f.controller.visibilityChanged(false); expect(f.audio.paused).toBe(true);
        f.controller.sync(f.session('recovery-inhale')); f.controller.visibilityChanged(true); expect(f.audio.paused).toBe(true); expect(f.audio.currentTime).toBe(8); f.controller.dispose();
    });
    it('ducks by about 8 dB, restores smoothly, and clears at Stop', async () => {
        const f = mediaFixture(); await flush(); f.controller.sync(f.session('inhale')); await flush(); await vi.advanceTimersByTimeAsync(750); expect(f.audio.volume).toBeCloseTo(0.32);
        f.controller.setDucking(true); await vi.advanceTimersByTimeAsync(275); expect(f.audio.volume).toBeCloseTo(0.128);
        f.controller.setDucking(true); f.controller.setDucking(false); f.controller.setDucking(true); await vi.advanceTimersByTimeAsync(275); expect(f.audio.volume).toBeCloseTo(0.128);
        f.preferences.guidance.ducking = false; f.controller.setPreferences(f.preferences); await vi.advanceTimersByTimeAsync(750); expect(f.audio.volume).toBeCloseTo(0.32);
        f.controller.stop(); expect(f.audio.volume).toBe(0); f.controller.dispose();
    });
    it('a queued native error from a removed source cannot overwrite a new source status', async () => {
        const f = mediaFixture(); await flush(); f.controller.removeSource('ambience.floating'); f.listeners.get('error')!(); expect(f.controller.getState().error).toBe(''); f.controller.dispose();
    });
});
