import {describe,it,expect,vi} from 'vitest';
import {templateRoutine} from '../routines/templates';
import {createSnapshot,type PracticeConfig} from '../session/config';
import {meditationBridge} from '../session/meditation-bridge';
import {defaultPreferences,normalizePreferences} from '../settings/preferences';
import {resolveEnvironment,environmentPlan} from '../meditation/environment';
import {freezeSound} from '../meditation/profile';
import {releaseSoftNote} from '../meditation-suite/instrument';
import {DeterministicSessionEngine} from '../session/engine';
import {FakeTiming} from './fake-time';
function snapshot(id:'steady'|'custom'='steady'){
 const p=defaultPreferences(),config:PracticeConfig={kind:'routine',routine:templateRoutine(id),guidanceProfile:'soft-felt-marshall.1'};
 return createSnapshot(config,'test',undefined,{...freezeSound(p),environment:resolveEnvironment(config,p)});
}
describe('continuous meditation entry',()=>{
 it('shares one absolute acoustic timeline across settling, transition and meditation without changing session length',()=>{
  const s=snapshot();let at=0;const bridges=s.stages.flatMap(stage=>{const b=meditationBridge(s,stage,at);at+=stage.durationMs;return b?[{phase:stage.phase,...b}]:[];});
  expect(bridges.map(b=>b.phase)).toEqual(['natural-settling','block-transition','meditation']);
  for(const b of bridges){expect(b.key).toBe('block-2');expect(b.start).toBe(bridges[0].start);expect(b.seconds).toBe(318);expect(b.leadSeconds).toBe(18);expect(b.meditationAt-b.start).toBe(18000);}
  expect(s.stages.filter(s=>s.phase==='inhale')).toHaveLength(10);expect(at).toBe(s.plannedDurationSeconds*1000);
 });
 it('anchors an early arrival to its actual stage start rather than the planned full routine',()=>{
  const s=snapshot(),stage=s.stages.find(s=>s.phase==='natural-settling')!;
  expect(meditationBridge(s,stage,123000)).toMatchObject({start:168000,meditationAt:186000});
 });
 it('gives a direct transition three seconds of lead and excludes silent or legacy routines',()=>{
  const s=snapshot('custom'),transition=s.stages.find(s=>s.phase==='block-transition')!;
  expect(meditationBridge(s,transition,1000)).toMatchObject({start:1000,leadSeconds:3,seconds:303});
  const c=structuredClone(s.config);if(c.kind!=='routine')throw Error();const legacyConfig={...c,routine:{...c.routine,flowGuidance:undefined}};
  const legacy=createSnapshot(legacyConfig);expect(meditationBridge(legacy,legacy.stages[0],0)).toBeUndefined();
  const med=s.stages.find(s=>s.phase==='meditation')!;expect(meditationBridge(s,{...med,meditationPolicy:'silent'},0)).toBeUndefined();
 });
 it('crossfades an enabled practice background down during the end of settling',()=>{
  const p=defaultPreferences(),r={...templateRoutine('steady'),practiceAudio:{source:'warm' as const,level:.2,timing:'entire' as const,holdGuidance:false}};
  const config:PracticeConfig={kind:'routine',routine:r,guidanceProfile:'soft-felt-marshall.1'},s=createSnapshot(config,'f',undefined,{...freezeSound(p),environment:resolveEnvironment(config,p)}),t=new FakeTiming(),e=new DeterministicSessionEngine(t,t,{enter:vi.fn(),cancelStage:vi.fn(),cancelSession:vi.fn()});e.start(s);
  while(e.getState().stage?.phase!=='natural-settling')t.advance(e.getState().remainingMs);
  const full=environmentPlan(e.getState())!.noiseLevel;t.advance(54000);const halfway=environmentPlan(e.getState())!.noiseLevel;
  expect(full).toBeCloseTo(.07,5);expect(halfway).toBeCloseTo(full/2,5);expect(e.getState().stage?.phase).toBe('natural-settling');
 });
});
describe('recorded bowl preference upgrade',()=>{
 it('upgrades once, preserving disabled signals, zero level, master and all unrelated preferences',()=>{
  const old=defaultPreferences();delete old.meditation.signalDefaults;old.meditation.signalKind='legacy';old.meditation.signalLevel=0;old.meditation.openingSignal=false;old.volumes.master=.23;
  const next=normalizePreferences(old);expect(next.meditation).toMatchObject({signalKind:'bowl',signalDefaults:'bowl.1',signalLevel:0,openingSignal:false});expect(next.volumes).toEqual(old.volumes);expect(next.journeyMix).toEqual(old.journeyMix);
  next.meditation.signalKind='legacy';expect(normalizePreferences(next)).toEqual(next);
 });
 it('uses the bowl for a newly started saved modern routine without editing the saved recipe or its frozen history',()=>{
  const p=defaultPreferences(),r=templateRoutine('steady'),med=r.stages.find(s=>s.kind==='meditation')!;if(med.kind!=='meditation')throw Error();med.sound!.opening='legacy';med.sound!.closing='legacy';med.sound!.signalLevel=.7;
  const config:PracticeConfig={kind:'routine',routine:r,guidanceProfile:'soft-felt-marshall.1'},old=structuredClone(r),env=resolveEnvironment(config,p);
  expect(env.blocks['block-2']).toMatchObject({opening:'bowl',closing:'bowl',signalLevel:.35});expect(r).toEqual(old);
  const frozen={...freezeSound(p),environment:structuredClone(env)};frozen.environment.blocks['block-2'].opening='legacy';
  expect(createSnapshot(config,'history',undefined,frozen).stages.find(s=>s.phase==='meditation')!.soundRecipe!.opening).toBe('legacy');
 });
});
describe('audible note retirement',()=>{
 it('holds the live envelope and releases over 25 ms',()=>{
  const p={cancelAndHoldAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()},end=releaseSoftNote({currentTime:.35} as BaseAudioContext,{gain:p} as unknown as GainNode,0);
  expect(p.cancelAndHoldAtTime).toHaveBeenCalledWith(.35);expect(p.linearRampToValueAtTime).toHaveBeenCalledWith(0,.375);expect(end).toBe(.375);
 });
 it('supports browsers without cancelAndHoldAtTime without stepping to a nominal gain',()=>{
  const p={cancelScheduledValues:vi.fn(),setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn()};releaseSoftNote({currentTime:.35} as BaseAudioContext,{gain:p} as unknown as GainNode,0);
  expect(p.cancelScheduledValues).toHaveBeenCalledWith(0);const value=p.setValueAtTime.mock.calls[0][0];expect(value).toBeGreaterThan(0);expect(value).toBeLessThan(.25);expect(p.linearRampToValueAtTime).toHaveBeenCalledWith(0,.375);
 });
});
