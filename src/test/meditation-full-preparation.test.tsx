import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {createJourneyConfig,createLegacyJourneyConfig,createRefinedJourneyConfig,validateJourneyConfig,compileJourney,timeline,nextInhale,sectionWindow} from '../meditation-suite/model';
import {journeyNotes,bowlTimes} from '../meditation-suite/tones';
import {narrationPlan,validRecording,APPROVED_NARRATION,guidanceText} from '../meditation-suite/voice-narration';
import {FULL_CLIPS} from '../meditation-suite/full-narration-content';
import {BUILDER_AFFIRMATIONS,CLASSIC_GATEWAY} from '../meditation-suite/full-narration';
import {JourneyAudio} from '../meditation-suite/audio';
import {defaultPreferences,normalizePreferences,validPreferences} from '../settings/preferences';
import {FakeTiming} from './fake-time';
import {PracticeRuntime} from '../session/runtime';
import {WakeLockController} from '../session/wake-lock';
import {Meditate} from '../features/meditation-suite/Meditate';

describe('full preparation and historical snapshots',()=>{
  it.each([['foundation',1980],['beyond',2880],['preparation',1080]] as const)('%s has its exact budget without hidden setup', (id,seconds)=>{
    const c=createJourneyConfig(id),rows=timeline(c);
    expect(c.schemaVersion).toBe(3);expect(c.sound.timeline.durationSeconds).toBe(seconds);expect(rows.at(-1)!.end).toBe(seconds);
    expect(['ecb','breathwork','tuning','space','affirmation','entry'].map(s=>sectionWindow(c,s as any))).toEqual([{start:0,end:120},{start:120,end:420},{start:420,end:570},{start:570,end:720},{start:720,end:840},{start:840,end:900}]);
    expect(rows.some(r=>r.stage.journeySection==='relaxation'||r.stage.phase==='block-transition'||r.stage.phase.startsWith('prepare-'))).toBe(false);
    expect(sectionWindow(c,'return')).toEqual({start:seconds-180,end:seconds});
  });
  it.each([['5-5',20,200],['4-4-6',15,210],['4-7-8',4,76],['natural',0,0]] as const)('%s has whole cycles between five regional cues', (breathing,cycles,attacks)=>{
    const c=createJourneyConfig('foundation',{breathing}),rows=timeline(c),notes=journeyNotes(c),plan=narrationPlan(c);
    expect(notes.length).toBe(attacks);expect(rows.filter(r=>r.stage.phase==='inhale')).toHaveLength(cycles);
    expect(plan.filter(q=>q.clip.id.startsWith('suite.body.'))).toHaveLength(5);
    expect(rows.filter(r=>r.stage.journeySection==='breathwork').reduce((n,r)=>n+r.end-r.start,0)).toBe(300);
    for(const n of notes){expect(n.at).toBeGreaterThanOrEqual(breathing==='4-4-6'?153:155);expect(n.at+n.duration).toBeLessThan(420);expect(plan.every(q=>n.at>=q.end||n.at+n.duration<=q.at)).toBe(true);}
    if(breathing==='4-7-8'){expect(notes.filter(n=>n.phase==='hold-in')).toHaveLength(28);expect(notes.at(-1)!.at).toBe(242);expect(nextInhale(c,244)).toBe(420);}
    if(breathing==='4-4-6')expect(notes.filter(n=>n.phase==='hold-in')).toHaveLength(60);
  });
  it('keeps the old two schemas valid without silently extending their times',()=>{
    for(const factory of [createLegacyJourneyConfig,createRefinedJourneyConfig])for(const id of ['foundation','beyond','preparation'] as const){const c=factory(id),frozen=JSON.stringify(c);expect(validateJourneyConfig(c)).toEqual(c);expect(timeline(c).at(-1)!.end).toBe(({foundation:1500,beyond:2100,preparation:780})[id]);createJourneyConfig(id);expect(JSON.stringify(c)).toBe(frozen);}
  });
  it('preserves recipe ingredients, Soft Felt and the outgoing-stage blend positions',()=>{
    const old=createRefinedJourneyConfig('beyond'),c=createJourneyConfig('beyond');
    expect(c.sound.stages.map(s=>s.recipe)).toEqual(old.sound.stages.map(s=>s.recipe));expect(c.toneVersion).toBe('soft-steps.2');expect(bowlTimes(c)).toEqual([1500,2220]);expect(c.sound.transitionSeconds).toBe(20);
    expect(timeline(c).filter(r=>['threshold','expansion','timeless'].includes(r.stage.journeySection!)).map(r=>[r.start,r.end])).toEqual([[900,1500],[1500,2220],[2220,2700]]);
  });
  it('rejects a changed preparation grid, unrecognized source recipe, or unavailable classic selection',()=>{
    const c=createJourneyConfig('foundation');c.preparation!.breathingEvents[1].end++;
    expect(()=>validateJourneyConfig(c)).toThrow();expect(()=>createJourneyConfig('foundation',{affirmation:'classic'})).toThrow();
    const b=createJourneyConfig('beyond');b.sound.stages[1].recipe.carrierPairs[0].deltaHz=8;expect(()=>validateJourneyConfig(b)).toThrow();
  });
});

