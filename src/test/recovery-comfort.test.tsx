import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {practicePulse,practicePreviewPlan} from '../audio/practice-tones';
import {validRecoverySound,withPracticeSound} from '../session/recovery-sound';
import {hormesisConfig} from '../session/hormesis';
import {createSnapshot,cyclePattern,type PracticeConfig} from '../session/config';
import {defaultPreferences,normalizePreferences,validPreferences} from '../settings/preferences';
import {templateRoutine} from '../routines/templates';
import {freezeSound} from '../meditation/profile';
import {resolveEnvironment,environmentPlan} from '../meditation/environment';
import {FakeTiming} from './fake-time';
import {PracticeRuntime} from '../session/runtime';
import {WakeLockController} from '../session/wake-lock';
import {MeditationSignals} from '../audio/meditation-signals';
import {SessionSoundControls} from '../features/settings/SessionSoundControls';
import {createJourneyConfig} from '../meditation-suite/model';
const modes=['chords','single','quiet'] as const;
function fixture(){const t=new FakeTiming(),audio={enter:vi.fn(),cancelStage:vi.fn(),cancelSession:vi.fn(),unlock:vi.fn(async()=>{}),resynchronize:vi.fn(),setPreferences:vi.fn(),setJourneyMix:vi.fn(),stopPracticeTonePreview:vi.fn(),previewPracticeTones:vi.fn(()=>10),diagnostics:()=>({scheduled:0,skipped:0,failures:[],playing:0,state:'running'}),subscribe:()=>()=>{}},save=vi.fn(async()=>{}),r=new PracticeRuntime(t,t,audio,new WakeLockController(undefined,()=>true),save);return{t,audio,r,save};}
describe('recovery chord pulses',()=>{
 it('changes emphasis, keeping the same three frequencies and the single-note energy budget',()=>{
  const pulses=Array.from({length:15},(_,i)=>practicePulse('hold-in',i,15,'chords'));
  expect(pulses[0].map(v=>v.hz)).toEqual([146.8323839587038,174.61411571650194,220]);
  for(const p of pulses){expect(p.map(v=>v.hz)).toEqual(pulses[0].map(v=>v.hz));expect(p.reduce((s,v)=>s+v.scale*v.scale,0)).toBeCloseTo(1,12);expect(p.every(v=>v.scale>0&&v.scale<1)).toBe(true);}
  expect(pulses[0]).not.toEqual(pulses[1]);expect(pulses[4]).toEqual(pulses[0]);
 });
 it('Quiet removes recovery tones, preserving ordinary holds and rising/falling notes',()=>{
  expect(practicePulse('hold-in',0,15,'quiet')).toEqual([]);expect(practicePulse('hold-in',0,15,'single')).toEqual([{hz:220,scale:1}]);
  expect(practicePulse('inhale',0,4)[0].hz).toBeLessThan(practicePulse('inhale',3,4)[0].hz);expect(practicePulse('exhale',0,6)[0].hz).toBeGreaterThan(practicePulse('exhale',5,6)[0].hz);expect(practicePulse('hold-out',0,4)).toHaveLength(1);
 });
 it.each(['foundation','advanced','two'] as const)('%s preserves all stage deadlines, counts, Release and recovery timing across sound choices',option=>{
  const base={...hormesisConfig(option),guidanceProfile:'soft-felt-marshall.1' as const},old=createSnapshot(base);
  for(const mode of modes){const p={...defaultPreferences(),recoveryHoldSound:mode},s=createSnapshot(withPracticeSound(base,p));expect(s.stages.map(x=>[x.phase,x.durationMs,x.round,x.cycle])).toEqual(old.stages.map(x=>[x.phase,x.durationMs,x.round,x.cycle]));expect(s.stages.filter(x=>x.phase==='recovery-hold').every(x=>x.recoveryHoldSound===mode&&x.durationMs===15000)).toBe(true);expect(s.stages.filter(x=>x.phase!=='recovery-hold').every(x=>x.recoveryHoldSound===undefined)).toBe(true);}
 });
 it('keeps journeys and old frozen practice configurations unchanged',()=>{
  const j=createJourneyConfig('foundation');expect(withPracticeSound(j,defaultPreferences())).toBe(j);expect(createSnapshot({...hormesisConfig('advanced'),guidanceProfile:'soft-felt-marshall.1'}).stages.find(s=>s.phase==='recovery-hold')!.recoveryHoldSound).toBeUndefined();
 });
 it.each(modes)('saves %s without changing other audio settings',mode=>{const p={...defaultPreferences(),recoveryHoldSound:mode};expect(normalizePreferences(p)).toEqual(p);expect(validPreferences(p)).toBe(true);expect(validRecoverySound(mode)).toBe(true);expect(validPreferences({...p,recoveryHoldSound:'chaos'})).toBe(false);});
});
describe('preview isolation',()=>{
 it('shortens samples to at most twelve seconds, without a retention or session',()=>{
  for(const c of [...(['box','calm','478','coherent'] as const).map(id=>cyclePattern(id,5)),hormesisConfig('advanced'),{kind:'routine' as const,routine:templateRoutine('zach')}]){const plan=practicePreviewPlan(c);expect(plan.reduce((n,p)=>n+p.seconds,0)).toBeLessThanOrEqual(12);expect(plan.length).toBeGreaterThan(0);expect(plan.map(p=>p.phase)).not.toContain('retention');}
  expect(practicePreviewPlan(hormesisConfig('advanced')).map(p=>[p.phase,p.seconds,p.recovery])).toEqual([['inhale',3,false],['hold-in',4,true],['exhale',3,false]]);
 });
 it('never starts an engine or writes history, and cancels before a real start',async()=>{const f=fixture();expect(await f.r.previewPracticeTones(hormesisConfig('advanced'))).toBe(10);expect(f.r.engine.getState().status).toBe('idle');expect(f.save).not.toHaveBeenCalled();await f.r.start({...cyclePattern('box',1),guidanceProfile:'soft-felt-marshall.1'});expect(f.audio.stopPracticeTonePreview).toHaveBeenCalled();expect(await f.r.previewPracticeTones(hormesisConfig('advanced'))).toBe(0);f.r.engine.stop();});
 it('rejects a late unlock after navigation or Start cancels a preview',async()=>{const f=fixture();let resolve!:()=>void;f.audio.unlock.mockImplementation(()=>new Promise<void>(r=>{resolve=r;}));const pending=f.r.previewPracticeTones(hormesisConfig('foundation'));f.r.stopNoisePreview();resolve();expect(await pending).toBe(0);expect(f.audio.previewPracticeTones).not.toHaveBeenCalled();});
});
describe('one live sound mix',()=>{
 it('changes only background level, retaining source, retention gating and the smooth meditation crossfade',()=>{
  const f=fixture(),p=defaultPreferences(),routine={...templateRoutine('steady'),practiceAudio:{source:'warm' as const,timing:'entire' as const,level:.2,holdGuidance:false}},config:PracticeConfig={kind:'routine',routine,guidanceProfile:'soft-felt-marshall.1'};
  f.r.engine.start(createSnapshot(config,'m',undefined,{...freezeSound(p),environment:resolveEnvironment(config,p)}));while(f.r.engine.getState().stage?.phase!=='natural-settling')f.t.advance(f.r.engine.getState().remainingMs);f.t.advance(54000);const s=f.r.engine.getState();
  expect(environmentPlan(s,.8)!.noiseLevel).toBeCloseTo(.14,8);expect(environmentPlan(s,.8)!.texture).toBe('brown');expect(environmentPlan(s,0)!.noiseLevel).toBe(0);expect(environmentPlan(s)!.noiseLevel).toBeCloseTo(.035,8);f.r.engine.stop();
 });
 it('adjusts a sounding recorded bowl without restarting it or replacing its envelope',async()=>{
  const p=defaultPreferences(),gains:any[]=[],sources:any[]=[],t=new FakeTiming(),context={currentTime:10,state:'running',createOscillator:vi.fn(),createGain:()=>{const g={connect:vi.fn(),disconnect:vi.fn(),gain:{setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),setTargetAtTime:vi.fn(),cancelScheduledValues:vi.fn()}};gains.push(g);return g;},createBufferSource:()=>{const s={connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn(),buffer:null,onended:null};sources.push(s);return s;}};
  const signal=new MeditationSignals(t,()=>({context,input:{}} as any),p,async()=>({duration:15} as AudioBuffer)),stage=createSnapshot({kind:'meditation',presetId:'meditation',durationSeconds:60,audioPolicy:'defaults'}).stages[3];signal.play({stage,start:0,deadline:60000,sessionId:'s',stageId:'s/m'});await Promise.resolve();expect(sources).toHaveLength(1);const scheduled=gains[0].gain.linearRampToValueAtTime.mock.calls.length;signal.setLevel(.2);expect(gains[1].gain.setTargetAtTime).toHaveBeenCalledWith(.2/.35,10,.05);expect(gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledTimes(scheduled);expect(sources).toHaveLength(1);signal.setLevel(0);expect(signal.diagnostics().activeNodes).toBe(0);
 });
 it('opens quick controls, adjusts levels and returns focus while leaving session timing alone',()=>{
  const f=fixture(),p=defaultPreferences(),change=vi.fn();f.r.engine.start(createSnapshot({...cyclePattern('box',2),guidanceProfile:'soft-felt-marshall.1'}));const before=f.r.engine.getState().deadline;
  render(<SessionSoundControls preferences={p} onChange={change} runtime={f.r} state={f.r.getState()}/>);const trigger=screen.getByRole('button',{name:'Sound'});fireEvent.click(trigger);expect(screen.getByRole('dialog',{name:'Session sound'})).toBeTruthy();fireEvent.change(screen.getByRole('slider',{name:'Breathing tones level'}),{target:{value:'.3'}});expect(change.mock.calls.at(-1)![0].volumes.breath).toBe(.3);expect(f.r.engine.getState().deadline).toBe(before);fireEvent.click(screen.getByRole('button',{name:'Close sound controls'}));expect(screen.queryByRole('dialog')).toBeNull();expect(document.activeElement).toBe(trigger);fireEvent.click(trigger);fireEvent(screen.getByRole('dialog'),new Event('cancel',{cancelable:true}));expect(screen.queryByRole('dialog')).toBeNull();expect(document.activeElement).toBe(trigger);f.r.engine.stop();
 });
});
