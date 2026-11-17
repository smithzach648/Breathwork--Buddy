import {describe,it,expect,vi} from 'vitest';
// Isolated synthetic approvals retain the Phase 1.1 scheduling regression contract.
vi.mock('../meditation-suite/voice-assets',async()=>{
  const {SCRIPT_CLIPS}=await import('../meditation-suite/narration-content');
  return {APPROVED_NARRATION:Object.fromEntries(Object.values(SCRIPT_CLIPS).map(clip=>[clip.id,{id:clip.id,script:clip.script,language:'en',approved:true,assetId:clip.id,sha256:'b'.repeat(64),decodedDurationSeconds:8}]))};
});
import {JourneyAudio} from '../meditation-suite/audio';
import {createRefinedJourneyConfig as createJourneyConfig} from '../meditation-suite/model';
import {APPROVED_NARRATION,narrationPlan} from '../meditation-suite/voice-narration';
import {FakeTiming} from './fake-time';

function fixture(options:{oversize?:boolean;voice?:number;breathing?:'5-5'|'natural';guidance?:'guided'|'familiar'}={}){
  const clock=new FakeTiming(),sources:any[]=[],gains:any[]=[];
  const parameter=()=>({value:1,setValueAtTime:vi.fn(),setValueCurveAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),setTargetAtTime:vi.fn(),cancelScheduledValues:vi.fn()});
  const node=()=>({connect:vi.fn(),disconnect:vi.fn()});
  const source=(kind:string)=>{const s={...node(),kind,type:'',frequency:parameter(),setPeriodicWave:vi.fn(),start:vi.fn(),stop:vi.fn(),buffer:undefined as any,onended:undefined};sources.push(s);return s;};
  const context={currentTime:10,state:'running',sampleRate:48000,audioWorklet:{addModule:async()=>{}},createPeriodicWave:()=>({}),createGain:()=>{const g={...node(),gain:parameter()};gains.push(g);return g;},createOscillator:()=>source('note'),createBufferSource:()=>source('voice')};
  const audio=new JourneyAudio(clock,()=>({context:context as unknown as AudioContext,input:{} as AudioNode}),async id=>id==='signals.bowl'?undefined:{duration:options.oversize?90:8,sampleRate:48000} as AudioBuffer,()=>{},()=>({...node(),port:{postMessage(){},close(){},onmessage:null}}) as unknown as AudioWorkletNode,APPROVED_NARRATION);
  Object.assign(audio,{wave:new Float32Array(1<<20)});
  const config=createJourneyConfig('beyond',{breathing:options.breathing??'5-5',guidance:options.guidance??'guided'});if(options.voice===0){config.levels.voice=0;config.mixPreset='custom';}
  return {clock,sources,gains,audio,context,config};
}
describe('approved-recording scheduling and fallback (synthetic fixtures only)',()=>{
  it('schedules exact variant slots, smooth ducking, first notes and three return clips on one context',async()=>{
    const f=fixture();await f.audio.prepare();f.audio.begin(f.config,0,'one');f.audio.play();
    const voices=f.sources.filter(s=>s.kind==='voice'),notes=f.sources.filter(s=>s.kind==='note'),plan=narrationPlan(f.config);
    expect(voices.map(s=>s.start.mock.calls[0][0])).toEqual(plan.map(c=>10+c.at));
    expect(notes[0].start).toHaveBeenCalledWith(120);expect(notes).toHaveLength(160);
    const breath=voices[plan.findIndex(c=>c.section==='breathwork')];expect(breath.start).toHaveBeenCalledWith(100);expect(breath.stop).toHaveBeenCalledWith(108);
    expect(voices.slice(-3).map(s=>s.start.mock.calls[0][0])).toEqual([1930,1990,2050]);
    expect(f.gains.some(g=>g.gain.setTargetAtTime.mock.calls.some((call:any[])=>call[0]===.65))).toBe(true);
    expect(f.audio.diagnostics().skippedVoices).toEqual([]);f.audio.stop();
  });
  it('keeps oversized or duration-mismatched recordings silent with fallback diagnostics',async()=>{
    const f=fixture({oversize:true});await f.audio.prepare();f.audio.begin(f.config,0,'one');f.audio.play();
    expect(f.sources.filter(s=>s.kind==='voice')).toHaveLength(0);expect(f.audio.diagnostics().skippedVoices.length).toBeGreaterThan(0);expect(f.sources.filter(s=>s.kind==='note')).toHaveLength(160);f.audio.stop();
  });
  it('voice off reserves the same intro while scheduling no voice or duck',async()=>{
    const f=fixture({voice:0});await f.audio.prepare();f.audio.begin(f.config,0,'one');f.audio.play();
    expect(f.sources.filter(s=>s.kind==='voice')).toHaveLength(0);expect(f.sources[0].start).toHaveBeenCalledWith(120);
    expect(f.gains.some(g=>g.gain.setTargetAtTime.mock.calls.length)).toBe(false);f.audio.stop();
  });
  it('does not restart a spoken intro on suspension at its exact boundary',async()=>{
    const f=fixture();await f.audio.prepare();f.audio.begin(f.config,0,'one');f.audio.play();const before=f.sources.filter(s=>s.kind==='voice').length;
    f.audio.suspend();f.audio.play(true);const after=f.sources.filter(s=>s.kind==='voice');
    expect(after).toHaveLength(before*2-1);expect(after.filter(s=>s.start.mock.calls[0][0]===10)).toHaveLength(1);f.audio.stop();
  });
  it('Familiar and natural breathing select their actual option cues without paced notes',async()=>{
    const f=fixture({guidance:'familiar',breathing:'natural'});await f.audio.prepare();f.audio.begin(f.config,0,'one');f.audio.play();
    expect(f.sources.filter(s=>s.kind==='note')).toHaveLength(0);expect(f.sources.filter(s=>s.kind==='voice')).toHaveLength(narrationPlan(f.config).length);
    expect(narrationPlan(f.config).some(c=>c.clip.id==='suite.breath-natural.2')).toBe(true);f.audio.stop();
  });
  it('global voice permission and ducking are respected independently of saved mix',async()=>{
    const f=fixture();await f.audio.prepare();f.audio.setVoicePreferences(1,false,true);f.audio.begin(f.config,0,'one');f.audio.play();
    expect(f.sources.filter(s=>s.kind==='voice')).toHaveLength(0);f.audio.stop();
  });
  it('keeps the initial ECB cue despite a few milliseconds of real startup work',async()=>{
    const f=fixture();await f.audio.prepare();f.audio.begin(f.config,0,'one');f.clock.jump(7);f.audio.play();
    expect(f.sources.filter(s=>s.kind==='voice')[0].start).toHaveBeenCalledWith(10);f.audio.stop();
  });
  it('natural breathing during the introduction cancels its voice and all paced attacks',async()=>{
    const f=fixture();await f.audio.prepare();f.audio.begin(f.config,0,'one');f.audio.play();
    const voices=f.sources.filter(s=>s.kind==='voice'),intro=voices[narrationPlan(f.config).findIndex(c=>c.section==='breathwork')];
    f.clock.jump(95000);f.context.currentTime=105;f.audio.breatheNaturally();expect(intro.disconnect).toHaveBeenCalled();
    f.audio.suspend();f.audio.play(true);expect(f.audio.diagnostics().notesScheduled).toBe(160);f.audio.stop();
  });
});