describe('real recorded guidance and choice routing',()=>{
  it('has 42 unique approved local recordings, with the accepted ECB length',()=>{
    expect(Object.keys(APPROVED_NARRATION)).toHaveLength(42);expect(APPROVED_NARRATION['suite.ecb.guided.v2'].decodedDurationSeconds).toBe(50);
    expect(Object.values(APPROVED_NARRATION).every(a=>a.script===FULL_CLIPS[a.id].script&&a.approved&&/^[a-f0-9]{64}$/.test(a.sha256))).toBe(true);
    expect(BUILDER_AFFIRMATIONS.neutral).not.toBe(BUILDER_AFFIRMATIONS.spiritual);expect(CLASSIC_GATEWAY.text).toBeNull();
  });
  it('fits every recorded option without voice collisions, note overlap or stolen humming time',()=>{
    for(const id of ['foundation','beyond'] as const)for(const guidance of ['guided','familiar'] as const)for(const breathing of ['5-5','4-4-6','4-7-8','natural'] as const)for(const humming of [true,false])for(const surroundingSpace of [true,false])for(const affirmation of ['neutral','spiritual','personal'] as const){
      const c=createJourneyConfig(id,{guidance,breathing,humming,surroundingSpace,affirmation}),plan=narrationPlan(c);
      let previousEnd=0;
      for(const cue of plan){const a=APPROVED_NARRATION[cue.clip.id];expect(validRecording(cue,a,c.audioAssets.voice),cue.clip.id).toBe(true);expect(cue.at).toBeGreaterThanOrEqual(previousEnd);previousEnd=cue.at+a.decodedDurationSeconds;expect(previousEnd<=465||cue.at>=555).toBe(true);if(cue.bowlAt!==undefined)expect(cue.at).toBeGreaterThanOrEqual(cue.bowlAt+16);}
      expect(plan.find(q=>q.section==='tuning')!.clip.id).toBe(`suite.tuning.${humming?guidance:'silent'}.v2`);
      expect(plan.find(q=>q.section==='space')!.clip.id).toBe(`suite.rebal.${surroundingSpace?guidance:'nonvisual'}.v2`);
      const end=c.sound.timeline.durationSeconds;expect(plan.filter(q=>q.section==='return').map(q=>q.at)).toEqual([end-180,end-120,end-60]);
    }
  });
  it('uses distinct journey intentions and personal text only as a local caption',()=>{
    const a=createJourneyConfig('foundation'),b=createJourneyConfig('beyond');expect(guidanceText(a,'affirmation')).not.toBe(guidanceText(b,'affirmation'));
    const personal='My private local words',c=createJourneyConfig('beyond',{affirmation:'personal',personalAffirmation:personal});expect(guidanceText(c,'affirmation')).toBe(personal);expect(narrationPlan(c).some(q=>q.clip.script.includes(personal))).toBe(false);
    const familiar=createJourneyConfig('beyond',{guidance:'familiar',affirmation:'personal'});expect(narrationPlan(familiar).some(q=>q.section==='affirmation')).toBe(false);
    const muted=createJourneyConfig('beyond');muted.levels.voice=0;muted.mixPreset='custom';expect(compileJourney(muted)).toEqual(compileJourney(b));
  });
  it('preserves affirmation preferences additively and rejects oversized or invalid personal data',()=>{
    const p={...defaultPreferences(),journeyPreparation:{affirmation:'personal' as const,personalAffirmation:'Still local'}};expect(normalizePreferences(p)).toEqual(p);expect(validPreferences(p)).toBe(true);p.journeyPreparation.personalAffirmation='x'.repeat(2001);expect(validPreferences(p)).toBe(false);expect(normalizePreferences(p).journeyPreparation).toBeUndefined();
  });
});

