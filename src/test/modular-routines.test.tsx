import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { compileStages, createSnapshot, validateConfig, customDuration, type ExerciseConfig } from '../session/config';
import { blockName, newBlock, repairDraft, validateRoutine } from '../routines/model';
import { BuddyDatabase } from '../storage/database';
import { RoutineRepository } from '../routines/repository';
import { DeterministicSessionEngine } from '../session/engine';
import { FakeTiming } from './fake-time';
import { stageCues } from '../audio/cues';
import { backgroundWanted } from '../meditation/policy';
import { defaultPreferences } from '../settings/preferences';
import { freezeSound } from '../meditation/profile';
import { Routines } from '../features/routines/Routines';
import { PracticeRuntime, type RuntimeAudio } from '../session/runtime';
import { WakeLockController } from '../session/wake-lock';
import { BlockDetails } from '../features/history/BlockDetails';
import type { Routine, RoutineStage } from '../types/domain';

const custom = (changes: Partial<Extract<ExerciseConfig, { kind: 'custom-pattern' }>> = {}): RoutineStage => ({ id: crypto.randomUUID(), kind: 'custom-pattern', presetId: 'custom-pattern', inhaleSeconds: 4, holdInSeconds: 4, exhaleSeconds: 6, holdOutSeconds: 0, cycles: 5, ...changes });
const round = (target: 60 | 90 = 90): RoutineStage => ({ id: crypto.randomUUID(), kind: 'hormesis-round', presetId: 'hormesis-round', intervalSeconds: 2, cycles: 20, retentionSeconds: target });
const settling = (durationSeconds = 120): RoutineStage => ({ id: crypto.randomUUID(), kind: 'settling', presetId: 'settling', durationSeconds });
const meditation = (): Extract<RoutineStage, { kind: 'meditation' }> => ({ id: crypto.randomUUID(), kind: 'meditation', presetId: 'meditation', durationSeconds: 1800, audioPolicy: 'defaults' });
const routine = (stages: RoutineStage[] = [custom(), custom({ holdInSeconds: 7, exhaleSeconds: 8, cycles: 2 }), round(), settling(), meditation()]): Routine => ({ id: crypto.randomUUID(), name: 'Deep Exploration', createdAt: '2026-10-09T12:00:00Z', updatedAt: '2026-10-09T12:00:00Z', stages });
function run(stages?: RoutineStage[]) {
    const row = routine(stages), time = new FakeTiming(), audio = { enter: vi.fn(), cancelStage: vi.fn(), cancelSession: vi.fn() };
    const engine = new DeterministicSessionEngine(time, time, audio);
    engine.start(createSnapshot({ kind: 'routine', routine: row }));
    return { row, time, audio, engine };
}
function until(engine: DeterministicSessionEngine, time: FakeTiming, phase: string) {
    let count = 0;
    while (engine.getState().stage?.phase !== phase && engine.getState().status === 'running') {
        if (++count > 1000) throw new Error('Missing phase');
        time.advance(engine.getState().remainingMs);
    }
    expect(engine.getState().stage?.phase).toBe(phase);
}
const finish = (engine: DeterministicSessionEngine, time: FakeTiming) => { time.jump(1e8); engine.reconcile(); return engine.getState().result!; };

