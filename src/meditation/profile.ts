import type { BinauralMode, Preferences, NoiseColor } from '../settings/preferences';
import {validEnvironment,type FrozenEnvironment} from './environment';
export interface FrozenSound {version:1;mode:BinauralMode;texture:NoiseColor|'off';music:boolean;environment?:FrozenEnvironment}
export function freezeSound(p:Preferences):FrozenSound{return{version:1,mode:p.meditation.binaural.mode,texture:p.meditation.noise,music:p.meditation.music};}
export function validSound(s:FrozenSound){return !!s && s.version===1 && ['off','baseline','layered','modulated'].includes(s.mode)&&['off','white','pink','brown'].includes(s.texture)&&typeof s.music==='boolean'&&(!s.environment||validEnvironment(s.environment));}
export interface SignalProfile {entry:number;steady:number;return:number}
const allocations:Record<number,readonly[number,number,number]>={10:[1,8,1],15:[2,11,2],20:[2,15,3],30:[3,23,4],45:[4,35,6],60:[5,48,7]};
/** Envelope allocation only: no frequency sweep or claimed neurological protocol. */
export function signalProfile(seconds:number):SignalProfile {
    if(!Number.isInteger(seconds)||seconds<60||seconds>3600||seconds%60)throw new Error('Invalid meditation duration');
    if(seconds<600)return{entry:0,steady:seconds,return:0};
    const preset=allocations[seconds/60];if(preset)return{entry:preset[0]*60,steady:preset[1]*60,return:preset[2]*60};
    const entry=Math.round(seconds*.1),closing=Math.round(seconds*.12);return{entry,steady:seconds-entry-closing,return:closing};
}
export function toneEnvelope(elapsed:number,profile:SignalProfile,leadSeconds:number){
    if(elapsed<0)return .2*Math.max(0,Math.min(1,(elapsed+leadSeconds)/leadSeconds));
    if(elapsed<profile.entry)return .2+.8*elapsed/profile.entry;
    if(elapsed<profile.entry+profile.steady)return 1;
    return profile.return ? Math.max(0,1-(elapsed-profile.entry-profile.steady)/profile.return) : 0;
}
