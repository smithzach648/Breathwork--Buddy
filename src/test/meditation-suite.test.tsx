import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
// These original assertions remain a regression contract for Phase 1 frozen snapshots.
import { createLegacyJourneyConfig as createJourneyConfig, compileJourney, breathworkStages, timeline, nextInhale, validateJourneyConfig, JOURNEYS } from '../meditation-suite/model';
import { noteHz, phaseNotes, journeyNotes, bowlTimes, returnEnvelope } from '../meditation-suite/tones';
import { NARRATION_MANIFEST, hasApprovedNarration, narrationFits, guidanceText } from '../meditation-suite/narration';
import { createSnapshot, compileStages } from '../session/config';
import { DeterministicSessionEngine } from '../session/engine';
import { FakeTiming } from './fake-time';
import { PracticeRuntime } from '../session/runtime';
import { WakeLockController } from '../session/wake-lock';
import { defaultPreferences } from '../settings/preferences';
import { Meditate } from '../features/meditation-suite/Meditate';
import { PRESETS } from '../../lab/model';
import { JourneyAudio } from '../meditation-suite/audio';
import type { SessionResult } from '../types/domain';

describe('production meditation timeline',()=>{
  it.each([['foundation',1500],['beyond',2100],['preparation',780]] as const)('compiles %s to exactly %is with ECB first', (id,seconds)=>{
    const snapshot=createSnapshot(createJourneyConfig(id));
    expect(snapshot.plannedDurationSeconds).toBe(seconds);
    expect(snapshot.stages.reduce((n,s)=>n+s.durationMs,0)).toBe(seconds*1000);
    expect(snapshot.stages[0]).toMatchObject({journeySection:'ecb',durationMs:90000});
    expect(snapshot.stages.at(-1)).toMatchObject({journeySection:'return',durationMs:180000});
    expect(snapshot.stages.some(s=>s.phase.startsWith('prepare-')||s.phase==='block-transition')).toBe(false);
    expect(Object.isFrozen(snapshot.config)).toBe(true);
  });
  it.each(['5-5','4-7-8','4-4-6','natural'] as const)('keeps exactly three breathwork minutes with %s', breathing=>{
    const rows=timeline(createJourneyConfig('beyond',{breathing}));
    expect(rows.find(r=>r.stage.journeySection==='breathwork')!.start).toBe(90);
    expect(rows.filter(r=>r.stage.journeySection==='breathwork').at(-1)!.end).toBe(270);
    expect(rows.find(r=>r.stage.journeySection==='threshold')!.start).toBe(600);
  });
  it('pins all seven preparation section budgets',()=>{
    const sections=Object.fromEntries(['ecb','breathwork','relaxation','tuning','space','affirmation','entry'].map(id=>[id,compileJourney(createJourneyConfig('foundation')).filter(s=>s.journeySection===id).reduce((n,s)=>n+s.durationMs/1000,0)]));
    expect(sections).toEqual({ecb:90,breathwork:180,relaxation:120,tuning:60,space:60,affirmation:30,entry:60});
  });
  it('pins absolute environment and return boundaries',()=>{
    const config=createJourneyConfig('beyond');
    expect(timeline(config).filter(r=>['threshold','expansion','timeless','return'].includes(r.stage.journeySection!)).map(r=>[r.stage.journeySection,r.start,r.end])).toEqual([['threshold',600,1080],['expansion',1080,1620],['timeless',1620,1920],['return',1920,2100]]);
    expect(bowlTimes(config)).toEqual([1080,1620]);
    expect(bowlTimes(createJourneyConfig('foundation'))).toEqual([]);
    expect(config.sound.transitionSeconds).toBe(20);
  });
  it('uses the original immutable lab recipes, not approximate rewrites',()=>{
    const config=createJourneyConfig('beyond');
    for(const id of ['threshold','expansion','timeless']){
      const frozen=config.sound.stages.find(s=>s.id===`suite-${id}`)!.recipe;
      expect(frozen).toEqual({...structuredClone(PRESETS.find(p=>p.id===id)!),output:{...PRESETS.find(p=>p.id===id)!.output,level:1}});
    }
    expect(PRESETS.find(p=>p.id==='threshold')!.output.level).toBe(.8);
    expect(config.sound.stages[0].recipe.carrierPairs.every(p=>!p.enabled)).toBe(true);
  });
  it('does not repeat standalone envelopes in any sound stage',()=>{
    const sound=createJourneyConfig('beyond').sound;
    expect(sound.layerEnvelope).toBe('steady');expect(sound.sourcePolicy).toBe('shared-warm');
    expect(sound.stages.at(-1)!.recipe).toEqual(sound.stages.at(-2)!.recipe);
  });
  it('reserves introductions before whole cycles and settles the remainder',()=>{
    const stages=breathworkStages('5-5',8);
    expect(stages[0]).toMatchObject({label:'Breathing introduction',durationMs:8000});
    expect(stages.filter(s=>s.phase==='inhale')).toHaveLength(17);
    expect(stages.at(-1)).toMatchObject({phase:'natural-settling',durationMs:2000});
    expect(stages.reduce((n,s)=>n+s.durationMs,0)).toBe(180000);
  });
  it('limits 478 holds to four complete cycles and leaves 104 seconds natural',()=>{
    const stages=breathworkStages('4-7-8');
    expect(stages.filter(s=>s.phase==='hold-in')).toHaveLength(4);
    expect(stages.at(-1)).toMatchObject({phase:'natural-settling',durationMs:104000});
  });
  it('keeps legacy 13-second preparation and 3-second routine transitions unchanged',()=>{
    const base={kind:'settling' as const,presetId:'settling' as const,durationSeconds:30};
    const stages=compileStages({kind:'routine',routine:{id:'legacy',name:'Old routine',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),stages:[{...base,id:'one'},{...base,id:'two'}]}});
    expect(stages.slice(0,3).reduce((n,s)=>n+s.durationMs,0)).toBe(13000);
    expect(stages.find(s=>s.phase==='block-transition')!.durationMs).toBe(3000);
  });
  it.each([NaN,-1,2])('rejects invalid audio level %s without clamping', value=>{const c=createJourneyConfig('foundation');c.levels.bowl=value;expect(()=>validateJourneyConfig(c)).toThrow();});
  it('rejects unknown versions, an ambiguous breathing pattern, and altered sound snapshots',()=>{
    const c=createJourneyConfig('foundation');
    expect(()=>validateJourneyConfig({...c,suiteVersion:'future'})).toThrow();
    expect(()=>validateJourneyConfig({...c,breathing:'4-4-4-6'})).toThrow();
    c.sound.stages[1].recipe.carrierPairs[0].deltaHz=7;expect(()=>validateJourneyConfig(c)).toThrow();
  });
});

