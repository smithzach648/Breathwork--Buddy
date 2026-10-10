import { createRoot } from 'react-dom/client';
import { App } from '../../src/app/App';
import { PracticeRuntime } from '../../src/session/runtime';
import { BrowserAudio } from '../../src/audio/web-audio';
import { BackgroundController } from '../../src/media/background';
import { NoiseController } from '../../src/audio/noise';
import { BinauralController } from '../../src/audio/binaural';
import { database } from '../../src/storage/database';
import { defaultPreferences } from '../../src/settings/preferences';
import { WakeLockController } from '../../src/session/wake-lock';
import { FakeTiming } from '../../src/test/fake-time';
import '../../src/styles/global.css';

// Optional QA entry only. Never shipped by the application build or service worker.
const timing = new FakeTiming();
const events: { id?: string; phase?: string; stopped: boolean }[] = [];
const buffers = new WeakMap<AudioBuffer, string>();
let runtime: PracticeRuntime;
const audio = new BrowserAudio(timing, defaultPreferences(), () => {
    const context = new AudioContext(), create = context.createBufferSource.bind(context);
    context.createBufferSource = () => {
        const source = create(), start = source.start.bind(source), stop = source.stop.bind(source);
        let event: typeof events[number];
        source.start = (when = 0, offset = 0, duration?: number) => {
            event = { id: buffers.get(source.buffer!), phase: runtime.engine.getState().stage?.phase, stopped: false }; events.push(event);
            duration === undefined ? start(when, offset) : start(when, offset, duration);
        };
        source.stop = when => { if (event) event.stopped = true; when === undefined ? stop() : stop(when); };
        return source;
    };
    return context;
});
const load = audio.load.bind(audio);
audio.load = async id => { const buffer = await load(id); if (buffer) buffers.set(buffer, id); return buffer; };
const background = new BackgroundController(undefined, undefined, () => audio.environmentPort());
const noise = new NoiseController(() => audio.environmentPort());
const binaural = new BinauralController(() => audio.environmentPort(), timing);
runtime = new PracticeRuntime(timing, timing, audio, new WakeLockController(undefined, () => true), undefined, background, noise, binaural);
Object.assign(window, { routineQA: { runtime, timing, database, noise, binaural, events,
    advance(ms: number) {
        timing.advance(ms); audio.resynchronize();
        const state = runtime.engine.getState();
        if (state.status === 'running') {
            audio.cancelStage(state.stageId!);
            audio.enter({ sessionId: state.sessionId!, stageId: state.stageId!, stage: state.stage!, start: state.stageStart!, deadline: state.deadline! });
        }
    },
} });
createRoot(document.getElementById('root')!).render(<App runtime={runtime}/>);
