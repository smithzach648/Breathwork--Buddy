import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {cyclePattern,createSnapshot,patterns,validateConfig,type PracticeConfig} from '../session/config';
import {DeterministicSessionEngine} from '../session/engine';
import {FakeTiming} from './fake-time';
import {defaultPreferences} from '../settings/preferences';
import {developedRecipe,resolveEnvironment} from '../meditation/environment';
import {freezeSound} from '../meditation/profile';
import {PRESETS} from '../audio/acoustic/model';
import {scheduleSoftNote,SOFT_NOTE_SECONDS} from '../meditation-suite/instrument';
import {Routines} from '../features/routines/Routines';

describe('whole-cycle breathing',()=>{
 it.each(['box','478','calm','coherent'] as const)('%s completes every phase of every chosen cycle',id=>{
  for(const cycles of [1,10,30]){
   const config={...cyclePattern(id,cycles),guidanceProfile:'soft-felt-marshall.1' as const},snapshot=createSnapshot(config),breaths=snapshot.stages.slice(1),positive=patterns[id].seconds.filter(n=>n>0);
   expect(snapshot.plannedDurationSeconds).toBe(cycles*patterns[id].seconds.reduce((a,b)=>a+b,0)+25);
   expect(breaths).toHaveLength(cycles*positive.length);expect(breaths.filter(s=>s.phase==='inhale')).toHaveLength(cycles);
   for(let c=1;c<=cycles;c++)expect(breaths.filter(s=>s.cycle===c).map(s=>s.durationMs)).toEqual(positive.map(n=>n*1000));
   expect(breaths.at(-1)!.totalCycles).toBe(cycles);
  }
 });
 it.each([0,-1,1.5,NaN,101])('rejects invalid cycle count %s',n=>expect(()=>cyclePattern('box',n)).toThrow());
 it('rejects mismatched duration and a cycle count over the block limit',()=>{expect(()=>validateConfig({...cyclePattern('box',10),durationSeconds:159})).toThrow();expect(()=>cyclePattern('478',100)).toThrow();});
 it('retains old time-based prescriptions without guessing a new cycle count',()=>{const old=createSnapshot({kind:'patterned',presetId:'box',durationSeconds:180});expect(old.config).not.toHaveProperty('cycles');expect(old.stages.slice(3).reduce((n,s)=>n+s.durationMs,0)).toBe(180000);});
 it('counts only complete cycles in stopped and completed results',()=>{
  const t=new FakeTiming(),e=new DeterministicSessionEngine(t,t),config={...cyclePattern('box',3),guidanceProfile:'soft-felt-marshall.1' as const};e.start(createSnapshot(config));t.advance(59000);e.stop();expect(e.getState().result!.patternedBreathing).toEqual({presetId:'box',requestedCycles:3,completedCycles:2});
  e.start(createSnapshot(config));t.advance(73000);expect(e.getState().result!.patternedBreathing?.completedCycles).toBe(3);expect(e.getState().result!.actualDurationSeconds).toBe(73);
 });
});
describe('developed environment as the complete sound choice',()=>{
 it.each(['threshold','expansion','timeless','open','flow'] as const)('%s includes the original frozen recipe, with no second legacy renderer',scene=>{const p=defaultPreferences();p.meditation.acousticScene=scene;p.meditation.binaural.mode='modulated';const r=developedRecipe(p);expect(r.acoustic!.recipes).toEqual((scene==='flow'?['threshold','expansion','timeless']:[scene]).map(id=>PRESETS.find(s=>s.id===id)));expect(r).toMatchObject({texture:'off',mode:'off'});});
 it('uses Threshold for current UI starts even with previously saved legacy choices',()=>{
  const p=defaultPreferences();p.meditation.binaural.mode='modulated';const before=JSON.stringify(p),config:PracticeConfig={kind:'routine',guidanceProfile:'soft-felt-marshall.1',routine:{id:'r',name:'Mine',createdAt:'2026-11-17',updatedAt:'2026-11-17',stages:[{id:'m',kind:'meditation',presetId:'meditation',durationSeconds:60,audioPolicy:'defaults'}]}};
  const r=resolveEnvironment(config,p);expect(r.blocks.m.acoustic?.scene).toBe('threshold');expect(JSON.stringify(p)).toBe(before);delete config.guidanceProfile;expect(resolveEnvironment(config,p).blocks.m.mode).toBe('modulated');
 });
 it('starts Silence directly and suppresses companion audio and both signals',()=>{const p=defaultPreferences();p.meditation.acousticScene='off';p.meditation.music=true;p.background.source='ambience.floating';const sound=developedRecipe(p),config:PracticeConfig={kind:'meditation',presetId:'meditation',audioPolicy:'custom',directStart:true,durationSeconds:60,sound};const s=createSnapshot(config,undefined,undefined,{...freezeSound(p),environment:resolveEnvironment(config,p)});expect(s.stages).toHaveLength(1);expect(s.stages[0].soundRecipe).toMatchObject({source:'none',texture:'off',mode:'off',opening:'off',closing:'off'});});
 it('saves cycles and a scene from one routine dropdown, without exposing a separate binaural selector',async()=>{
  const save=vi.fn(async(_row:unknown)=>{});render(<Routines repository={{list:async()=>[],save} as any} onStart={async()=>{}} onBack={()=>{}}/>);await screen.findByRole('button',{name:'Create routine'});fireEvent.click(screen.getByRole('button',{name:'Create routine'}));fireEvent.change(screen.getByLabelText('Routine name'),{target:{value:'My cycles'}});fireEvent.change(screen.getByLabelText('Block 1 breathing cycles'),{target:{value:'7'}});fireEvent.click(screen.getByRole('button',{name:'Add block'}));fireEvent.change(screen.getByLabelText('Block 2 practice'),{target:{value:'meditation'}});fireEvent.change(screen.getByLabelText('Block 2 sound environment'),{target:{value:'open'}});expect(screen.queryByLabelText('Block binaural layer')).toBeNull();expect(screen.queryByLabelText('Block environment')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Save routine'}));await waitFor(()=>expect(save).toHaveBeenCalled());expect(save.mock.calls[0][0]).toMatchObject({stages:[{kind:'patterned',cycles:7,durationSeconds:84},{kind:'meditation',sound:{acoustic:{scene:'open'},texture:'off',mode:'off'}}]});
 });
});
describe('audible felt instrument, soft envelope',()=>{
 it('uses a normal note peak with the same gentle attack, decay and release',()=>{
  const curves:Float32Array[]=[],frequency=vi.fn(),ctx={createPeriodicWave:()=>({}),createOscillator:()=>({setPeriodicWave(){},frequency:{setValueAtTime:frequency},connect(){},start(){},stop(){}}),createGain:()=>({connect(){},gain:{setValueCurveAtTime:(curve:Float32Array)=>curves.push(curve)}})};
  scheduleSoftNote(ctx as any,{} as any,220,1);scheduleSoftNote(ctx as any,{} as any,220,2,true);
  expect(Math.max(...curves[0])).toBeGreaterThan(.24);expect(Math.max(...curves[1])).toBeGreaterThan(.16);for(const curve of curves){expect(curve[0]).toBe(0);expect(curve.at(-1)).toBe(0);expect(curve[1]).toBeLessThan(.01);expect(curve.at(-2)!).toBeLessThan(.001);}expect(SOFT_NOTE_SECONDS).toBe(.86);expect(frequency).toHaveBeenCalledTimes(2);
 });
});
