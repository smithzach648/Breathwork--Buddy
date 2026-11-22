import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {HORMESIS_OPTIONS,hormesisConfig} from '../session/hormesis';
import {compileStages,createSnapshot,validateConfig,cyclePattern} from '../session/config';
import {withMeditation} from '../session/practice-followup';
import {defaultPreferences} from '../settings/preferences';
import {resolveEnvironment} from '../meditation/environment';
import {freezeSound} from '../meditation/profile';
import {PRACTICE_NARRATION} from '../audio/practice-narration';
import {stageCues} from '../audio/cues';
import {DeterministicSessionEngine} from '../session/engine';
import {FakeTiming} from './fake-time';
import {Practice} from '../features/practice/Practice';
import {PracticeRuntime} from '../session/runtime';
import {WakeLockController} from '../session/wake-lock';

describe('fixed Hormesis protocols and complete final breath',()=>{
 it.each(['foundation','advanced'] as const)('%s has exact counts, pacing, targets and 4/6 final cycle',option=>{
  const config={...hormesisConfig(option),guidanceProfile:'soft-felt-marshall.1' as const},p=HORMESIS_OPTIONS[option],s=createSnapshot(config);
  expect(s.plannedDurationSeconds).toBe(option==='foundation'?849:801);expect(s.stages[0]).toMatchObject({phase:'practice-introduction',durationMs:90000,introClipId:p.introId});
  for(let round=1;round<=3;round++){
   const stages=s.stages.filter(s=>s.round===round),ins=stages.filter(s=>s.phase==='inhale'),outs=stages.filter(s=>s.phase==='exhale'||s.phase==='pre-retention-exhale');expect(ins).toHaveLength(p.cycles);expect(outs).toHaveLength(p.cycles);expect(ins.slice(0,-1).every(s=>s.durationMs===p.intervalSeconds*1000)).toBe(true);expect(outs.slice(0,-1).every(s=>s.durationMs===p.intervalSeconds*1000)).toBe(true);expect(ins.at(-1)).toMatchObject({durationMs:4000,cycle:p.cycles,finalBreath:true,finalBreathSignal:'hormesis-last.1'});expect(outs.at(-1)).toMatchObject({durationMs:6000,finalBreath:true});expect(stages.find(s=>s.phase==='retention')!.durationMs).toBe(p.retentions[round-1]*1000);expect(stages.filter(s=>s.finalBreathSignal)).toHaveLength(1);
  }
 });
 it.each(['foundation','advanced'] as const)('%s voice fits every protected slot and retains all five countdown seconds',option=>{
  const stages=compileStages({...hormesisConfig(option),guidanceProfile:'soft-felt-marshall.1'});
  for(const stage of stages){const cues=stageCues({stage,sessionId:'s',stageId:'s',start:0,deadline:stage.durationMs});for(const q of cues){const a=PRACTICE_NARRATION[q.id];expect(a?.approved,q.id).toBe(true);expect(a.durationSeconds).toBeLessThan((q.until-q.at)/1000-.02);}if(stage.phase==='retention')expect(cues.slice(-5).map(c=>c.at)).toEqual([5,4,3,2,1].map(n=>stage.durationMs-n*1000));}
 });
 it.each(['foundation','advanced'] as const)('%s has its own complete safety introduction',option=>{const a=PRACTICE_NARRATION[HORMESIS_OPTIONS[option].introId];for(const word of ['sitting or lying down','standing, walking, driving, or in water','release early','countdown from five','recovery'])expect(a.script.toLowerCase()).toContain(word);});
 it('rejects changing a fixed prescription or dropping its version',()=>{const c=hormesisConfig('foundation');for(const change of [{cycles:30},{intervalSeconds:2},{retentions:[60,90,90]},{protocolVersion:undefined}])expect(()=>validateConfig({...c,...change} as any)).toThrow();});
 it('keeps older two/three-second prescriptions and their old four-second final exhale',()=>{const s=compileStages({kind:'hormesis',presetId:'hormesis-progressive',intervalSeconds:3,cycles:20,retentions:[60,90,90],recoveryHoldSeconds:15});expect(s.filter(s=>s.phase==='pre-retention-exhale').map(s=>s.durationMs)).toEqual([4000,4000,4000]);expect(s.some(s=>s.finalBreathSignal)).toBe(false);});
});
describe('optional meditation in one parent session',()=>{
 it.each(['foundation','advanced'] as const)('%s continues after recovery and one transition, with no second introduction',option=>{const p=defaultPreferences(),config=withMeditation(hormesisConfig(option),5,'open',p),s=createSnapshot(config,undefined,undefined,{...freezeSound(p),environment:resolveEnvironment(config,p)});expect(s.stages.filter(s=>s.phase==='practice-introduction')).toHaveLength(1);expect(s.stages.at(-2)).toMatchObject({phase:'block-transition',durationMs:3000});expect(s.stages.at(-1)).toMatchObject({phase:'meditation',durationMs:300000,soundRecipe:{acoustic:{scene:'open'}}});expect(s.plannedDurationSeconds).toBe((option==='foundation'?849:801)+303);});
 it('also supports ordinary breathing and truly silent follow-up',()=>{const p=defaultPreferences(),config=withMeditation(cyclePattern('box',2),5,'off',p),sound={...freezeSound(p),environment:resolveEnvironment(config,p)},s=createSnapshot(config,undefined,undefined,sound);expect(s.plannedDurationSeconds).toBe(360);expect(s.stages.at(-1)).toMatchObject({meditationPolicy:'silent',soundRecipe:{texture:'off',mode:'off',source:'none',opening:'off',closing:'off'}});});
 it('early Release shortens just the retention and reaches meditation with one result',()=>{const t=new FakeTiming(),audio={enter:vi.fn(),cancelStage:vi.fn(),cancelSession:vi.fn()},e=new DeterministicSessionEngine(t,t,audio);e.start(createSnapshot(withMeditation(hormesisConfig('advanced'),5,'threshold',defaultPreferences())));t.advance(231000);expect(e.getState().stage?.phase).toBe('retention');const old=e.getState().stageId;e.releaseRetention();expect(audio.cancelStage).toHaveBeenCalledWith(old);expect(e.getState().stage?.phase).toBe('recovery-inhale');t.advance(525000);expect(e.getState().stage?.phase).toBe('meditation');t.advance(300000);const r=e.getState().result!;expect(r.actualDurationSeconds).toBe(1056);expect(r.blocks).toHaveLength(2);expect(r.blocks![0].hormesisPractice).toMatchObject({breathsPerRound:30,intervalSeconds:2,retentionTargets:[60,90,90]});expect(r.retentions![0]).toMatchObject({durationSeconds:12,outcome:'released'});});
 it('Stop before meditation marks the follow-up unstarted and cancels countdown scheduling',()=>{const t=new FakeTiming(),audio={enter:vi.fn(),cancelStage:vi.fn(),cancelSession:vi.fn()},e=new DeterministicSessionEngine(t,t,audio);e.start(createSnapshot(withMeditation(hormesisConfig('foundation'),5,'threshold',defaultPreferences())));t.advance(260000);e.stop();expect(e.getState().result?.blocks?.[1].outcome).toBe('not-started');const count=audio.enter.mock.calls.length;t.advance(2000000);expect(audio.enter).toHaveBeenCalledTimes(count);});
});
describe('simple setup for Hormesis and follow-up',()=>{
 it('offers the two fixed options and optional duration/environment without a builder',()=>{const t=new FakeTiming(),audio={unlock:async()=>{},setPreferences(){},resynchronize(){},diagnostics:()=>({scheduled:0,skipped:0,failures:[],playing:0,state:'running'}),subscribe:()=>()=>{},enter(){},cancelStage(){},cancelSession(){}};const runtime=new PracticeRuntime(t,t,audio,new WakeLockController(undefined,()=>true));render(<Practice runtime={runtime} state={runtime.getState()} onDone={()=>{}}/>);fireEvent.change(screen.getByLabelText('Practice'),{target:{value:'hormesis-foundation'}});expect(screen.queryByLabelText('Inhale / exhale interval')).toBeNull();expect(screen.getByText(/Three rounds · 20 breaths/)).toBeInTheDocument();expect(screen.getByText(/Never practice standing, walking, driving/)).toBeInTheDocument();fireEvent.click(screen.getByLabelText('Add meditation afterward'));expect(screen.getByLabelText('Meditation afterward · minutes')).toHaveValue('5');expect(screen.getByLabelText('Sound environment')).toHaveValue('threshold');expect(screen.getByText(/18:32/)).toBeInTheDocument();});
});