describe('one musical attack per second',()=>{
  it('rejects invalid phase windows rather than producing malformed or silent plans',()=>{
    for(const seconds of [0,-1,21,NaN,1.5])expect(()=>phaseNotes('inhale',seconds)).toThrow();
    expect(()=>phaseNotes('meditation',4)).toThrow();expect(()=>phaseNotes('inhale',4,-1)).toThrow();
  });
  it.each([['inhale',4],['inhale',5],['exhale',8],['hold-in',7],['hold-out',2]] as const)('schedules %s %is with no boundary extra', (phase,seconds)=>{
    const events=phaseNotes(phase,seconds,10);
    expect(events).toHaveLength(seconds);expect(events.map(e=>e.at)).toEqual(Array.from({length:seconds},(_,i)=>10+i));
    expect(events.every(e=>e.at+e.duration<10+seconds)).toBe(true);
  });
  it.each([1,2,4,5,8,12,20])('defines finite strictly directional pitches for %is',seconds=>{
    const up=phaseNotes('inhale',seconds).map(e=>e.hz),down=phaseNotes('exhale',seconds).map(e=>e.hz);
    expect(down).toEqual([...up].reverse());
    up.forEach((hz,i)=>{expect(Number.isFinite(hz)).toBe(true);expect(hz).toBeGreaterThan(0);if(i)expect(hz).toBeGreaterThan(up[i-1]);});
  });
  it('keeps every hold pulse stationary',()=>{
    expect(new Set(phaseNotes('hold-in',7).map(e=>e.hz)).size).toBe(1);
    expect(new Set(phaseNotes('hold-out',2).map(e=>e.hz)).size).toBe(1);
  });
  it('counts exactly 19 attacks across an entire 4-7-8 cycle',()=>{
    const events=journeyNotes(createJourneyConfig('foundation',{breathing:'4-7-8'})).filter(e=>e.at<109);
    expect(events).toHaveLength(19);expect(events.map(e=>e.at)).toEqual(Array.from({length:19},(_,i)=>90+i));
    expect(events.filter(e=>e.phase==='inhale')).toHaveLength(4);expect(events.filter(e=>e.phase==='hold-in')).toHaveLength(7);expect(events.filter(e=>e.phase==='exhale')).toHaveLength(8);
  });
  it('supports 4-4-6-2, including its two-second final rest',()=>{
    const events=[...phaseNotes('inhale',4),...phaseNotes('hold-in',4,4),...phaseNotes('exhale',6,8),...phaseNotes('hold-out',2,14)];
    expect(events.map(e=>e.at)).toEqual(Array.from({length:16},(_,i)=>i));
    expect(events.slice(-2).map(e=>e.hz)).toEqual([noteHz('hold-out',0,2),noteHz('hold-out',0,2)]);
  });
  it('has exactly 180 default notes, no legacy voice counting, and no notes after breathing',()=>{
    const notes=journeyNotes(createJourneyConfig('foundation'));
    expect(notes).toHaveLength(180);expect(notes[0].at).toBe(90);expect(notes.at(-1)!.at).toBe(269);
    expect(journeyNotes(createJourneyConfig('foundation',{breathing:'natural'}))).toEqual([]);
  });
  it('selects the next full inhale after interruption rather than resuming a hold',()=>{
    expect(nextInhale(createJourneyConfig('foundation'),97)).toBe(100);
    expect(nextInhale(createJourneyConfig('foundation',{breathing:'4-7-8'}),96)).toBe(109);
    expect(nextInhale(createJourneyConfig('foundation',{breathing:'4-7-8'}),169)).toBe(270);
  });
  it('fades throughout exactly the final three minutes',()=>{
    const c=createJourneyConfig('beyond');expect(returnEnvelope(c,1920)).toBe(1);expect(returnEnvelope(c,2010)).toBe(.5);expect(returnEnvelope(c,2100)).toBe(0);expect(returnEnvelope(c,0)).toBe(0);
  });
});

