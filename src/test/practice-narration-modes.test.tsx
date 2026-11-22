import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {createSnapshot,cyclePattern,type PracticeConfig} from '../session/config';
import {hormesisConfig} from '../session/hormesis';
import {withPracticeNarration,type PracticeNarrationMode} from '../session/practice-narration';
import {defaultPreferences,normalizePreferences,validPreferences} from '../settings/preferences';
import {stageCues} from '../audio/cues';
import {cueEnabled} from '../audio/guidance';
import {PRACTICE_NARRATION} from '../audio/practice-narration';
import {COMPACT_NARRATION,COMPACT_BY_SOURCE,BRIEF_HOLD} from '../audio/compact-narration';
import {templateRoutine} from '../routines/templates';
import {createJourneyConfig as createFullJourneyConfig} from '../meditation-suite/model';
import {PracticeNarrationControl} from '../features/practice/PracticeNarrationControl';
import {PracticeRuntime} from '../session/runtime';
import {FakeTiming} from './fake-time';
import {WakeLockController} from '../session/wake-lock';
const choices=['full','brief','off'] as const;
const configs:PracticeConfig[]=[...(['box','calm','478','coherent'] as const).map(p=>({...cyclePattern(p,5),guidanceProfile:'soft-felt-marshall.1' as const})),...(['foundation','advanced','two'] as const).map(p=>({...hormesisConfig(p),guidanceProfile:'soft-felt-marshall.1' as const})),{kind:'routine',routine:templateRoutine('zach'),guidanceProfile:'soft-felt-marshall.1'}];
function plan(c:PracticeConfig,mode:PracticeNarrationMode){return createSnapshot(withPracticeNarration(c,{...defaultPreferences(),practiceNarration:mode}));}
function cues(s:ReturnType<typeof createSnapshot>){let at=0;return s.stages.flatMap(stage=>{const cs=stageCues({stage,start:at,deadline:at+stage.durationMs,sessionId:'s',stageId:String(at)});at+=stage.durationMs;return cs;});}
describe('shorter practice narration',()=>{
 it.each(configs)('preserves every breathing/retention/recovery stage across all three modes for $kind',c=>{
  const plans=choices.map(mode=>plan(c,mode));
  const core=(s:typeof plans[number])=>s.stages.filter(x=>x.phase!=='practice-introduction').map(x=>[x.phase,x.durationMs,x.round,x.cycle,x.totalCycles]);
  expect(core(plans[1])).toEqual(core(plans[0]));expect(core(plans[2])).toEqual(core(plans[0]));
  expect(plans[2].stages.some(s=>s.phase==='practice-introduction')).toBe(false);expect(cues(plans[2])).toEqual([]);
  for(const s of plans)for(const cue of cues(s)){const a=PRACTICE_NARRATION[cue.id];expect(a).toBeDefined();expect(a.durationSeconds).toBeLessThan((cue.until-cue.at)/1000-.02);}
 });
 it('fits full Hormesis speech plus a short tail instead of waiting through ninety seconds',()=>{
  for(const option of ['foundation','advanced','two'] as const){const c={...hormesisConfig(option),guidanceProfile:'soft-felt-marshall.1' as const},s=plan(c,'full');expect(s.stages[0].durationMs).toBeLessThan(54000);expect(s.stages[0].durationMs).toBeGreaterThan(46000);expect(createSnapshot(c).stages[0].durationMs).toBe(90000);}
 });
 it('brief routines have one short announcement per breathing block, without the shared flow introduction',()=>{
  const c=configs.at(-1)!,s=plan(c,'brief'),intros=s.stages.filter(s=>s.introClipId);expect(intros).toHaveLength(3);expect(intros.every(s=>s.durationMs<=4000&&s.introClipId!.startsWith('practice.brief.'))).toBe(true);
  const hold=s.stages.find(s=>s.phase==='retention')!,cs=stageCues({stage:{...hold,holdGuidance:true},start:0,deadline:hold.durationMs,sessionId:'x',stageId:'h'});
  expect(cs[0].id).toBe(BRIEF_HOLD);expect(cs.slice(1).map(c=>c.id)).toEqual(['five','four','three','two','one'].map(n=>'practice.compact.voice.'+n+'.1'));expect(cs.some(c=>c.id.includes('soften'))).toBe(false);
 });
 it('leaves journey snapshots and their existing narration completely unchanged',()=>{
  const c=createFullJourneyConfig('foundation');for(const mode of choices){expect(withPracticeNarration(c,{...defaultPreferences(),practiceNarration:mode})).toBe(c);}
 });
 it('uses only original Marshall sources or bounded brief phrase excerpts',()=>{
  expect(Object.keys(COMPACT_NARRATION)).toHaveLength(38);expect(Object.keys(COMPACT_BY_SOURCE)).toHaveLength(28);
  for(const a of Object.values(COMPACT_NARRATION)){expect(a.approved).toBe(true);expect(a.sha256).toMatch(/^[a-f0-9]{64}$/);expect(a.durationSeconds).toBeGreaterThan(0);expect(a.durationSeconds).toBeLessThan(a.maxSeconds);}
 });
});
describe('saved and live voice choices',()=>{
 it.each(choices)('normalizes and validates %s without changing sound balance or journey settings',mode=>{const p=defaultPreferences();p.practiceNarration=mode;expect(validPreferences(p)).toBe(true);expect(normalizePreferences(p)).toEqual(p);expect({...normalizePreferences(p),practiceNarration:undefined}).toEqual({...p,practiceNarration:undefined});});
 it('rejects unknown preference and snapshot narration versions/modes',()=>{
  expect(validPreferences({...defaultPreferences(),practiceNarration:'verbose'})).toBe(false);
  expect(()=>createSnapshot({...configs[0],practiceNarration:{version:'future',mode:'full'}} as unknown as PracticeConfig)).toThrow();
 });
 it('Off disables all practice voice while leaving notes, signals and journey guidance settings alone',()=>{
  const p=defaultPreferences();p.practiceNarration='off';expect(cueEnabled('practice.compact.voice.five.1',p)).toBe(false);expect(cueEnabled('practice.voice.fullExhale.1',p)).toBe(false);expect(cueEnabled('breath.soft-felt',p)).toBe(true);expect(p.guidance.generalVoice).toBe(true);
  p.practiceNarration='brief';expect(cueEnabled('practice.compact.intro.hormesis-advanced.2',p)).toBe(false);expect(cueEnabled('practice.compact.voice.hold90.1',p)).toBe(false);expect(cueEnabled('practice.compact.voice.five.1',p)).toBe(true);expect(cueEnabled(BRIEF_HOLD,p)).toBe(true);
 });
 it('applies the preference at the common start path and records the selected version with results',async()=>{
  const t=new FakeTiming(),audio={enter:vi.fn(),cancelStage:vi.fn(),cancelSession:vi.fn(),unlock:vi.fn(async()=>{}),resynchronize:vi.fn(),setPreferences:vi.fn(),diagnostics:()=>({scheduled:0,skipped:0,failures:[],playing:0,state:'running'}),subscribe:()=>()=>{}},save=vi.fn(async()=>{}),r=new PracticeRuntime(t,t,audio,new WakeLockController(undefined,()=>true),save);const p=defaultPreferences();p.practiceNarration='off';r.preferencesChanged(p);await r.start(configs[0]);expect(r.engine.getState().stage?.phase).toBe('inhale');t.advance(r.engine.getState().snapshot!.plannedDurationSeconds*1000);expect(r.engine.getState().result).toMatchObject({practiceNarration:{version:'concise.1',mode:'off'},patternedBreathing:{completedCycles:5}});expect(save).toHaveBeenCalled();
 });
 it('keeps an explicitly replayed old sound snapshot on its original narration timeline',async()=>{
  const t=new FakeTiming(),audio={enter:vi.fn(),cancelStage:vi.fn(),cancelSession:vi.fn(),unlock:vi.fn(async()=>{}),resynchronize:vi.fn(),setPreferences:vi.fn(),diagnostics:()=>({scheduled:0,skipped:0,failures:[],playing:0,state:'running'}),subscribe:()=>()=>{}},r=new PracticeRuntime(t,t,audio,new WakeLockController(undefined,()=>true),async()=>{});
  await r.start(configs[0],{version:1,mode:'off',texture:'off',music:false});expect(r.engine.getState().stage?.durationMs).toBe(25000);expect(r.engine.getState().snapshot!.config).not.toHaveProperty('practiceNarration');r.engine.stop();
 });
 it('explains the retained five-count in Brief and makes Off easy to find',()=>{const change=vi.fn();render(<PracticeNarrationControl value="brief" onChange={change}/>);expect(screen.getByText(/final five-count/)).toBeTruthy();fireEvent.change(screen.getByRole('combobox',{name:'Practice narration'}),{target:{value:'off'}});expect(change).toHaveBeenCalledWith('off');});
});
