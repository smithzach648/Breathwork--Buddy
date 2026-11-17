import type { BinauralMode, Preferences, NoiseColor } from '../settings/preferences';
import {validEnvironment,type FrozenEnvironment} from './environment';
export interface FrozenSound {version:1;mode:BinauralMode;texture:NoiseColor|'off';music:boolean;environment?:FrozenEnvironment}
export function freezeSound(p:Preferences):FrozenSound{return{version:1,mode:p.meditation.binaural.mode,texture:p.meditation.noise,music:p.meditation.music};}
export function validSound(s:FrozenSound){return !!s && s.version===1 && ['off','baseline','layered','modulated'].includes(s.mode)&&['off','white','pink','brown'].includes(s.texture)&&typeof s.music==='boolean'&&(!s.environment||validEnvironment(s.environment));}
export {signalProfile,toneEnvelope,type SignalProfile} from './signal-profile';
