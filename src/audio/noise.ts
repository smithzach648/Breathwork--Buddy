import type { AudioEnvironmentPort } from './meditation-signals';
import type { NoiseColor, Preferences } from '../settings/preferences';
import { defaultPreferences } from '../settings/preferences';
import type { SessionState } from '../session/engine';
import { meditationWindow } from '../meditation/policy';
import { generateMaskingBuffer } from './noise-spectrum';
type VoiceEnvelope = { from: number; to: number; at: number; duration: number };
interface NoiseTrack { context: AudioContext; source: AudioBufferSourceNode; transport: GainNode; duck: GainNode; level: GainNode; color: NoiseColor; region: string; }
export class NoiseController {
    private preferences=defaultPreferences();
    private session?: SessionState;
    private visible=true;
    private previewing=false;
    private generation=0;
    private buildGeneration=0;
    private duckGeneration=0;
    private current?: NoiseTrack;
    private tracks=new Set<NoiseTrack>();
    private pending?: string;
    private cache=new Map<NoiseColor,AudioBuffer>();
    private loads=new Map<NoiseColor,Promise<AudioBuffer>>();
    private held=false;
    private input=false;
    private duckEnvelope: VoiceEnvelope={from:1,to:1,at:0,duration:0};
    private restore?: ReturnType<typeof setTimeout>;
    private listeners=new Set<()=>void>();
    private error='';
    private generationMs=0;
    private state={playing:false,preview:false,color:'off' as NoiseColor|'off',error:''};
    constructor(private port:()=>AudioEnvironmentPort|undefined,private build=generateMaskingBuffer) {}
    getState=()=>this.state;
    subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
    private publish(){this.state={playing:!!this.current,preview:this.previewing,color:this.current?.color||'off',error:this.error};this.listeners.forEach(listener=>listener());}
    private buffer(color:NoiseColor,context:AudioContext) {
        const cached=this.cache.get(color);if(cached)return Promise.resolve(cached);
        const loading=this.loads.get(color);if(loading)return loading;
        const began=performance.now(),buildGeneration=this.buildGeneration;
        const promise=this.build(context,color,()=>buildGeneration!==this.buildGeneration).then(buffer=>{if(buildGeneration!==this.buildGeneration)throw new Error('Stale noise buffer');this.generationMs=performance.now()-began;this.loads.delete(color);this.cache.set(color,buffer);while(this.cache.size>2)this.cache.delete(this.cache.keys().next().value!);return buffer;},error=>{if(this.loads.get(color)===promise)this.loads.delete(color);throw error;});
        this.loads.set(color,promise);return promise;
    }
    setPreferences(p:Preferences){this.preferences=structuredClone(p);if(!p.guidance.ducking)this.setDucking(false,true);if(this.current)this.current.level.gain.setTargetAtTime(p.meditation.noiseVolume,this.port()!.context.currentTime,.05);this.sync(this.session);}
    sync(session?:SessionState){
        this.session=session;
        if(session?.status==='running'&&this.previewing){this.previewing=false;this.stop();}
        const window=meditationWindow(session),color=session?.status==='running' ? session.snapshot?.meditationSound?.texture ?? this.preferences.meditation.noise : this.preferences.meditation.noise;
        if(!this.visible||color==='off'||!this.previewing&&(!window||window.silent)) { if(this.current||this.pending)this.stop(!window?.silent && (session?.status==='completed'||session?.status==='running'&&session.stage?.phase==='block-transition') ? .7 : .05);return; }
        const port=this.port();if(!port||port.context.state!=='running'){if(this.current||this.pending)this.stop();return;}
        const region=this.previewing?'preview':window!.key,key=`${region}/${color}`;
        if(this.current?.region===region&&this.current.color===color||this.pending===key)return;
        if(this.pending){++this.buildGeneration;this.loads.clear();}const generation=++this.generation;this.pending=key;this.error='';
        void this.buffer(color,port.context).then(buffer=>{
            if(generation!==this.generation||!this.visible||port.context.state!=='running')return;
            this.pending=undefined;const {context,input}=port,now=context.currentTime;
            const old=this.current;const source=context.createBufferSource(),transport=context.createGain(),duck=context.createGain(),level=context.createGain();
            source.buffer=buffer;source.loop=true;source.connect(transport);transport.connect(duck);duck.connect(level);level.connect(input);
            const track={context,source,transport,duck,level,color,region};this.current=track;this.tracks.add(track);
            level.gain.setValueAtTime(this.preferences.meditation.noiseVolume,now);
            duck.gain.setValueAtTime(this.held && this.preferences.guidance.ducking ? .4 : 1,now);
            const latest=meditationWindow(this.session);const remaining=this.previewing ? .7 :Math.max(.7,((latest?.fadeDeadline||this.session?.stageStart||0)-(this.session?.stageStart||0)-(this.session?.stage?.durationMs||0)+this.session!.remainingMs)/1000);
            // Use engine-derived remaining lead-in, then a bounded crossfade for live type changes.
            transport.gain.setValueAtTime(0,now);transport.gain.linearRampToValueAtTime(1,now+(old?.region===region ? .3 : remaining));
            source.onended=()=>{this.tracks.delete(track);source.disconnect();transport.disconnect();duck.disconnect();level.disconnect();this.publish();};source.start(now);
            if(old)this.retire(old,.3);this.publish();
        }).catch(()=>{if(generation===this.generation){this.pending=undefined;this.error='Noise is unavailable. Meditation continues normally.';this.publish();}});
    }
    private retire(track:NoiseTrack,seconds:number){const context=track.context,now=context.currentTime;if(context.state!=='running'){try{track.source.stop();}catch{/* already ended */}track.source.disconnect();track.transport.disconnect();track.duck.disconnect();track.level.disconnect();this.tracks.delete(track);return;}const gain=track.transport.gain;if(gain.cancelAndHoldAtTime)gain.cancelAndHoldAtTime(now);else{gain.cancelScheduledValues(now);gain.setValueAtTime(gain.value,now);}gain.linearRampToValueAtTime(0,now+seconds);try{track.source.stop(now+seconds);}catch{/* already ended */}}
    private duckValue(now:number){const e=this.duckEnvelope;return e.duration?e.from+(e.to-e.from)*Math.min(1,Math.max(0,(now-e.at)/e.duration)):e.to;}
    private duckTo(to:number){const context=this.port()?.context;if(!context||this.duckEnvelope.to===to)return;const now=context.currentTime,from=this.duckValue(now);this.duckEnvelope={from,to,at:now,duration:.25};for(const track of this.tracks){track.duck.gain.cancelScheduledValues(now);track.duck.gain.setValueAtTime(from,now);track.duck.gain.linearRampToValueAtTime(to,now+.25);}}
    setDucking(active:boolean,force=false){this.input=active;if(force||!this.preferences.guidance.ducking){if(this.restore)clearTimeout(this.restore);this.restore=undefined;this.held=false;this.duckTo(1);return;}if(active){if(this.restore)clearTimeout(this.restore);this.restore=undefined;if(!this.held){this.held=true;this.duckTo(.4);}}else if(this.held&&!this.restore){const generation=this.duckGeneration;this.restore=setTimeout(()=>{this.restore=undefined;if(generation!==this.duckGeneration||this.input)return;this.held=false;this.duckTo(1);},300);}}
    preview(){if(this.session?.status==='running')return;this.previewing=true;this.sync(this.session);this.publish();}
    stopPreview(){if(this.previewing){this.previewing=false;this.stop();}}
    stop(seconds=.05){++this.generation;++this.buildGeneration;++this.duckGeneration;this.loads.clear();this.pending=undefined;if(this.restore)clearTimeout(this.restore);this.restore=undefined;this.held=this.input=false;this.duckEnvelope={from:1,to:1,at:0,duration:0};for(const track of this.tracks)this.retire(track,seconds);this.current=undefined;this.publish();}
    visibilityChanged(visible:boolean){this.visible=visible;if(!visible){this.previewing=false;this.stop();for(const track of [...this.tracks]){track.transport.gain.cancelScheduledValues(track.context.currentTime);track.transport.gain.setValueAtTime(0,track.context.currentTime);try{track.source.stop();}catch{/* already ended */}track.source.disconnect();track.transport.disconnect();track.duck.disconnect();track.level.disconnect();this.tracks.delete(track);}}else this.sync(this.session);}
    dispose(){this.previewing=false;this.stop();this.cache.clear();this.listeners.clear();}
    diagnostics(){return{...this.state,generation:this.generation,pending:this.pending,activeNodes:this.tracks.size,cachedBuffers:this.cache.size,bufferBytes:[...this.cache.values()].reduce((sum,b)=>sum+b.length*b.numberOfChannels*4,0),generationMs:this.generationMs,held:this.held,voice:this.input,duckFactor:this.duckValue(this.port()?.context.currentTime||0),noiseLevel:this.preferences.meditation.noiseVolume};}
}
