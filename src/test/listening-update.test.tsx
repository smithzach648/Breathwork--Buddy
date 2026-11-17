import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {createSnapshot,compileStages,type PracticeConfig} from '../session/config';
import {PRACTICE_GUIDANCE_VERSION} from '../audio/practice-guidance';
import {PRACTICE_NARRATION} from '../audio/practice-narration';
import {stageCues} from '../audio/cues';
import {acousticSelection,acousticProgram,validAcousticSelection} from '../meditation/acoustic-scenes';
import {defaultPreferences,validPreferences} from '../settings/preferences';
import {resolveEnvironment,sceneRecipe,customMeditation,silentRecipe} from '../meditation/environment';
import {freezeSound} from '../meditation/profile';
import {PRESETS} from '../audio/acoustic/model';
import {JourneySynth} from '../audio/acoustic/journey';
import {warm} from '../audio/acoustic/dsp';
import {JourneyAudio} from '../meditation-suite/audio';
import {createJourneyConfig} from '../meditation-suite/model';
import {changeMix,presetMix} from '../meditation-suite/mix';
import {PracticeRuntime} from '../session/runtime';
import {WakeLockController} from '../session/wake-lock';
import {FakeTiming} from './fake-time';
import {JourneyMixControls} from '../features/meditation-suite/JourneyMixControls';

describe('versioned Marshall and Soft Felt practice',()=>{
 it.each(['box','478','calm','coherent'] as const)('%s introduces before the timed breathing with no old voice or recorded breaths',presetId=>{
  const old=createSnapshot({kind:'patterned',presetId,durationSeconds:180});
  const snapshot=createSnapshot({kind:'patterned',presetId,durationSeconds:180,guidanceProfile:PRACTICE_GUIDANCE_VERSION});
  expect(old.stages[0].phase).toBe('prepare-inhale');expect(snapshot.stages[0]).toMatchObject({phase:'practice-introduction',durationMs:25000,introClipId:`practice.intro.${presetId}.1`});
  expect(snapshot.plannedDurationSeconds).toBe(205);expect(snapshot.stages.slice(1).reduce((n,s)=>n+s.durationMs,0)).toBe(180000);
  expect(snapshot.stages.flatMap(stage=>stageCues({stage,start:0,deadline:stage.durationMs,sessionId:'a',stageId:'a'})).map(c=>c.id)).toEqual([`practice.intro.${presetId}.1`]);
 });
 it('fits all Hormesis instructions and counts fully inside their exact slots',()=>{
  const config:PracticeConfig={kind:'hormesis',presetId:'hormesis-progressive',cycles:20,intervalSeconds:2,retentions:[60,90,90],recoveryHoldSeconds:15,guidanceProfile:PRACTICE_GUIDANCE_VERSION};
  const stages=compileStages(config);expect(stages[0].durationMs).toBe(30000);
  for(const stage of stages)for(const cue of stageCues({stage,start:0,deadline:stage.durationMs,sessionId:'s',stageId:'s'})){
   const asset=PRACTICE_NARRATION[cue.id];expect(asset.approved).toBe(true);expect(asset.durationSeconds).toBeLessThan((cue.until-cue.at)/1000-.02);expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
  }
  expect(stages.filter(s=>s.phase==='round-announcement').map(s=>s.durationMs)).toEqual([3000,3000,3000]);
 });
 it('adds introductions per breathing block while leaving meditation and settling unvoiced',()=>{
  const config:PracticeConfig={kind:'routine',guidanceProfile:PRACTICE_GUIDANCE_VERSION,routine:{id:'r',name:'Mixed',createdAt:'2026-11-17',updatedAt:'2026-11-17',stages:[{id:'a',kind:'patterned',presetId:'box',durationSeconds:180},{id:'m',kind:'meditation',presetId:'meditation',durationSeconds:60,audioPolicy:'silent'},{id:'b',kind:'custom-pattern',presetId:'custom-pattern',inhaleSeconds:5,holdInSeconds:0,exhaleSeconds:5,holdOutSeconds:0,cycles:2}]}};
  const s=createSnapshot(config);expect(s.stages.filter(s=>s.introClipId).map(s=>s.blockId)).toEqual(['a','b']);expect(s.stages.filter(s=>s.phase==='block-transition')).toHaveLength(2);
 });
 it('rejects unknown guidance versions',()=>expect(()=>createSnapshot({kind:'patterned',presetId:'box',durationSeconds:180,guidanceProfile:'future' as never})).toThrow());
});

