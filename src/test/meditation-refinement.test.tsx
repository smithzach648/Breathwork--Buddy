import {describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {createJourneyConfig,createLegacyJourneyConfig,compileJourney,validateJourneyConfig,layerMix,effectiveMix,nextInhale} from '../meditation-suite/model';
import {journeyNotes,softNoteHz} from '../meditation-suite/tones';
import {instrumentEnvelope,INSTRUMENTS,SOFT_NOTE_SECONDS} from '../meditation-suite/instrument';
import {changeMix,presetMix,normalizeMix,validMix} from '../meditation-suite/mix';
import {defaultPreferences,normalizePreferences,validPreferences} from '../settings/preferences';
import {narrationPlan,validRecording,hasApprovedNarration,guidanceText} from '../meditation-suite/voice-narration';
import {SCRIPT_CLIPS,LEARN_CLIPS} from '../meditation-suite/narration-content';
import {JourneySynth} from '../audio/acoustic/journey';
import {warm} from '../audio/acoustic/dsp';
import {FakeTiming} from './fake-time';
import {PracticeRuntime} from '../session/runtime';
import {WakeLockController} from '../session/wake-lock';
import {Meditate} from '../features/meditation-suite/Meditate';

describe('versioned refinement and exact preparation budgets',()=>{
  it('keeps old frozen configurations valid and sample-level controls unchanged',()=>{
    const old=createLegacyJourneyConfig('beyond'),bytes=JSON.stringify(old);
    expect(validateJourneyConfig(old)).toEqual(old);expect(layerMix(old)).toBeUndefined();
    expect(old).toMatchObject({schemaVersion:1,toneVersion:'major-steps.1',breathingIntroSeconds:0});
    expect(journeyNotes(old)).toHaveLength(180);expect(JSON.stringify(old)).toBe(bytes);
    expect(effectiveMix(old).levels.warm*3).toBeCloseTo(.8);
  });
  it.each(['foundation','beyond','preparation'] as const)('keeps %s length and stage boundaries with a protected introduction',id=>{
    const config=createJourneyConfig(id),stages=compileJourney(config);
    expect(stages.reduce((n,s)=>n+s.durationMs,0)).toBe(({foundation:1500000,beyond:2100000,preparation:780000})[id]);
    expect(stages[0].durationMs).toBe(90000);expect(stages[1]).toMatchObject({label:'Breathing introduction',durationMs:20000});
    expect(stages.filter(s=>s.journeySection==='breathwork').reduce((n,s)=>n+s.durationMs,0)).toBe(180000);
    expect(config).toMatchObject({schemaVersion:2,toneVersion:'soft-steps.2',narrationVersion:'preparation-voice.2',levels:{environment:1}});
  });
  it.each([['5-5',160,0],['4-4-6',154,6],['4-7-8',76,84],['natural',0,160]] as const)('%s uses complete cycles after its intro', (breathing,count,settle)=>{
    const config=createJourneyConfig('foundation',{breathing}),notes=journeyNotes(config);
    expect(notes).toHaveLength(count);if(count)expect(notes[0].at).toBe(110);
    const stages=compileJourney(config).filter(s=>s.journeySection==='breathwork');
    expect(stages.filter(s=>s.phase==='natural-settling').reduce((n,s)=>n+s.durationMs,0)).toBe(settle*1000);
    if(breathing==='4-7-8')expect(stages.filter(s=>s.phase==='hold-in')).toHaveLength(4);
  });
  it('uses the same timing for Guided, Familiar and voice-muted runs',()=>{
    const a=createJourneyConfig('beyond'),b=createJourneyConfig('beyond',{guidance:'familiar',mix:changeMix(presetMix(),'voice',0)});
    expect(compileJourney(a)).toEqual(compileJourney(b));expect(nextInhale(a,115)).toBe(120);
  });
  it('rejects mixed versions, unrecognized controls, and mutated source recipes',()=>{
    const config=createJourneyConfig('foundation');
    expect(()=>validateJourneyConfig({...config,toneVersion:'major-steps.1'})).toThrow();
    expect(()=>validateJourneyConfig({...config,breathingIntroSeconds:0})).toThrow();
    expect(()=>validateJourneyConfig({...config,levels:{...config.levels,environment:.8}})).toThrow();
    config.sound.stages[1].recipe.noise.level=.2;expect(()=>validateJourneyConfig(config)).toThrow();
  });
  it('reads historical recording pins without treating missing recordings as newly approved',()=>{
    const config=createJourneyConfig('foundation');config.audioAssets.voice=['suite.archived.ecb'];config.audioAssets.voiceSha256={'suite.archived.ecb':'c'.repeat(64)};
    expect(validateJourneyConfig(config).audioAssets).toEqual(config.audioAssets);expect(hasApprovedNarration()).toBe(false);
    config.audioAssets.voiceSha256['suite.archived.ecb']='bad';expect(()=>validateJourneyConfig(config)).toThrow();
  });
});
describe('soft instrument contour and envelopes',()=>{
  it.each(Array.from({length:20},(_,i)=>i+1))('keeps a %is phase within one octave and clearly directional',seconds=>{
    const up=Array.from({length:seconds},(_,i)=>softNoteHz('inhale',i,seconds)),down=Array.from({length:seconds},(_,i)=>softNoteHz('exhale',i,seconds));
    expect(down).toEqual([...up].reverse());expect(Math.max(...up)/Math.min(...up)).toBeLessThanOrEqual(2.000001);
    expect(Math.min(...up)).toBeGreaterThan(140);expect(Math.max(...up)).toBeLessThan(300);
    up.forEach((hz,i)=>{if(i)expect(hz).toBeGreaterThan(up[i-1]);});
  });
  it('repeats stationary, distinct hold registers including a two-pulse final hold',()=>{
    expect(Array.from({length:7},(_,i)=>softNoteHz('hold-in',i,7))).toEqual(Array(7).fill(220));
    expect(softNoteHz('hold-out',0,2)).toBe(softNoteHz('hold-out',1,2));
    expect(softNoteHz('hold-out',0,2)).not.toBe(220);
    const notes=journeyNotes(createJourneyConfig('foundation',{breathing:'4-7-8'}));
    expect(notes.slice(0,19).map(n=>n.at)).toEqual(Array.from({length:19},(_,i)=>110+i));
    expect(notes.slice(4,11).every(n=>n.hz===220)).toBe(true);
  });
  it.each(['felt','wooden'] as const)('%s has bounded partials and a click-free finite non-overlapping envelope',instrument=>{
    const env=instrumentEnvelope(instrument);expect(env[0]).toBe(0);expect(env.at(-1)).toBe(0);
    expect([...env].every(n=>Number.isFinite(n)&&n>=0&&n<=1)).toBe(true);
    expect(INSTRUMENTS[instrument].partials[2]).toBeLessThan(.15);expect(SOFT_NOTE_SECONDS).toBeLessThan(1);
    expect(INSTRUMENTS[instrument].attack).toBeGreaterThanOrEqual(.05);
  });
});
describe('persistent, independently scaled listener mix',()=>{
  it.each(['balanced','immersive','quiet'] as const)('validates %s and keeps arbitrary values separate from preset labels',preset=>{
    const mix=presetMix(preset);expect(validMix(mix)).toBe(true);
    const custom=changeMix(mix,'warm',.23);expect(custom.preset).toBe('custom');expect(custom.levels.binaural).toBe(mix.levels.binaural);
    expect(normalizeMix(custom)).toEqual(custom);expect(presetMix(preset)).toEqual(mix);
  });
  it('normalizes old preferences additively without dropping other values',()=>{
    const old=defaultPreferences();delete old.journeyMix;old.theme='dark';old.volumes.master=.31;
    const p=normalizePreferences(old);expect(p.theme).toBe('dark');expect(p.volumes.master).toBe(.31);expect(p.journeyMix).toEqual(presetMix());
    const changed={...p,journeyMix:changeMix(presetMix(),'binaural',.19)};expect(validPreferences(changed)).toBe(true);expect(normalizePreferences(changed)).toEqual(changed);
    const adapted=normalizeMix({environment:.6,breathingTones:.3,voice:1,bowl:.2}).levels;
    expect(adapted.warm*3).toBeCloseTo(.6,14);expect(adapted).toMatchObject({binaural:.15,breathingTones:.3,voice:1,bowl:.2});
  });
  it.each([NaN,Infinity,-.1,1.01])('rejects unsafe mixer value %s',value=>{expect(()=>changeMix(presetMix(),'warm',value)).toThrow();});
  it('snapshots the selected mix by value',()=>{
    const mix=presetMix(),config=createJourneyConfig('foundation',{mix});mix.levels.warm=.1;
    expect(config.levels.warm).toBe(.7);expect(layerMix(config)).toEqual({warm:2.0999999999999996,binaural:2.4});
  });
  const config=createJourneyConfig('beyond'),rate=48000;
  let wave:Float32Array;
  const samples=(selection:'combined'|'noise'|'tones',start:number,mix?:{warm:number;binaural:number})=>{
    wave??=warm(rate,104729);const synth=new JourneySynth(config.sound,{sampleRate:rate,startSeconds:0,durationSeconds:2100,selection,fade:false},wave),left=new Float32Array(512),right=new Float32Array(512);
    synth.block(left,right,Math.round(start*rate),mix);return [left,right];
  };
  it.each([601,1079.995,1080,1619.995,1620,2000])('isolates noise/tones and remains additive across %is',start=>{
    const noise=samples('noise',start),tones=samples('tones',start),onlyNoise=samples('combined',start,{warm:1,binaural:0}),onlyTones=samples('combined',start,{warm:0,binaural:1}),both=samples('combined',start,{warm:1,binaural:1}),silent=samples('combined',start,{warm:0,binaural:0});
    expect(onlyNoise).toEqual(noise);expect(onlyTones).toEqual(tones);
    for(let c=0;c<2;c++)for(let i=0;i<512;i++){expect(Math.abs(silent[c][i])).toBe(0);expect(both[c][i]).toBeCloseTo(noise[c][i]+tones[c][i],7);}
  });
});
describe('reviewable narration slots and option selection',()=>{
  it('has no approved recordings, and keeps scripts original and versioned',()=>{
    expect(hasApprovedNarration()).toBe(false);expect(Object.values(SCRIPT_CLIPS).every(c=>c.version===2&&c.id.endsWith('.2')&&c.script.length&&c.maxSeconds>0)).toBe(true);expect(LEARN_CLIPS).toHaveLength(7);
  });
  it('selects all disabled-option alternatives and correct breathing instructions',()=>{
    const config=createJourneyConfig('foundation',{humming:false,surroundingSpace:false,affirmation:'spiritual',breathing:'natural'}),plan=narrationPlan(config);
    expect(plan.some(c=>c.clip===SCRIPT_CLIPS.tuningQuiet)).toBe(true);expect(plan.some(c=>c.clip===SCRIPT_CLIPS.spaceNeutral)).toBe(true);expect(plan.some(c=>c.clip===SCRIPT_CLIPS.affirmationSpiritual)).toBe(true);
    expect(guidanceText(config,'breathwork')).not.toContain('rising');expect(plan.some(c=>c.clip===SCRIPT_CLIPS.breathNatural)).toBe(true);
  });
  it.each(['foundation','beyond'] as const)('%s protects notes, bowls and all three return windows',id=>{
    const config=createJourneyConfig(id),plan=narrationPlan(config),breath=plan.find(c=>c.section==='breathwork')!;
    expect([breath.at,breath.end,breath.clip.maxSeconds]).toEqual([90,110,18]);
    expect(breath.end).toBe(journeyNotes(config)[0].at);
    const start=id==='foundation'?1320:1920;expect(plan.filter(c=>c.section==='return').map(c=>c.at)).toEqual([start,start+60,start+120]);
    if(id==='beyond')expect(plan.filter(c=>c.bowlAt!==undefined).map(c=>c.at)).toEqual([1096,1636]);
    for(const cue of plan)expect(cue.at+cue.clip.maxSeconds).toBeLessThan(cue.end);
  });
  it('reuses Familiar clips and suppresses main scene narration without losing the return',()=>{
    const plan=narrationPlan(createJourneyConfig('beyond',{guidance:'familiar'}));
    expect(plan.some(c=>c.section==='expansion'||c.section==='timeless')).toBe(false);expect(plan.filter(c=>c.section==='return')).toHaveLength(3);expect(plan[0].clip).toBe(SCRIPT_CLIPS.ecbBrief);
  });
  it('rejects missing, unapproved, mismatched, unpinned or oversized recordings',()=>{
    const cue=narrationPlan(createJourneyConfig('beyond')).find(c=>c.section==='breathwork')!,asset={...cue.clip,approved:true as const,sha256:'a'.repeat(64),assetId:'approved.local',decodedDurationSeconds:10};
    expect(validRecording(cue,asset,['approved.local'])).toBe(true);
    expect(validRecording(cue,undefined,['approved.local'])).toBe(false);expect(validRecording(cue,asset,[])).toBe(false);
    expect(validRecording(cue,{...asset,decodedDurationSeconds:19},['approved.local'])).toBe(false);expect(validRecording(cue,{...asset,script:'Changed words'},['approved.local'])).toBe(false);
  });
});
describe('approachable mix controls and immutable active configuration',()=>{
  it('switches to Custom, preserves other controls, persists, and resets',()=>{
    const clock=new FakeTiming(),audio={unlock:async()=>{},diagnostics:()=>({scheduled:0,skipped:0,failures:[],playing:0,state:'running'}),subscribe:()=>()=>{},setPreferences(){},resynchronize(){},enter(){},cancelStage(){},cancelSession(){}};
    const runtime=new PracticeRuntime(clock,clock,audio,new WakeLockController(undefined,()=>true)),save=vi.fn();
    render(<Meditate runtime={runtime} state={runtime.getState()} onTimer={()=>{}} preferences={defaultPreferences()} onPreferencesChange={save}/>);
    fireEvent.click(screen.getByRole('button',{name:'Immersive'}));expect(save.mock.calls.at(-1)![0].journeyMix.preset).toBe('immersive');
    fireEvent.change(screen.getByLabelText('Journey warm level'),{target:{value:'.2'}});
    expect(save.mock.calls.at(-1)![0].journeyMix).toMatchObject({preset:'custom',levels:{warm:.2,binaural:.8}});
    expect(screen.getByLabelText('Journey voice level')).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'Reset mix'}));expect(save.mock.calls.at(-1)![0].journeyMix).toEqual(presetMix());
  });
});