function fixture(){
 const timing=new FakeTiming(),sources:any[]=[],loads:string[]=[];
 const param=()=>({value:1,setValueAtTime:vi.fn(),setValueCurveAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),setTargetAtTime:vi.fn(),cancelScheduledValues:vi.fn()});
 const node=()=>({connect:vi.fn(),disconnect:vi.fn()});
 const make=(kind:string)=>{const n={...node(),kind,frequency:param(),setPeriodicWave:vi.fn(),start:vi.fn(),stop:vi.fn(),buffer:undefined as any};sources.push(n);return n;};
 const context={currentTime:10,state:'running',sampleRate:48000,audioWorklet:{addModule:async()=>{}},createPeriodicWave:()=>({}),createGain:()=>({...node(),gain:param()}),createOscillator:()=>make('note'),createBufferSource:()=>make('buffer')};
 const audio=new JourneyAudio(timing,()=>({context:context as unknown as AudioContext,input:{} as AudioNode}),async id=>{loads.push(id);return {duration:APPROVED_NARRATION[id]?.decodedDurationSeconds??(id==='signals.bowl'?14.988027210884354:4.5),sampleRate:48000,assetId:id} as unknown as AudioBuffer;},()=>{},()=>({...node(),port:{postMessage(){},close(){},onmessage:null}}) as unknown as AudioWorkletNode);
 Object.assign(audio,{wave:new Float32Array(1<<20)});return {timing,sources,loads,context,audio};
}
describe('production voice scheduling and safe recovery',()=>{
 it('prepares changed options after a canceled in-flight start instead of reusing the earlier clip selection',async()=>{
  const f=fixture(),a=createJourneyConfig('beyond'),b=createJourneyConfig('beyond',{guidance:'familiar',humming:false,surroundingSpace:false});
  const original=(f.audio as any).load;let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let blocked=false;
  (f.audio as any).load=async(id:string,sha?:string)=>{if(id==='suite.ecb.guided.v2'&&!blocked){blocked=true;await gate;}return original(id,sha);};
  const first=f.audio.prepare(a);await Promise.resolve();await Promise.resolve();const second=f.audio.prepare(b);release();await Promise.all([first,second]);
  expect(f.loads).toContain('suite.rebal.nonvisual.v2');f.audio.begin(b,0,'changed');f.audio.play();expect(f.audio.diagnostics().skippedVoices).toEqual([]);f.audio.stop();
 });
 it('preloads only selected clips and schedules two chimes plus two full bowls',async()=>{
  const f=fixture(),c=createJourneyConfig('beyond');await f.audio.prepare(c);f.audio.begin(c,0,'full');f.audio.play();
  expect(f.audio.diagnostics()).toMatchObject({notesScheduled:200,bowlsScheduled:4,skippedVoices:[]});expect(f.loads).not.toContain('suite.rebal.nonvisual.v2');
  const chimes=f.sources.filter(s=>s.buffer?.assetId==='signals.bowl-short.1');expect(chimes.map(s=>s.start.mock.calls[0][0])).toEqual([130,430]);
  const tuning=f.sources.find(s=>s.buffer?.assetId==='suite.tuning.guided.v2');expect(tuning.start).toHaveBeenCalledWith(436);
  const intro=f.sources.find(s=>s.buffer?.assetId==='suite.breath.intro.5-5.v2');f.audio.breatheNaturally();expect(intro.disconnect).toHaveBeenCalled();expect(f.sources.find(s=>s.buffer?.assetId==='suite.body.face.v2').disconnect).not.toHaveBeenCalled();f.audio.stop();
 });
 it('does not request or await narration when voice is off',async()=>{
  const f=fixture(),c=createJourneyConfig('foundation');c.levels.voice=0;c.mixPreset='custom';await f.audio.prepare(c);f.audio.begin(c,0,'silent');f.audio.play();expect(f.loads.some(id=>id.startsWith('suite.'))).toBe(false);expect(f.sources.some(s=>s.buffer?.assetId?.startsWith('suite.'))).toBe(false);expect(f.audio.diagnostics().notesScheduled).toBe(200);f.audio.stop();
 });
 it('does not replay a chime or partial voice and rejoins a full inhale after interruption',async()=>{
  const f=fixture(),c=createJourneyConfig('beyond');await f.audio.prepare(c);f.audio.begin(c,0,'resume');f.audio.play();f.context.currentTime=131;f.timing.jump(121000);f.audio.suspend();f.audio.play(true);
  expect(f.sources.filter(s=>s.buffer?.assetId==='signals.bowl-short.1'&&s.start.mock.calls[0][0]===130)).toHaveLength(1);
  f.context.currentTime=169;f.timing.jump(38000);f.audio.suspend();f.audio.play(true);expect(f.audio.diagnostics().naturalUntilSeconds).toBe(165);f.audio.stop();
 });
});