describe('exact custom pattern domain', () => {
    it.each([
        [4,4,6,0,5,70,'Custom 4–4–6 × 5'], [4,7,8,0,2,38,'Custom 4–7–8 × 2'],
        [4,4,6,2,3,48,'Custom 4–4–6–2 × 3'], [6,0,6,0,4,48,'Custom 6–6 × 4'], [4,0,6,2,3,36,'Custom 4–6–2 × 3'],
    ])('compiles %s/%s/%s/%s for %s exact cycles', (inhaleSeconds, holdInSeconds, exhaleSeconds, holdOutSeconds, cycles, seconds, name) => {
        const block = custom({ inhaleSeconds: inhaleSeconds as number, holdInSeconds: holdInSeconds as number, exhaleSeconds: exhaleSeconds as number, holdOutSeconds: holdOutSeconds as number, cycles: cycles as number });
        const stages = compileStages(block).slice(3);
        expect(stages.reduce((n,s) => n+s.durationMs, 0)).toBe((seconds as number)*1000);
        expect(stages.every(s => s.durationMs > 0)).toBe(true);
        expect(stages.filter(s => s.phase === 'inhale')).toHaveLength(cycles as number);
        expect(stages.filter(s => s.phase === 'hold-in')).toHaveLength(holdInSeconds ? cycles as number : 0);
        expect(stages.filter(s => s.phase === 'hold-out')).toHaveLength(holdOutSeconds ? cycles as number : 0);
        expect(stages.at(-1)?.cycle).toBe(cycles);
        expect(blockName(block)).toBe(name);
        expect(stages.every(s => s.totalCycles === cycles)).toBe(true);
    });
    it.each(['inhaleSeconds','exhaleSeconds','holdInSeconds','holdOutSeconds','cycles'] as const)('rejects corrupt %s at every boundary', field => {
        const bad = field.startsWith('hold') ? [-1,21,NaN,Infinity,1.5,'4',null,undefined] : [0,-1,field === 'cycles' ? 101 : 21,NaN,Infinity,1.5,'4',null,undefined];
        for (const value of bad) {
            const block = custom({ [field]: value } as any), row = routine([block]);
            expect(() => validateConfig(block)).toThrow(); expect(() => validateRoutine(row)).toThrow(); expect(() => createSnapshot({ kind:'routine', routine:row })).toThrow();
        }
    });
    it('caps custom duration without rounding/clamping and preserves explicit identity', () => {
        const block = custom({ inhaleSeconds:20, holdInSeconds:20, exhaleSeconds:20, holdOutSeconds:0, cycles:30 });
        expect(customDuration(block as any)).toBe(1800); expect(() => validateConfig(block)).not.toThrow();
        expect(() => validateConfig({ ...block, cycles:31 } as any)).toThrow();
        expect(() => validateConfig({ ...block, presetId:'coherent' } as any)).toThrow();
    });
    it('uses generic deadline-bound In/Out/Hold and no omitted-hold cues', () => {
        const stages = compileStages(custom()).slice(3);
        for (const stage of stages) {
            const cues = stageCues({ stage, start:0, deadline:stage.durationMs, sessionId:'s', stageId:'a' });
            expect(cues.map(c=>c.id)).toContain(stage.phase === 'inhale' ? 'voice.in' : stage.phase === 'exhale' ? 'voice.out' : 'voice.hold');
            expect(cues.every(c=>c.until===stage.durationMs)).toBe(true);
        }
        expect(stages.some(s=>s.phase==='hold-out')).toBe(false);
    });
});

describe('independent round and settling boundaries', () => {
    it.each([2,3] as const)('shares established one-round recovery at %s second cadence', intervalSeconds => {
        for (const cycles of [20,30,40] as const) for (const retentionSeconds of [60,90] as const) {
            const block = { ...round(retentionSeconds), intervalSeconds, cycles } as RoutineStage;
            const stages = compileStages(block).slice(3);
            expect(stages.filter(s=>s.phase==='inhale')).toHaveLength(cycles);
            expect(stages.filter(s=>s.phase==='exhale')).toHaveLength(cycles-1);
            expect(stages.filter(s=>s.phase==='retention')).toHaveLength(1);
            expect(stages.every(s=>s.round===1 && s.totalRounds===1)).toBe(true);
            expect(stages.some(s=>s.phase==='round-announcement')).toBe(false);
            expect(stages.slice(-6).map(s=>[s.phase,s.durationMs])).toEqual([['pre-retention-exhale',4000],['retention',retentionSeconds*1000],['recovery-inhale',4000],['recovery-hold',15000],['recovery-exhale',6000],['round-settle',3000]]);
            expect(stages.reduce((n,s)=>n+s.durationMs,0)).toBe((2*cycles*intervalSeconds+4-intervalSeconds+retentionSeconds+28)*1000);
        }
    });
    it.each([['cycles',0],['cycles',25],['intervalSeconds',1],['intervalSeconds',4],['retentionSeconds',0],['retentionSeconds',120],['retentionSeconds','90'],['presetId','hormesis-60']])('rejects round %s=%s', (field,value) => {
        const block = { ...round(), [field]:value } as any; expect(()=>validateRoutine(routine([block]))).toThrow(); expect(()=>compileStages(block)).toThrow();
    });
    it.each([30,120,600])('settles for %s seconds with no cues or holds', seconds => {
        const stage = compileStages(settling(seconds)).slice(3); expect(stage).toHaveLength(1); expect(stage[0]).toMatchObject({phase:'natural-settling',durationMs:seconds*1000,cycle:0,totalCycles:0});
        expect(stageCues({ stage:stage[0],start:0,deadline:seconds*1000,stageId:'a',sessionId:'s' })).toEqual([]);
    });
    it.each([0,29,601,NaN,Infinity,120.5,'120',null])('rejects invalid settling %s', seconds => { expect(()=>compileStages(settling(seconds as number))).toThrow(); });
    it('legacy full prescriptions retain every announcement and exact old timing', () => {
        for (const intervalSeconds of [2,3] as const) {
            const block:ExerciseConfig = {kind:'hormesis',presetId:'hormesis-progressive',intervalSeconds,cycles:20,retentions:[60,90,90],recoveryHoldSeconds:15};
            const stages=compileStages(block); expect(stages.filter(s=>s.phase==='retention').map(s=>s.durationMs)).toEqual([60000,90000,90000]);
            expect(stages.filter(s=>s.phase==='round-announcement').map(s=>[s.label,s.durationMs])).toEqual([['Round 1',3326],['Round 2',2046],['Final round',2203]]);
            expect(stages.filter(s=>s.phase==='pre-retention-exhale')).toHaveLength(3);
            expect(stages.filter(s=>s.phase==='recovery-hold').every(s=>s.durationMs===15000)).toBe(true);
        }
    });
});