describe('narration approval and text alternatives',()=>{
  it('pins recorded bowl provenance and explicitly records the absence of approved voice assets',()=>{
    const config=createJourneyConfig('foundation');
    expect(config.audioAssets).toMatchObject({bowl:'signals.bowl',bowlSha256:'a51cd3515750342723df6db5322878534b11e9661be69d7f73241b0a8ffda1ee',voice:[]});
    config.audioAssets.voice.push('unapproved');expect(()=>validateJourneyConfig(config)).toThrow();
  });
  it('uses natural-breathing text when no tones were selected',()=>{
    expect(guidanceText(createJourneyConfig('foundation',{breathing:'natural'}),'breathwork')).toContain('no counting or holding');
  });
  it('ships original text and no fake or generated voice assets',()=>{
    expect(hasApprovedNarration()).toBe(false);
    expect(Object.values(NARRATION_MANIFEST.assets).every(a=>a.id&&a.script&&a.language==='en'&&!('assetId' in a))).toBe(true);
  });
  it('requires approval, a decoded duration, a bowl gap, and room before the next boundary',()=>{
    const text={id:'reviewed',language:'en' as const,script:'Original words'};
    expect(narrationFits(text,{start:0,end:10})).toBe(false);
    expect(narrationFits({...text,assetId:'approved',decodedDurationSeconds:11},{start:0,end:10})).toBe(false);
    expect(narrationFits({...text,assetId:'approved',decodedDurationSeconds:4},{start:1090,end:1100},1080)).toBe(false);
    expect(narrationFits({...text,assetId:'approved',decodedDurationSeconds:4},{start:1096,end:1100},1080)).toBe(true);
  });
  it('provides neutral alternatives, a secular default, and progressive return text',()=>{
    const c=createJourneyConfig('foundation',{humming:false,surroundingSpace:false});
    expect(guidanceText(c,'tuning')).toContain('No humming');expect(guidanceText(c,'space')).toContain('No imagery');
    expect(guidanceText(c,'affirmation')).not.toContain('sacred');
    expect(guidanceText(c,'return',0)).not.toBe(guidanceText(c,'return',120));
  });
});