describe('affirmation and voice-off controls',()=>{
 it('loads narration from the frozen start snapshot while audio unlock is pending',async()=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),timing=new FakeTiming(),prepare=vi.fn(async(_config?:unknown)=>{});
  const audio={unlock:()=>gate,prepareJourney:prepare,diagnostics:()=>({scheduled:0,skipped:0,failures:[],playing:0,state:'running'}),subscribe:()=>()=>{},setPreferences(){},resynchronize(){},enter(){},cancelStage(){},cancelSession(){}};
  const runtime=new PracticeRuntime(timing,timing,audio,new WakeLockController(undefined,()=>true)),c=createJourneyConfig('beyond');
  const starting=runtime.start(c);c.humming=false;c.surroundingSpace=false;release();await starting;
  expect(prepare.mock.calls[0][0]).toMatchObject({humming:true,surroundingSpace:true});expect(Object.isFrozen(prepare.mock.calls[0][0])).toBe(true);runtime.engine.stop();
 });
 it('offers four clear choices, stores personal text locally and starts a silent exact journey',async()=>{
  const timing=new FakeTiming(),audio={unlock:async()=>{},diagnostics:()=>({scheduled:0,skipped:0,failures:[],playing:0,state:'running'}),subscribe:()=>()=>{},setPreferences(){},resynchronize(){},enter(){},cancelStage(){},cancelSession(){}};
  const runtime=new PracticeRuntime(timing,timing,audio,new WakeLockController(undefined,()=>true)),save=vi.fn();render(<Meditate runtime={runtime} state={runtime.getState()} onTimer={()=>{}} preferences={defaultPreferences()} onPreferencesChange={save}/>);
  expect(screen.getByRole('option',{name:/Classic Gateway/})).toBeDisabled();fireEvent.change(screen.getByLabelText('Affirmation'),{target:{value:'personal'}});fireEvent.change(screen.getByLabelText('Your words (optional)'),{target:{value:'My quiet intention'}});expect(save.mock.calls.at(-1)![0].journeyPreparation).toEqual({affirmation:'personal',personalAffirmation:'My quiet intention'});
  fireEvent.change(screen.getByLabelText('Guidance'),{target:{value:'off'}});fireEvent.click(screen.getByRole('button',{name:'Start journey'}));await waitFor(()=>expect(runtime.engine.getState().status).toBe('running'));expect(runtime.engine.getState().snapshot).toMatchObject({plannedDurationSeconds:1980,config:{schemaVersion:3,affirmation:'personal',personalAffirmation:'My quiet intention',levels:{voice:0}}});runtime.engine.stop();
 });
});