describe('sound-only meditation environments',()=>{
 it.each(['threshold','expansion','timeless','open','flow'] as const)('%s freezes original recipes and starts at time zero without prep',scene=>{
  const p=defaultPreferences();p.meditation.acousticScene=scene;const config:PracticeConfig={kind:'meditation',presetId:'meditation',durationSeconds:600,audioPolicy:'defaults'};
  const snap=createSnapshot(config,undefined,undefined,{...freezeSound(p),environment:resolveEnvironment(config,p)});
  expect(validPreferences(p)).toBe(true);expect(snap.stages).toHaveLength(1);expect(snap.stages[0].phase).toBe('meditation');expect(snap.plannedDurationSeconds).toBe(600);
  const a=snap.stages[0].soundRecipe!.acoustic!;expect(validAcousticSelection(a)).toBe(true);expect(a.recipes).toEqual((scene==='flow'?['threshold','expansion','timeless']:[scene]).map(id=>PRESETS.find(p=>p.id===id)));
  const program=acousticProgram(a,600);expect(program.timeline.durationSeconds).toBe(600);expect(program.stages.reduce((n,s)=>n+s.durationSeconds,0)).toBe(600);expect(snap.stages[0].soundRecipe).toMatchObject({mode:'off',texture:'off'});
 });
 it('has exact Flow proportions and bounded outgoing crossfades',()=>{const j=acousticProgram(acousticSelection('flow'),1800);expect(j.stages.map(s=>s.durationSeconds)).toEqual([600,720,480]);expect(j.transitionSeconds).toBe(20);expect(()=>acousticProgram(acousticSelection('flow'),60)).toThrow(/3 minutes/);});
 it('preserves Silent and custom recipe choice independently of global defaults',()=>{const p=defaultPreferences();p.meditation.acousticScene='flow';expect(silentRecipe(p)).toMatchObject({mode:'off',texture:'off',source:'none'});expect(silentRecipe(p).acoustic).toBeUndefined();const r=sceneRecipe(customMeditation(p),'open',p);p.meditation.acousticScene='threshold';expect(r.acoustic!.scene).toBe('open');});
 it('rejects malformed recipes or mixing two environment renderers',()=>{const p=defaultPreferences(),r=sceneRecipe(customMeditation(p),'threshold',p);r.acoustic!.recipes[0].sampleSeed=NaN;expect(validAcousticSelection(r.acoustic)).toBe(false);});
});