function fixture() {
  const clock=new FakeTiming(),persist=vi.fn(async(_r:SessionResult)=>{});
  const audio={unlock:vi.fn(async()=>{}),setPreferences:vi.fn(),resynchronize:vi.fn(),diagnostics:()=>({scheduled:0,skipped:0,failures:[],playing:0,state:'running'}),subscribe:()=>()=>{},enter:vi.fn(),cancelStage:vi.fn(),cancelSession:vi.fn(),beginSession:vi.fn(),prepareJourney:vi.fn(async()=>{}),journeyNaturalBreathing:vi.fn()};
  const runtime=new PracticeRuntime(clock,clock,audio,new WakeLockController(undefined,()=>true),persist);return{clock,audio,runtime,persist};
}
describe('one session owner and existing History',()=>{
  it.each(['foundation','beyond'] as const)('completes %s at its exact deadline and saves one immutable result', async id=>{
    const f=fixture(),config=createJourneyConfig(id);await f.runtime.start(config);
    const snapshot=f.runtime.engine.getState().snapshot!;config.levels.bowl=0;
    f.clock.jump(snapshot.plannedDurationSeconds*1000);f.runtime.engine.reconcile();await Promise.resolve();
    expect(f.runtime.engine.getState().status).toBe('completed');expect(f.persist).toHaveBeenCalledTimes(1);
    const saved=f.persist.mock.calls[0][0];expect(saved.actualDurationSeconds).toBe(snapshot.plannedDurationSeconds);expect(saved.journey!.snapshot.levels.bowl).toBe(.45);
    expect(f.audio.beginSession).toHaveBeenCalledTimes(1);
  });
  it('cancels an asynchronous start without late playback or History',async()=>{
    const f=fixture();let finish!:()=>void;f.audio.prepareJourney.mockImplementation(()=>new Promise<void>(r=>finish=r));
    const pending=f.runtime.start(createJourneyConfig('foundation'));await Promise.resolve();await Promise.resolve();f.runtime.cancelStart();finish();await pending;
    expect(f.runtime.engine.getState().status).toBe('idle');expect(f.persist).not.toHaveBeenCalled();expect(f.audio.beginSession).not.toHaveBeenCalled();
  });
  it('records a natural-breathing adaptation without changing the frozen selection',async()=>{
    const f=fixture();await f.runtime.start(createJourneyConfig('foundation',{breathing:'4-7-8'}));f.clock.jump(96000);f.runtime.engine.reconcile();
    f.runtime.breatheNaturally();f.runtime.engine.stop();await Promise.resolve();
    expect(f.audio.journeyNaturalBreathing).toHaveBeenCalledTimes(1);
    expect(f.persist.mock.calls[0][0].journey).toMatchObject({naturalBreathingAtSeconds:96,snapshot:{breathing:'4-7-8'}});
  });
  it('hides sound, rejoins the current stage, and cannot extend the advertised duration',()=>{
    const f=fixture(),engine=new DeterministicSessionEngine(f.clock,f.clock,f.audio);
    engine.start(createSnapshot(createJourneyConfig('beyond')));engine.setVisible(false);f.clock.jump(1081000);engine.setVisible(true);
    expect(f.audio.enter.mock.calls.at(-1)![0]).toMatchObject({resuming:true,stage:{journeySection:'expansion'}});
    f.clock.jump(1019000);engine.reconcile();expect(engine.getState().result!.actualDurationSeconds).toBe(2100);
  });
});

