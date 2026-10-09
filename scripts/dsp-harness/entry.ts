import {createToneGraph,scheduleToneEnvelope,toneRecipe,toneAmplitude} from '../../src/audio/binaural';
import {generateMasking} from '../../src/audio/noise-spectrum';
import {createOutput,outputTrim} from '../../src/audio/output';
import {signalProfile,toneEnvelope} from '../../src/meditation/profile';
Object.assign(window,{dsp:{createToneGraph,scheduleToneEnvelope,toneRecipe,toneAmplitude,generateMasking,createOutput,outputTrim,signalProfile,toneEnvelope}});