describe('live balance without moving session truth',()=>{
 it('records live adjustments separately from immutable starting mix',async()=>{
  const clock=new FakeTiming(),persist=vi.fn(async()=>{}),audio={unlock:async()=>{},prepareJourney:async()=>{},setPreferences:vi.fn(),resynchronize(){},diagnostics:()=>({scheduled:0,skipped:0,failures:[],playing:0,state:'running'}),subscribe:()=>()=>{},enter(){},cancelStage(){},cancelSession(){}};
  const r=new PracticeRuntime(clock,clock,audio,new WakeLockController(undefined,()=>true),persist),p=defaultPreferences();r.preferencesChanged(p);await r.start(createJourneyConfig('foundation'));
  const before=r.engine.getState();clock.advance(1000);r.preferencesChanged({...p,journeyMix:changeMix(presetMix(),'warm',.13)});expect(r.engine.getState().snapshot).toBe(before.snapshot);expect(r.engine.getState().deadline).toBe(before.deadline);r.engine.stop();await Promise.resolve();
  expect(persist.mock.calls[0]).toBeDefined();const saved=(persist.mock.calls as unknown as [any][])[0][0];expect(saved.soundMixChanges[0]).toMatchObject({atSeconds:1,mix:{levels:{warm:.13}}});expect(saved.journey.snapshot.levels.warm).toBe(.7);
 });
 it('explicit preset reset applies even when saved preferences already equal that preset',async()=>{
  const clock=new FakeTiming(),setJourneyMix=vi.fn(),persist=vi.fn(async()=>{}),audio={setJourneyMix,unlock:async()=>{},prepareJourney:async()=>{},setPreferences(){},resynchronize(){},diagnostics:()=>({scheduled:0,skipped:0,failures:[],playing:0,state:'running'}),subscribe:()=>()=>{},enter(){},cancelStage(){},cancelSession(){}};
  const r=new PracticeRuntime(clock,clock,audio,new WakeLockController(undefined,()=>true),persist),p=defaultPreferences();r.preferencesChanged(p);await r.start(createJourneyConfig('foundation',{mix:changeMix(presetMix(),'voice',0)}));
  r.setJourneyMix(presetMix());r.preferencesChanged(p);expect(setJourneyMix).toHaveBeenCalledWith(presetMix());expect(r.engine.getState().snapshot!.config).toMatchObject({levels:{voice:0}});r.engine.stop();await Promise.resolve();expect((persist.mock.calls as unknown as [any][])[0][0].soundMixChanges[0].mix.levels.voice).toBe(1);
 });
 it('leaves the environment graph and notes running while smoothing every bus',()=>{
  const clock=new FakeTiming(),gains:any[]=[],node={port:{postMessage:vi.fn(),close(){}},connect(){},disconnect(){}};
  const param=()=>({value:1,setValueCurveAtTime:vi.fn(),setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),setTargetAtTime:vi.fn(),cancelScheduledValues:vi.fn()});
  const ctx={state:'running',currentTime:10,sampleRate:48000,createPeriodicWave:()=>({}),createGain:()=>{const g={gain:param(),connect(){},disconnect(){}};gains.push(g);return g;},createOscillator:()=>({frequency:param(),setPeriodicWave(){},connect(){},disconnect(){},start(){},stop(){}})};
  const make=vi.fn(()=>node as unknown as AudioWorkletNode),a=new JourneyAudio(clock,()=>({context:ctx as unknown as AudioContext,input:{} as AudioNode}),async()=>undefined,()=>{},make);
  Object.assign(a,{wave:new Float32Array(1<<20),workletReady:true});const config=createJourneyConfig('foundation'),bytes=JSON.stringify(config);a.begin(config,0,'s');a.play();const before=a.diagnostics();a.setMix(changeMix(presetMix(),'binaural',.17));expect(make).toHaveBeenCalledTimes(1);expect(a.diagnostics().notesScheduled).toBe(before.notesScheduled);expect(node.port.postMessage).toHaveBeenCalledWith({mix:{warm:.7*3,binaural:.17*4}});expect(gains[2].gain.setTargetAtTime).toHaveBeenCalledWith(.45,10,.05);expect(JSON.stringify(config)).toBe(bytes);a.stop();
 });
 it('keeps all Settings mixer controls usable and independent',()=>{const change=vi.fn();render(<JourneyMixControls mix={presetMix()} onChange={change}/>);fireEvent.change(screen.getByLabelText('Journey voice level'),{target:{value:'.3'}});expect(change.mock.calls[0][0]).toMatchObject({preset:'custom',levels:{voice:.3,warm:.7}});expect(screen.getByLabelText('Journey warm level')).toBeEnabled();});
 it('renders a gain ramp identically across a scene boundary and small blocks',()=>{
  const rate=44100,w=warm(rate,104729),j=acousticProgram(acousticSelection('flow'),180),frame=60*rate-200,options={sampleRate:rate,startSeconds:0,durationSeconds:180,selection:'combined' as const,fade:false};
  const a=new JourneySynth(j,options,w),b=new JourneySynth(j,options,w),l=new Float32Array(512),r=new Float32Array(512),x=new Float32Array(512),y=new Float32Array(512),mix={warm:0,binaural:0,warmStep:2/300,binauralStep:3/300,rampFrames:300};a.block(l,r,frame,mix);
  for(let at=0;at<512;at+=128)b.block(x.subarray(at,at+128),y.subarray(at,at+128),frame+at,{...mix,warm:mix.warmStep*Math.min(at,300),binaural:mix.binauralStep*Math.min(at,300),rampFrames:Math.max(0,300-at)});
  expect(x).toEqual(l);expect(y).toEqual(r);expect(l.some(n=>n!==0)).toBe(true);expect([...l,...r].every(Number.isFinite)).toBe(true);
 });
});
