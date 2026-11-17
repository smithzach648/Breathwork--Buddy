import {templateRoutine,ROUTINE_TEMPLATES} from '../../src/routines/templates';
import {hormesisConfig} from '../../src/session/hormesis';
import {withMeditation} from '../../src/session/practice-followup';
import {cyclePattern,createSnapshot} from '../../src/session/config';
import {developedRecipe,resolveEnvironment} from '../../src/meditation/environment';
import {acousticSelection,acousticProgram} from '../../src/meditation/acoustic-scenes';
import {PRACTICE_NARRATION} from '../../src/audio/practice-narration';
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
import '../../src/styles/breathward.css';
import {createToneGraph,toneRecipe,scheduleToneEnvelope,toneAmplitude} from '../../src/audio/binaural';
import {generateMaskingBuffer,fftSteps} from '../../src/audio/noise-spectrum';
import {createOutput} from '../../src/audio/output';
import {createJourneyConfig as createFullJourneyConfig,createRefinedJourneyConfig,createLegacyJourneyConfig as createJourneyConfig,layerMix,timeline} from '../../src/meditation-suite/model';
import {APPROVED_NARRATION} from '../../src/meditation-suite/voice-assets';
import {FULL_CLIPS} from '../../src/meditation-suite/full-narration-content';
import {scheduleSoftNote} from '../../src/meditation-suite/instrument';
import {journeyNotes,softNoteHz,noteHz} from '../../src/meditation-suite/tones';
import {presetMix,changeMix} from '../../src/meditation-suite/mix';
import {SCRIPT_CLIPS,LEARN_CLIPS,REFRESH_SCRIPT,AUDITION_SCRIPT} from '../../src/meditation-suite/narration-content';
import {narrationPlan} from '../../src/meditation-suite/voice-narration';
import {JourneyAudio} from '../../src/meditation-suite/audio';
import {JourneySynth} from '../../src/audio/acoustic/journey';
import {warm,encodeWav} from '../../src/audio/acoustic/dsp';

// Optional QA entry only. Never shipped by the application build or service worker.
const timing = new FakeTiming();
const events: { id?: string; phase?: string; stopped: boolean; when?:number; duration?:number }[] = [];
const buffers = new WeakMap<AudioBuffer, string>();
let runtime: PracticeRuntime;
const audio = new BrowserAudio(timing, defaultPreferences(), () => {
    const context = new AudioContext(), create = context.createBufferSource.bind(context);
    context.createBufferSource = () => {
        const source = create(), start = source.start.bind(source), stop = source.stop.bind(source);
        let event: typeof events[number];
        source.start = (when = 0, offset = 0, duration?: number) => {
            event = { id: buffers.get(source.buffer!), phase: runtime.engine.getState().stage?.phase, stopped: false, when, duration:source.buffer?.duration }; events.push(event);
            duration === undefined ? start(when, offset) : start(when, offset, duration);
        };
        source.stop = when => { if (event) event.stopped = true; when === undefined ? stop() : stop(when); };
        return source;
    };
    return context;
});
const load = audio.load.bind(audio);
audio.load = async (id,sha) => { const buffer = await load(id,sha); if (buffer) buffers.set(buffer, id); return buffer; };
const background = new BackgroundController(undefined, undefined, () => audio.environmentPort());
const noise = new NoiseController(() => audio.environmentPort());
const binaural = new BinauralController(() => audio.environmentPort(), timing);
runtime = new PracticeRuntime(timing, timing, audio, new WakeLockController(undefined, () => true), undefined, background, noise, binaural);
Object.assign(window, { suiteQA:{templateRoutine,ROUTINE_TEMPLATES,hormesisConfig,withMeditation,cyclePattern,createSnapshot,developedRecipe,resolveEnvironment,acousticSelection,acousticProgram,PRACTICE_NARRATION,createFullJourneyConfig,APPROVED_NARRATION,FULL_CLIPS,timeline,createJourneyConfig,createRefinedJourneyConfig,layerMix,JourneySynth,warm,encodeWav,scheduleSoftNote,softNoteHz,noteHz,journeyNotes,presetMix,changeMix,narrationPlan,SCRIPT_CLIPS,LEARN_CLIPS,REFRESH_SCRIPT,AUDITION_SCRIPT,JourneyAudio},acousticDSP:{createToneGraph,toneRecipe,scheduleToneEnvelope,toneAmplitude,generateMaskingBuffer,fftSteps,createOutput},routineQA: { runtime, timing, database, noise, binaural, background, events,
    jump(ms:number){timing.jump(ms);runtime.engine.reconcile();audio.resynchronize();},
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
