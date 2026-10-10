import type { BinauralMode, Preferences } from '../settings/preferences';
import { defaultPreferences } from '../settings/preferences';
import type { AudioEnvironmentPort } from './meditation-signals';
import type { Clock } from '../session/clock';
import type { SessionState } from '../session/engine';
import {activeRecipe} from '../meditation/environment';
import { meditationWindow } from '../meditation/policy';
import { signalProfile, toneEnvelope, type SignalProfile } from '../meditation/profile';

// Default tone RMS stays below the default masking bed; all modes share this budget.
export const toneAmplitude=.14;
export const modulationFrequency=40,modulationDepth=.15;
export function toneRecipe(mode:BinauralMode) {
    if(mode==='off')return [];
    const centers=mode==='baseline'?[196]:[196,247,294];
    return centers.map(center=>({left:center-2,right:center+2,gain:1/Math.sqrt(centers.length)}));
}
export interface ToneGraph {
    sources:OscillatorNode[]; nodes:AudioNode[]; envelope:GainNode; level:GainNode; duck:GainNode;
    start:(at:number)=>void; stop:(at:number)=>void; disconnect:()=>void;
}
/** Every mono oscillator connects to exactly one merger input; the noise bed joins later. */
export function createToneGraph(context:BaseAudioContext,input:AudioNode,mode:BinauralMode,levelValue:number):ToneGraph {
    const pairs=toneRecipe(mode),merger=context.createChannelMerger(2),envelope=context.createGain(),level=context.createGain(),duck=context.createGain();
    const nodes:AudioNode[]=[merger,envelope,level,duck],sources:OscillatorNode[]=[];
    if(mode==='modulated'){
        const am=context.createGain(),depth=context.createGain(),modulator=context.createOscillator();
        am.gain.value=1;depth.gain.value=modulationDepth;modulator.type='sine';modulator.frequency.value=modulationFrequency;
        modulator.connect(depth);depth.connect(am.gain);merger.connect(am);am.connect(envelope);
        sources.push(modulator);nodes.push(am,depth);
    }else merger.connect(envelope);
    envelope.connect(duck);duck.connect(level);level.connect(input);
    envelope.gain.value=0;duck.gain.value=1;level.gain.value=toneAmplitude*levelValue;
    for(const pair of pairs)for(const [channel,frequency] of [pair.left,pair.right].entries()){
        const oscillator=context.createOscillator(),pairGain=context.createGain();
        oscillator.type='sine';oscillator.frequency.value=frequency;pairGain.gain.value=pair.gain;
        oscillator.connect(pairGain);pairGain.connect(merger,0,channel);sources.push(oscillator);nodes.push(pairGain);
    }
    let disconnected=false;
    return{sources,nodes,envelope,level,duck,start:at=>sources.forEach(source=>source.start(at)),stop:at=>sources.forEach(source=>{try{source.stop(at);}catch{/* A superseded source may already have ended. */}}),disconnect:()=>{if(disconnected)return;disconnected=true;sources.forEach(source=>source.disconnect());nodes.forEach(node=>node.disconnect());}};
}
/** Schedule the immutable profile on the audio clock from the existing engine's elapsed time. */
export function scheduleToneEnvelope(param:AudioParam,now:number,elapsed:number,profile:SignalProfile,lead:number) {
    param.cancelScheduledValues(now);const join=.05,value=toneEnvelope(elapsed,profile,lead);
    param.setValueAtTime(0,now);param.linearRampToValueAtTime(toneEnvelope(elapsed+join,profile,lead),now+join);
    const points:[number,number][]=[[0,.2],[profile.entry,1],[profile.entry+profile.steady,1],[profile.entry+profile.steady+profile.return,0]];
    for(const [time,target] of points)if(time>elapsed+join)param.linearRampToValueAtTime(target,now+time-elapsed);
    return value;
}
type Track={graph:ToneGraph;context:AudioContext;key:string;mode:BinauralMode;levelValue:number};
export class BinauralController {
    private preferences=defaultPreferences();private session?:SessionState;private visible=true;private previewing=false;
    private sessionId?:string;private liveLevels=new Map<string,number>();
    private levelKey(){return meditationWindow(this.session)?.blockId||'standalone';}
    private current?:Track;private tracks=new Set<Track>();private held=false;private restore?:ReturnType<typeof setTimeout>;
    private error='';private listeners=new Set<()=>void>();private state={playing:false,preview:false,mode:'off' as BinauralMode,error:''};
    constructor(private port:()=>AudioEnvironmentPort|undefined,private clock:Clock){}
    getState=()=>this.state;
    subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
    private publish(){this.state={playing:!!this.current,preview:this.previewing,mode:this.current?.mode||'off',error:this.error};this.listeners.forEach(listener=>listener());}
    setPreferences(p:Preferences){if(this.session?.status==='running'&&p.meditation.binaural.level!==this.preferences.meditation.binaural.level)this.liveLevels.set(this.levelKey(),p.meditation.binaural.level);this.preferences=structuredClone(p);if(this.current)this.current.graph.level.gain.setTargetAtTime(toneAmplitude*p.meditation.binaural.level,this.current.context.currentTime,.05);if(!p.guidance.ducking)this.setDucking(false);this.sync(this.session);}
    sync(session?:SessionState){
        this.session=session;if(session?.sessionId!==this.sessionId){this.sessionId=session?.sessionId;this.liveLevels.clear();}if(session?.status==='running'&&this.previewing){this.previewing=false;this.stop();}
        const recipe=activeRecipe(session),window=meditationWindow(session),mode=recipe?.mode ?? (session?.status==='running'?session.snapshot?.meditationSound?.mode??this.preferences.meditation.binaural.mode:this.preferences.meditation.binaural.mode);
        if(!this.visible||mode==='off'||!this.previewing&&(!window||window.silent||window.durationSeconds<600)){if(this.current)this.stop();return;}
        const port=this.port();if(!port||port.context.state!=='running'){if(this.current)this.stop();return;}
        const key=this.previewing?`preview/${mode}`:`${window!.key}/${mode}`;if(this.current?.key===key){if(recipe){const value=this.liveLevels.get(this.levelKey())??recipe.toneLevel;if(value!==this.current.levelValue){this.current.levelValue=value;this.current.graph.level.gain.setTargetAtTime(toneAmplitude*value,this.current.context.currentTime,.05);}}return;}
        this.stop();this.error='';
        try{
            const {context,input}=port,now=context.currentTime,graph=createToneGraph(context,input,mode,this.liveLevels.get(this.levelKey())??recipe?.toneLevel??this.preferences.meditation.binaural.level);
            if(!graph.sources.length){graph.disconnect();return;}
            const track={context,graph,key,mode,levelValue:this.liveLevels.get(this.levelKey())??recipe?.toneLevel??this.preferences.meditation.binaural.level};this.current=track;this.tracks.add(track);
            graph.duck.gain.value=this.held&&this.preferences.guidance.ducking?.4:1;
            let remaining=20;
            if(this.previewing){graph.envelope.gain.setValueAtTime(0,now);graph.envelope.gain.linearRampToValueAtTime(1,now+.7);}
            else {const elapsed=(this.clock.now()-window!.meditationStart)/1000,profile=signalProfile(window!.durationSeconds);remaining=window!.durationSeconds-elapsed;scheduleToneEnvelope(graph.envelope.gain,now,elapsed,profile,window!.leadSeconds);}
            let ended=0;for(const source of graph.sources)source.onended=()=>{if(++ended===graph.sources.length){graph.disconnect();this.tracks.delete(track);if(this.current===track)this.current=undefined;this.publish();}};
            graph.start(now);graph.stop(now+Math.max(0,remaining)+.05);this.publish();
        }catch{this.error='The binaural layer is unavailable. Your meditation continues.';this.stop();this.publish();}
    }
    private retire(track:Track,immediate=false){immediate=immediate||track.context.state!=='running';const now=track.context.currentTime,param=track.graph.envelope.gain;const value=param.value;if(param.cancelAndHoldAtTime)param.cancelAndHoldAtTime(now);else{param.cancelScheduledValues(now);param.setValueAtTime(value,now);}param.linearRampToValueAtTime(0,now+(immediate?0:.05));track.graph.stop(now+(immediate?0:.05));if(immediate){track.graph.disconnect();this.tracks.delete(track);}}
    stop(){if(this.restore)clearTimeout(this.restore);this.restore=undefined;this.held=false;for(const track of this.tracks)this.retire(track);this.current=undefined;this.publish();}
    setDucking(active:boolean){if(!this.preferences.guidance.ducking){if(this.restore)clearTimeout(this.restore);this.restore=undefined;this.duck(false);return;}if(active){if(this.restore)clearTimeout(this.restore);this.restore=undefined;this.duck(true);}else if(this.held&&!this.restore)this.restore=setTimeout(()=>{this.restore=undefined;this.duck(false);},300);}
    private duck(held:boolean){if(this.held===held)return;this.held=held;for(const track of this.tracks)track.graph.duck.gain.setTargetAtTime(held?.4:1,track.context.currentTime,.08);}
    preview(){if(this.session?.status==='running')return;this.previewing=true;this.sync(this.session);this.publish();}
    stopPreview(){if(this.previewing){this.previewing=false;this.stop();}}
    visibilityChanged(visible:boolean){this.visible=visible;if(!visible){this.previewing=false;this.stop();for(const track of [...this.tracks])this.retire(track,true);}else this.sync(this.session);}
    dispose(){this.visibilityChanged(false);this.listeners.clear();}
    diagnostics(){return{...this.state,activeGraphs:this.tracks.size,activeOscillators:[...this.tracks].reduce((n,track)=>n+track.graph.sources.length,0),held:this.held,level:this.liveLevels.get(this.levelKey())??activeRecipe(this.session)?.toneLevel??this.preferences.meditation.binaural.level};}
}