describe('real app journey setup and preparation tour',()=>{
  it('shows the new exact journey choices and approved recorded guidance',()=>{
    const f=fixture();render(<Meditate runtime={f.runtime} state={f.runtime.getState()} onTimer={()=>{}}/>);
    expect(screen.getByRole('heading',{name:'Meditate'})).toBeInTheDocument();expect(screen.getAllByText('33:00').length).toBeGreaterThan(0);expect(screen.getByText('48:00')).toBeInTheDocument();
    expect(screen.getAllByRole('button',{name:/^(Choose|Selected:)/})).toHaveLength(JOURNEYS.length);
    expect(screen.queryByText(/New spoken guidance has not been added/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Journey voice level')).not.toBeDisabled();
  });
  it('starts the selected fixed journey and honors its guidance and customization',async()=>{
    const f=fixture();render(<Meditate runtime={f.runtime} state={f.runtime.getState()} onTimer={()=>{}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Choose Beyond the Familiar'}));fireEvent.change(screen.getByLabelText('Guidance'),{target:{value:'familiar'}});fireEvent.change(screen.getByLabelText('Preparation breathing'),{target:{value:'4-4-6'}});
    fireEvent.click(screen.getByRole('button',{name:'Start journey'}));await waitFor(()=>expect(f.runtime.engine.getState().status).toBe('running'));
    expect(f.runtime.engine.getState().snapshot!.config).toMatchObject({presetId:'beyond',guidance:'familiar',breathing:'4-4-6'});
  });
  it('offers a replayable tour and an actual 18-minute preparation rehearsal',async()=>{
    const f=fixture();render(<Meditate runtime={f.runtime} state={f.runtime.getState()} onTimer={()=>{}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Learn the Preparation'}));expect(screen.getByRole('heading',{name:'Energy Conversion Box'})).toBeInTheDocument();
    for(let i=0;i<6;i++)fireEvent.click(screen.getByRole('button',{name:'Next step'}));
    fireEvent.click(screen.getByRole('button',{name:'Start 18-minute rehearsal'}));await waitFor(()=>expect(f.runtime.engine.getState().status).toBe('running'));
    expect(f.runtime.engine.getState().snapshot!.plannedDurationSeconds).toBe(1080);
  });
});

describe('native-node scheduling contract',()=>{
  function audioFixture(){
    const clock=new FakeTiming(),sources:any[]=[],gains:any[]=[];
    const parameter=()=>({value:1,setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),setTargetAtTime:vi.fn(),cancelScheduledValues:vi.fn()});
    const source=(kind:string)=>{const s={kind,type:'',frequency:parameter(),connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn(),buffer:undefined,onended:undefined};sources.push(s);return s;};
    const context={currentTime:10,state:'running',sampleRate:48000,createGain:()=>{const g={gain:parameter(),connect:vi.fn(),disconnect:vi.fn()};gains.push(g);return g;},createOscillator:()=>source('oscillator'),createBufferSource:()=>source('buffer')};
    const audio=new JourneyAudio(clock,()=>({context:context as unknown as AudioContext,input:{} as AudioNode}),async()=>undefined,()=>{});
    return{audio,clock,context,sources,gains};
  }
  it('schedules every note on AudioContext time, centered, with stationary hold frequency',()=>{
    const f=audioFixture();f.audio.begin(createJourneyConfig('foundation',{breathing:'4-7-8'}),0,'one');f.audio.play();
    expect(f.sources).toHaveLength(76);expect(f.sources[0].start).toHaveBeenCalledWith(100);expect(f.sources[18].start).toHaveBeenCalledWith(118);
    expect(f.sources.slice(4,11).map(s=>s.frequency.setValueAtTime.mock.calls[0][0])).toEqual(Array(7).fill(noteHz('hold-in',0,7)));
    expect(f.sources.every(s=>s.stop.mock.calls[0][0]-s.start.mock.calls[0][0]<1)).toBe(true);
  });
  it('schedules a single native oscillator frequency per attack without ramps',()=>{
    const f=audioFixture();f.audio.begin(createJourneyConfig('foundation'),0,'one');f.audio.play();
    expect(f.sources).toHaveLength(180);expect(f.sources.every(s=>s.frequency.setValueAtTime.mock.calls.length===1&&s.frequency.linearRampToValueAtTime.mock.calls.length===0)).toBe(true);
  });
  it('cleans all pending attacks on hide and resumes only at the next full inhale',()=>{
    const f=audioFixture();f.audio.begin(createJourneyConfig('foundation',{breathing:'4-7-8'}),0,'one');f.audio.play();f.audio.suspend();
    expect(f.audio.diagnostics().activeTracks).toBe(0);expect(f.sources.every(s=>s.disconnect.mock.calls.length)).toBe(true);
    f.clock.jump(96000);f.context.currentTime=106;const old=f.sources.length;f.audio.play(true);
    expect(f.sources[old].start).toHaveBeenCalledWith(119);expect(f.audio.diagnostics().naturalUntilSeconds).toBe(109);
    f.audio.stop();expect(f.audio.diagnostics().activeTracks).toBe(0);
  });
  it('natural breathing removes current and future tones without changing timing',()=>{
    const f=audioFixture();f.audio.begin(createJourneyConfig('foundation'),0,'one');f.audio.play();f.audio.breatheNaturally();
    expect(f.audio.diagnostics()).toMatchObject({activeTracks:0,naturalBreathing:true});expect(f.clock.now()).toBe(0);
  });
  it('never repeats a bowl when hidden and resumed at its exact boundary',()=>{
    const f=audioFixture();Object.assign(f.audio,{bowl:{duration:14.988}});
    f.audio.begin(createJourneyConfig('beyond'),0,'one');f.clock.jump(1080000);f.context.currentTime=1090;f.audio.play();
    expect(f.sources.filter(s=>s.kind==='buffer')).toHaveLength(2);
    f.audio.suspend();f.audio.play(true);
    expect(f.sources.filter(s=>s.kind==='buffer')).toHaveLength(3); // Only the future 27-minute cue is rescheduled.
    f.audio.stop();
  });
});