describe('one authoritative parent across modular blocks', () => {
    it('executes the exact reference ordering, cycles, Prepare and transitions', () => {
        const {engine,time,row}=run(); const snapshot=engine.getState().snapshot!;
        expect(snapshot.stages.filter(s=>s.phase.startsWith('prepare-'))).toHaveLength(3);
        expect(snapshot.stages.filter(s=>s.phase==='block-transition')).toHaveLength(4);
        expect(snapshot.plannedDurationSeconds).toBe(2253);
        time.advance(13000); expect(engine.getState().stage).toMatchObject({phase:'inhale',blockId:row.stages[0].id,cycle:1});
        time.advance(70000); expect(engine.getState().stage?.phase).toBe('block-transition');
        time.advance(3000); expect(engine.getState().stage?.blockId).toBe(row.stages[1].id);
        time.advance(38000); expect(engine.getState().stage?.phase).toBe('block-transition');
        const result=finish(engine,time); expect(result.blocks?.map(b=>b.outcome)).toEqual(Array(5).fill('completed'));
        expect(result.blocks?.map(b=>b.customPattern?.completedCycles)).toEqual([5,2,undefined,undefined,undefined]);
        expect(result.actualDurationSeconds).toBe(snapshot.plannedDurationSeconds); expect(result.retentions).toHaveLength(1);
    });
    it.each([0,1,84999,85000,89999,90000])('Release after %s ms is idempotent and clears retention before recovery', offset => {
        const {engine,time,audio}=run([round(),settling(),meditation()]); until(engine,time,'retention');
        const token=engine.getState().stageId!, stale=time.jobs.filter(j=>!j.cancelled).map(j=>j.callback), planned=engine.getState().snapshot!.plannedDurationSeconds;
        time.advance(offset); engine.releaseRetention(); engine.releaseRetention();
        expect(engine.getState().stage?.phase).toBe('recovery-inhale'); expect(audio.cancelStage).toHaveBeenCalledWith(token);
        stale.forEach(cb=>cb()); expect(engine.getState().stage?.phase).toBe('recovery-inhale');
        time.advance(28000); expect(engine.getState().stage?.phase).toBe('block-transition'); time.advance(3000);
        expect(engine.getState().stage?.phase).toBe('natural-settling'); time.advance(120000); time.advance(3000);
        expect(engine.getState().stage?.phase).toBe('meditation');
        const result=finish(engine,time); expect(result.retentions).toHaveLength(1); expect(result.retentions![0]).toMatchObject({ durationSeconds:offset/1000,outcome:offset===90000?'completed':'released' });
        expect(result.actualDurationSeconds).toBeCloseTo(planned-(90-offset/1000)); expect(result.blocks?.[0].hormesisRound?.recoveryCompleted).toBe(true);
        expect(audio.cancelSession).toHaveBeenCalledTimes(1);
    });
    it('safety smoke: immediate Release, full recovery, timed settling, meditation, partial stop', () => {
        const {engine,time}=run([round(),settling(),meditation()]); until(engine,time,'retention'); engine.releaseRetention();
        time.advance(4000); expect(engine.getState().stage?.phase).toBe('recovery-hold'); time.advance(15000); expect(engine.getState().stage?.phase).toBe('recovery-exhale');
        time.advance(6000); expect(engine.getState().stage?.phase).toBe('round-settle'); time.advance(3000); time.advance(3000); expect(engine.getState().stage?.phase).toBe('natural-settling');
        time.advance(120000); time.advance(3000); time.advance(10000); engine.stop('ended-early'); engine.releaseRetention();
        const result=engine.getState().result!; expect(result.blocks?.map(b=>b.outcome)).toEqual(['completed','completed','cancelled']); expect(result.blocks?.[2].actualDurationSeconds).toBe(10); expect(result.retentions).toHaveLength(1); expect(result.retentions![0].durationSeconds).toBe(0);
    });
    it('counts only full cycles when stopped inside a hold', () => {
        const {engine,time}=run([custom(),settling()]); time.advance(13000+14000+5000); engine.stop();
        const result=engine.getState().result!; expect(result.blocks?.[0].customPattern).toMatchObject({requestedCycles:5,completedCycles:1}); expect(result.blocks?.[1].outcome).toBe('not-started'); expect(result.blocks?.[0].actualDurationSeconds).toBe(19);
    });
    it('stopping recovery reports incomplete, keeps actual hold, and never rewards a round', () => {
        const {engine,time}=run([round(),settling()]); until(engine,time,'retention'); time.advance(3000); engine.releaseRetention(); time.advance(4000); engine.stop();
        expect(engine.getState().result?.blocks?.[0].hormesisRound?.recoveryCompleted).toBe(false); expect(engine.getState().roundsCompleted).toBe(0);
        expect(engine.getState().result?.retentions![0].durationSeconds).toBe(3); expect(engine.getState().result?.blocksCompleted).toBe(0);
    });
    it('multiple separate rounds have scoped releases, no wrong announcements or overlapping holds', () => {
        const {engine,time,row}=run([round(60),custom(),round(90),settling()]); until(engine,time,'retention'); engine.releaseRetention(); time.advance(28000); time.advance(3000); time.advance(70000); time.advance(3000); until(engine,time,'retention');
        expect(engine.getState().stage?.blockId).toBe(row.stages[2].id); time.advance(7000); engine.releaseRetention(); const result=finish(engine,time);
        expect(result.retentions?.map(r=>[r.blockId,r.durationSeconds])).toEqual([[row.stages[0].id,0],[row.stages[2].id,7]]);
        expect(engine.getState().snapshot!.stages.some(s=>s.phase==='round-announcement')).toBe(false); expect(result.blocksCompleted).toBe(4);
    });
    it('Stop/Start Again freezes timing and sound and ignores hidden/stale old work', () => {
        const {engine,time,row}=run(); const sound=freezeSound(defaultPreferences()); const snapshot=createSnapshot({kind:'routine',routine:row},undefined,undefined,sound);
        engine.stop(); engine.start(snapshot); time.advance(19000); const stale=time.jobs.map(j=>j.callback); engine.setVisible(false); time.jump(70000); engine.setVisible(true); engine.stop();
        (row.stages[0] as any).cycles=90; (row as any).stages=[]; engine.start(createSnapshot(snapshot.config,undefined,undefined,snapshot.meditationSound)); stale.forEach(cb=>cb());
        expect(engine.getState().stage?.phase).toBe('prepare-inhale'); expect(engine.getState().snapshot!.config).toEqual(snapshot.config); expect(engine.getState().snapshot!.meditationSound).toEqual(sound); engine.stop();
    });
    it('retention-only background works for independent rounds and stops during settling', () => {
        const {engine,time}=run([round(),settling()]); const p=defaultPreferences(); p.background.mode='retention'; until(engine,time,'retention'); expect(backgroundWanted(engine.getState(),p)).toBe(true); engine.releaseRetention(); expect(backgroundWanted(engine.getState(),p)).toBe(false); time.advance(31000); expect(backgroundWanted(engine.getState(),p)).toBe(false); engine.stop();
    });
    it('runtime persists once, cleans up once, and preferences cannot mutate the frozen sound', async () => {
        const time=new FakeTiming(),persist=vi.fn(async()=>{}),release=vi.fn(async()=>{});
        const audio:RuntimeAudio={enter(){},cancelStage(){},cancelSession:vi.fn(),unlock:async()=>{},setPreferences(){},resynchronize(){},diagnostics:()=>({scheduled:0,skipped:0,failures:[],playing:0,state:'running'}),subscribe:()=>()=>{}};
        const runtime=new PracticeRuntime(time,time,audio,new WakeLockController(async()=>({released:false,release,addEventListener(){}}),()=>true),persist);
        const p=defaultPreferences(); p.meditation.binaural.mode='layered'; runtime.preferencesChanged(p); await runtime.start({kind:'routine',routine:routine([round(),settling(),meditation()])});
        const sound=runtime.engine.getState().snapshot!.meditationSound; p.meditation.binaural.mode='off'; runtime.preferencesChanged(p); expect(runtime.engine.getState().snapshot!.meditationSound).toEqual(sound);
        until(runtime.engine,time,'retention'); runtime.engine.releaseRetention(); time.advance(31000); time.advance(123000); runtime.engine.stop('ended-early'); time.jump(1e8); runtime.engine.reconcile();
        for(let i=0;i<30;i++)await Promise.resolve(); expect(persist).toHaveBeenCalledTimes(1); expect(release).toHaveBeenCalledTimes(1);
    });
});

