import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BuddyDatabase } from '../storage/database';
import { RoutineRepository } from '../routines/repository';
import { validateRoutine, newBlock } from '../routines/model';
import { createSnapshot, compileStages, type PracticeConfig } from '../session/config';
import { DeterministicSessionEngine } from '../session/engine';
import { FakeTiming } from './fake-time';
import type { Routine, RoutineStage } from '../types/domain';
import { Routines } from '../features/routines/Routines';
import { PracticeRuntime, canActivateUpdate, type RuntimeAudio } from '../session/runtime';
import { WakeLockController } from '../session/wake-lock';
import { BackgroundController } from '../media/background';
import { defaultPreferences } from '../settings/preferences';
const flush = async () => { for (let i=0;i<30;i++) await Promise.resolve(); };
const patterned = (): RoutineStage => ({ ...newBlock(), durationSeconds: 180 });
const hormesis = (): RoutineStage => ({ id: crypto.randomUUID(), kind: 'hormesis', presetId: 'hormesis-progressive', intervalSeconds: 2, cycles: 20, retentions: [60,90,90], recoveryHoldSeconds: 15 });
const routine = (stages: RoutineStage[] = [patterned(), hormesis()]): Routine => ({ id: crypto.randomUUID(), name: 'Morning Reset', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), stages });
const config = (row: Routine): PracticeConfig => ({ kind:'routine', routine: row });
function store() { const db = new BuddyDatabase(`routine-${crypto.randomUUID()}`); return { db, repository: new RoutineRepository(db) }; }
describe('routine storage and domain boundary', () => {
    it('creates, reads, lists, edits stable identity, duplicates with new IDs, reopens and deletes', async () => {
        const { db, repository } = store(); const original = await repository.save(routine());
        expect(await repository.read(original.id)).toEqual(original); expect(await repository.list()).toHaveLength(1);
        const updated = await repository.save({ ...original, name:'Evening Reset' }); expect(updated.id).toBe(original.id);expect(updated.createdAt).toBe(original.createdAt);expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(original.updatedAt));
        const copy = await repository.duplicate(updated.id); expect(copy.id).not.toBe(updated.id);expect(copy.name).toBe('Evening Reset copy');expect(copy.stages[0].id).not.toBe(updated.stages[0].id);
        const name = db.name; db.close(); const reopened = new BuddyDatabase(name), repo = new RoutineRepository(reopened);expect(await repo.list()).toHaveLength(2);await repo.remove(copy.id);expect(await repo.list()).toHaveLength(1);await reopened.delete();
    });
    it('uses schema 3 without rewriting preferences, history, media, journal, routines or metadata', async () => {
        const { db, repository } = store();await db.open();expect(db.verno).toBe(3);
        await db.preferences.put(defaultPreferences());await db.journal.put({ id:'journal',createdAt:'2026-10-07' } as any);await db.migrations.put({ id:'migration',completedAt:'2026-10-07',sourceVersion:'1' });await db.media.put({ id:'offline:test',blob:new Blob(['audio']),importedAt:'2026-10-07' } as any);await db.history.put({ id:'history',startedAt:'2026-10-07',routineId:'box',outcome:'completed' } as any);
        const before=await Promise.all([db.preferences.toArray(),db.journal.toArray(),db.migrations.toArray(),db.media.toArray(),db.history.toArray()]);await repository.save(routine());expect(await Promise.all([db.preferences.toArray(),db.journal.toArray(),db.migrations.toArray(),db.media.toArray(),db.history.toArray()])).toEqual(before);await db.delete();
    });
    it.each([
        ['blank name', (row:any)=>row.name=' '], ['long name',(row:any)=>row.name='x'.repeat(81)], ['empty',(row:any)=>row.stages=[]], ['too many',(row:any)=>row.stages=Array.from({length:21},patterned)], ['bad id',(row:any)=>row.stages[0].id='bad/id'], ['duplicate ids',(row:any)=>row.stages[1].id=row.stages[0].id], ['preset',(row:any)=>row.stages[0].presetId='meditation'], ['duration',(row:any)=>row.stages[0].durationSeconds=181], ['cadence',(row:any)=>row.stages[1].intervalSeconds=4], ['cycles',(row:any)=>row.stages[1].cycles=25], ['retentions',(row:any)=>row.stages[1].retentions=[60,90]], ['recovery',(row:any)=>row.stages[1].recoveryHoldSeconds=12], ['null block',(row:any)=>row.stages[0]=null], ['legacy block',(row:any)=>row.stages[0]={id:'legacy',kind:'meditation'}], ['bad date',(row:any)=>row.createdAt='invalid'], ['sparse blocks',(row:any)=>delete row.stages[0]],
    ])('rejects %s before compilation or persistence', (_name, change) => { const row=routine();change(row);expect(()=>validateRoutine(row)).toThrow();expect(()=>createSnapshot(config(row))).toThrow(); });
    it('keeps corrupt rows visible but cannot start or duplicate them',async()=>{const {db,repository}=store();const row={...routine(),stages:[{id:'old',kind:'meditation'}]} as any;await db.routines.put(row);expect(await repository.list()).toHaveLength(1);await expect(repository.read(row.id)).rejects.toThrow();await expect(repository.duplicate(row.id)).rejects.toThrow();await repository.remove(row.id);expect(await repository.list()).toHaveLength(0);await db.delete();});
});
describe('one compiled immutable routine',()=>{
    it.each([[patterned()], [hormesis()], [patterned(),hormesis()], [hormesis(),patterned()], [patterned(),patterned(),patterned()]])('compiles %j with one Prepare and quiet transitions', (...blocks: RoutineStage[]) => {
        const row=routine(blocks),snapshot=createSnapshot(config(row));expect(snapshot.stages.filter(stage=>stage.phase.startsWith('prepare-'))).toHaveLength(3);expect(snapshot.stages.filter(stage=>stage.phase==='block-transition')).toHaveLength(blocks.length-1);
        expect(snapshot.stages.filter(stage=>stage.phase==='block-transition').every(stage=>stage.durationMs===3000)).toBe(true);
        expect([...new Set(snapshot.stages.flatMap(stage=>stage.blockId?[stage.blockId]:[]))]).toEqual(blocks.map(block=>block.id));
        expect(snapshot.plannedDurationSeconds).toBeCloseTo(13+(blocks.length-1)*3+blocks.reduce((sum,block)=>sum+compileStages(block).slice(3).reduce((n,stage)=>n+stage.durationMs,0)/1000,0));expect(Object.isFrozen(snapshot.config)).toBe(true);
    });
    it('editing saved data during execution cannot mutate the active snapshot or Start Again configuration',async()=>{
        const {db,repository}=store();const row=await repository.save(routine());const time=new FakeTiming(),engine=new DeterministicSessionEngine(time,time);engine.start(createSnapshot(config(row)));const snapshot=engine.getState().snapshot!;
        await repository.save({...row,name:'Edited',stages:[patterned()]});expect(snapshot.name).toBe('Morning Reset');expect(snapshot.config.kind==='routine'&&snapshot.config.routine.stages).toHaveLength(2);expect(()=>{(snapshot.stages as any).push({});}).toThrow();engine.stop();engine.start(createSnapshot(snapshot.config));expect(engine.getState().snapshot!.name).toBe('Morning Reset');engine.stop();await db.delete();
    });
    it('Release shortens only the retention, transitions once, and completes one parent result',()=>{
        const row=routine(),time=new FakeTiming(),audio={enter:vi.fn(),cancelStage:vi.fn(),cancelSession:vi.fn()},engine=new DeterministicSessionEngine(time,time,audio);engine.start(createSnapshot(config(row)));
        time.advance(193000);expect(engine.getState().stage?.phase).toBe('block-transition');expect(engine.getState().status).toBe('running');time.advance(3000);expect(engine.getState().stage?.phase).toBe('round-announcement');
        while(engine.getState().stage?.phase!=='retention')time.advance(engine.getState().remainingMs);time.advance(12000);engine.releaseRetention();expect(engine.getState().stage?.phase).toBe('recovery-inhale');time.advance(1000000);
        const result=engine.getState().result!;expect(result.routineId).toBe(row.id);expect(result.routineName).toBe(row.name);expect(result.blocksCompleted).toBe(2);expect(result.totalBlocks).toBe(2);expect(result.blocks?.map(block=>block.outcome)).toEqual(['completed','completed']);expect(result.blocks?.[1].retentions[0]).toMatchObject({blockId:row.stages[1].id,durationSeconds:12,outcome:'released'});expect(audio.cancelSession).toHaveBeenCalledTimes(1);
    });
    it('Stop cancels the whole plan, marks untouched blocks, and rejects stale callbacks after restart',()=>{
        const row=routine(),time=new FakeTiming(),engine=new DeterministicSessionEngine(time,time);engine.start(createSnapshot(config(row)));time.advance(20000);const oldId=engine.getState().sessionId,oldJobs=time.jobs.map(job=>job.callback);engine.stop();const result=engine.getState().result!;expect(result.blocks?.map(block=>block.outcome)).toEqual(['cancelled','not-started']);expect(result.blocksCompleted).toBe(0);engine.start(createSnapshot(config(row)));oldJobs.forEach(callback=>callback());expect(engine.getState().sessionId).not.toBe(oldId);expect(engine.getState().stage?.phase).toBe('prepare-inhale');engine.stop();
    });
    it('one wake lock, one update boundary, and one persistence call span all blocks',async()=>{
        const time=new FakeTiming(),release=vi.fn(async()=>{}),request=vi.fn(async()=>({released:false,release,addEventListener(){}})),save=vi.fn(async()=>{});
        const audio:RuntimeAudio={enter(){},cancelStage(){},cancelSession(){},unlock:async()=>{},setPreferences(){},resynchronize(){},diagnostics:()=>({scheduled:0,skipped:0,failures:[],playing:0,state:'running'}),subscribe:()=>()=>{}};
        const runtime=new PracticeRuntime(time,time,audio,new WakeLockController(request,()=>true),save);runtime.start(config(routine()));await flush();time.advance(193000);expect(canActivateUpdate(runtime.engine.getState().status)).toBe(false);expect(request).toHaveBeenCalledTimes(1);expect(release).not.toHaveBeenCalled();expect(save).not.toHaveBeenCalled();time.advance(1000000);await flush();expect(save).toHaveBeenCalledTimes(1);expect(release).toHaveBeenCalledTimes(1);
    });
    it.each(['entire','retention','after'] as const)('background %s follows the whole routine with preserved retention position',async(mode)=>{
        const element={paused:true,ended:false,volume:0,currentTime:0,duration:600,preload:'',src:'',loop:false,addEventListener(){},removeAttribute(){},load(){},pause(){this.paused=true;},play:vi.fn(async()=>{element.paused=false;})};
        const background=new BackgroundController({resolve:async()=>({url:'test',owned:false,name:'test'})},()=>element as unknown as HTMLAudioElement);const p=defaultPreferences();p.background={source:'ambience.floating',mode,loop:true};background.setPreferences(p);await flush();
        const time=new FakeTiming(),engine=new DeterministicSessionEngine(time,time);engine.subscribe(()=>background.sync(engine.getState()));engine.start(createSnapshot(config(routine())));await flush();expect(element.play).toHaveBeenCalledTimes(mode==='entire'?1:0);
        time.advance(196000);await flush();expect(element.play).toHaveBeenCalledTimes(mode==='entire'?1:0);while(engine.getState().stage?.phase!=='retention')time.advance(engine.getState().remainingMs);await flush();expect(element.play).toHaveBeenCalledTimes(mode==='after'?0:1);element.currentTime=12;
        time.advance(1000000);await flush();expect(element.play).toHaveBeenCalledTimes(mode==='after'?1:mode==='retention'?3:1);background.dispose();
    });
});
describe('accessible builder failures and repair',()=>{
    it('keeps an unsaved draft after save failure and provides labeled reordering controls',async()=>{
        const {db,repository}=store();render(<Routines repository={repository} onStart={async()=>{}} onBack={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'Create routine'}));fireEvent.change(screen.getByLabelText('Routine name'),{target:{value:'My draft'}});fireEvent.click(screen.getByRole('button',{name:'Add block'}));fireEvent.change(screen.getByLabelText('Block 2 practice'),{target:{value:'box'}});fireEvent.click(screen.getByRole('button',{name:'Move block 2 up'}));expect(screen.getByLabelText('Block 1 practice')).toHaveValue('box');
        vi.spyOn(db.routines,'put').mockRejectedValueOnce(new Error('Storage full'));fireEvent.click(screen.getByRole('button',{name:'Save routine'}));await screen.findByRole('alert');expect(screen.getByLabelText('Routine name')).toHaveValue('My draft');expect(screen.getByLabelText('Block 1 practice')).toHaveValue('box');fireEvent.click(screen.getByRole('button',{name:'Save routine'}));await screen.findByRole('heading',{name:'My Routines'});expect(await repository.list()).toHaveLength(1);await db.delete();
    });
    it('corrupt records remain repairable and delete failure retains a clear confirmation',async()=>{
        const {db,repository}=store(),row={...routine(),stages:[]} as Routine;await db.routines.put(row);render(<Routines repository={repository} onStart={async()=>{}} onBack={()=>{}}/>);await screen.findByRole('button',{name:'Edit Morning Reset'});expect(screen.getByRole('button',{name:'Start Morning Reset'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Delete Morning Reset'}));const dialog=screen.getByRole('alertdialog');vi.spyOn(db.routines,'delete').mockRejectedValueOnce(new Error('Denied'));fireEvent.click(within(dialog).getByRole('button',{name:'Confirm delete'}));await screen.findByRole('alert');expect(await repository.list()).toHaveLength(1);fireEvent.click(screen.getByRole('button',{name:'Keep routine'}));fireEvent.click(screen.getByRole('button',{name:'Edit Morning Reset'}));fireEvent.click(screen.getByRole('button',{name:'Add block'}));fireEvent.click(screen.getByRole('button',{name:'Save routine'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Start Morning Reset'})).toBeEnabled());await db.delete();
    });
});