describe('additive storage, repair and editor', () => {
    it('reopens mixed records, retains all local tables, and edits only the chosen block', async () => {
        const db=new BuddyDatabase(`modular-${crypto.randomUUID()}`),repo=new RoutineRepository(db);
        const legacy=routine([newBlock(),{id:crypto.randomUUID(),kind:'hormesis',presetId:'hormesis-60',intervalSeconds:2,cycles:30,retentions:[60,60,60],recoveryHoldSeconds:15}, {...meditation(),durationSeconds:300,audioPolicy:'silent'}]);
        const old=await repo.save(legacy),saved=await repo.save(routine([newBlock(),custom(),round(),settling(),meditation()]));
        await db.preferences.put(defaultPreferences()); await db.history.put({id:'old',routineId:'box',startedAt:'2026-10-09',endedAt:'2026-10-09',actualDurationSeconds:60,outcome:'completed',stagesCompleted:4});
        await db.media.put({id:'local:test',blob:new Blob(['keep this']),importedAt:'2026-10-09'} as any); await db.journal.put({id:'j',createdAt:'2026-10-09'} as any); await db.migrations.put({id:'m',completedAt:'2026-10-09',sourceVersion:'1'});
        const tables=()=>Promise.all([db.preferences.toArray(),db.history.toArray(),db.media.toArray(),db.journal.toArray(),db.migrations.toArray()]); const before=await tables();
        const changed=structuredClone(saved); (changed.stages[1] as any).cycles=2; await repo.save(changed); expect(await repo.read(old.id)).toEqual(old); expect((await repo.read(saved.id)).stages.filter((_,i)=>i!==1)).toEqual(saved.stages.filter((_,i)=>i!==1)); expect(await tables()).toEqual(before);
        const copy=await repo.duplicate(saved.id); expect(copy.stages.every((b,i)=>b.id!==saved.stages[i].id)).toBe(true); expect(copy.stages.map(b=>({...b,id:''}))).toEqual(changed.stages.map(b=>({...b,id:''})));
        db.close(); const reopened=new BuddyDatabase(db.name),reopenedRepo=new RoutineRepository(reopened); expect(reopened.verno).toBe(3); expect((await reopenedRepo.read(saved.id)).stages).toEqual(changed.stages); await reopenedRepo.remove(copy.id); expect(await reopenedRepo.list()).toHaveLength(2); await reopened.delete();
    });
    it('failed writes and unknown future kinds keep originals intact until explicit repair', async () => {
        const db=new BuddyDatabase(`repair-${crypto.randomUUID()}`),repo=new RoutineRepository(db),saved=await repo.save(routine());
        vi.spyOn(db.routines,'put').mockRejectedValueOnce(new Error('Storage full')); await expect(repo.save({...saved,name:'new'})).rejects.toThrow(); expect(await repo.read(saved.id)).toEqual(saved);
        const corrupt={...saved,id:'future',stages:[{id:'future-stage',kind:'future'}]} as any; await db.routines.put(corrupt); await expect(repo.read('future')).rejects.toThrow(); expect(await repo.list()).toHaveLength(2);
        const draft=repairDraft(corrupt); expect(draft.id).toBe('future'); expect((await db.routines.get('future'))!.stages).toEqual(corrupt.stages); await repo.save(draft); expect(await repo.read('future')).toMatchObject({stages:[{kind:'patterned'}]}); await db.delete();
    });
    it('builds/saves the full reference from labeled controls and retains every setting on duplicate/reorder', async () => {
        const db=new BuddyDatabase(`editor-${crypto.randomUUID()}`),repo=new RoutineRepository(db),start=vi.fn(async()=>{});
        render(<Routines repository={repo} onStart={start} onBack={()=>{}}/>); fireEvent.click(screen.getByRole('button',{name:'Create routine'})); fireEvent.change(screen.getByLabelText('Routine name'),{target:{value:'Deep Exploration'}});
        const type=(n:number,value:string)=>fireEvent.change(screen.getByLabelText(`Block ${n} practice`),{target:{value}});
        type(1,'custom-pattern'); expect(screen.getByText(/1:10 of breathing/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button',{name:'Duplicate block 1'})); type(2,'custom-pattern'); fireEvent.change(screen.getByLabelText('Block 2 hold after inhale seconds (0 = No hold)'),{target:{value:'7'}}); fireEvent.change(screen.getByLabelText('Block 2 exhale seconds'),{target:{value:'8'}}); fireEvent.change(screen.getByLabelText('Block 2 cycles'),{target:{value:'2'}});
        for (const [n,value] of [[3,'hormesis-round'],[4,'settling'],[5,'meditation']] as const) { fireEvent.click(screen.getByRole('button',{name:'Add block'})); type(n,value); }
        fireEvent.change(screen.getByLabelText('Block 5 meditation minutes'),{target:{value:'30'}}); fireEvent.click(screen.getByRole('button',{name:'Move block 4 up'})); fireEvent.click(screen.getByRole('button',{name:'Move block 3 down'}));
        fireEvent.click(screen.getByRole('button',{name:'Save routine'})); await screen.findByRole('button',{name:'Start Deep Exploration'});
        const rows=await repo.list(); expect(rows).toHaveLength(1); expect(rows[0].stages.map(b=>b.kind)).toEqual(['custom-pattern','custom-pattern','hormesis-round','settling','meditation']); expect(rows[0].stages[1]).toMatchObject({holdInSeconds:7,exhaleSeconds:8,cycles:2,holdOutSeconds:0});
        expect(rows[0].stages[2]).toMatchObject({cycles:20,intervalSeconds:2,retentionSeconds:90}); expect(rows[0].stages[3]).toMatchObject({durationSeconds:120}); expect(new Set(rows[0].stages.map(b=>b.id)).size).toBe(5);
        fireEvent.click(screen.getByRole('button',{name:'Start Deep Exploration'})); expect(start).toHaveBeenCalledWith(rows[0].id); await db.delete();
    });
    it('shows invalid custom values in context and preserves the editable draft', async () => {
        const db=new BuddyDatabase(`invalid-${crypto.randomUUID()}`),repo=new RoutineRepository(db);
        render(<Routines repository={repo} onStart={async()=>{}} onBack={()=>{}}/>); fireEvent.click(screen.getByRole('button',{name:'Create routine'})); fireEvent.change(screen.getByLabelText('Block 1 practice'),{target:{value:'custom-pattern'}}); fireEvent.change(screen.getByLabelText('Block 1 inhale seconds'),{target:{value:''}});
        expect(screen.getByRole('alert')).toHaveTextContent('Use whole seconds'); expect(screen.getByLabelText('Block 1 inhale seconds')).toHaveValue(null); expect(await repo.list()).toEqual([]); await db.delete();
    });
    it('renders concise new History metadata alongside old optional records', () => {
        const {engine,time}=run([custom(),round(),settling()]); const result=finish(engine,time); render(<ul>{result.blocks!.map(block=><li key={block.id}><BlockDetails block={block}/></li>)}</ul>);
        expect(screen.getByText(/5 of 5 cycles/)).toBeInTheDocument(); expect(screen.getByText(/90s optional target.*recovery completed/)).toBeInTheDocument();
        const old={id:'old',name:'old',kind:'patterned',outcome:'completed',plannedDurationSeconds:180,actualDurationSeconds:180,retentions:[]} as const;
        expect(()=>render(<BlockDetails block={old as any}/>)).not.toThrow();
    });
});
