import { describe, it, expect, vi, afterEach } from 'vitest';
import { BrowserAudio } from '../audio/web-audio';
import { BackgroundController } from '../media/background';
import { defaultPreferences } from '../settings/preferences';
import { createSnapshot } from '../session/config';
import { FakeTiming } from './fake-time';
import { PracticeRuntime } from '../session/runtime';
import { WakeLockController } from '../session/wake-lock';
import { BackgroundGain } from '../media/background-gain';
const flush = async () => { for (let i=0;i<30;i++) await Promise.resolve(); };
function precision() {
    const timing = new FakeTiming(), sources: any[] = [];
    const context = { state: 'running', currentTime: 0, destination: {}, resume: vi.fn(async()=>{}), addEventListener: vi.fn(), decodeAudioData: vi.fn(async()=>({duration:3.474286})), createGain:()=>({connect(){},disconnect(){},gain:{setTargetAtTime(){},setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}}}),createBufferSource:()=>{const source={connect(){},disconnect(){},start:vi.fn(),stop:vi.fn(),onended:null};sources.push(source);return source;} };
    const releases:(()=>void)[]=[];
    const fetcher=vi.fn(()=>new Promise<Response>(resolve=>{releases.push(()=>resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)} as Response));}));
    const audio=new BrowserAudio(timing,defaultPreferences(),()=>context as unknown as AudioContext,fetcher);
    const stage=createSnapshot({kind:'patterned',presetId:'box',durationSeconds:180}).stages[0];
    const scope={sessionId:'fresh',stageId:'fresh/0',stage,start:0,deadline:4000};
    return {timing,context,sources,fetcher,audio,scope,release:()=>releases.splice(0).forEach(release=>release())};
}
afterEach(()=>vi.useRealTimers());
describe('permanent stabilization regressions',()=>{
    it('still rejects expired cues during reconciliation rather than replaying them',async()=>{
        const f=precision();await f.audio.unlock();f.audio.enter(f.scope);f.timing.jump(350);f.release();await flush();
        expect(f.audio.diagnostics().skipped).toBeGreaterThan(0);expect(f.sources).toHaveLength(0);
    });
    it('warm Prepare is entered once even with unlock and repeated running statechange',async()=>{
        const f=precision();await f.audio.unlock();f.release();await flush();
        const unlocking=f.audio.unlock();f.audio.enter(f.scope);await unlocking;await flush();
        const callback=f.context.addEventListener.mock.calls[0][1] as ()=>void;callback();callback();await flush();
        expect(f.sources).toHaveLength(2);expect(f.context.resume).not.toHaveBeenCalled();
    });
    it('cold readiness waits before the clock begins and Start Again has a fresh Prepare',async()=>{
        const f=precision();const runtime=new PracticeRuntime(f.timing,f.timing,f.audio,new WakeLockController(undefined,()=>true),async()=>{});
        const config={kind:'patterned' as const,presetId:'box' as const,durationSeconds:180};
        const starting=runtime.start(config);await flush();f.timing.jump(350);expect(runtime.getState().starting).toBe(true);expect(runtime.engine.getState().status).toBe('idle');
        f.release();await starting;await flush();expect(f.sources).toHaveLength(2);expect(runtime.engine.getState().stageStart).toBe(350);
        const id=runtime.engine.getState().sessionId;runtime.engine.stop();await runtime.start(config);await flush();
        expect(runtime.engine.getState().sessionId).not.toBe(id);expect(f.sources).toHaveLength(4);runtime.engine.stop();
    });
    it('cancelled pending start cannot leak Prepare into a rapid replacement',async()=>{
        const f=precision();const runtime=new PracticeRuntime(f.timing,f.timing,f.audio,new WakeLockController(undefined,()=>true),async()=>{});
        const config={kind:'patterned' as const,presetId:'coherent' as const,durationSeconds:180};
        const old=runtime.start(config);await flush();runtime.cancelStart();const fresh=runtime.start(config);await flush();f.release();await Promise.all([old,fresh]);await flush();
        expect(f.sources).toHaveLength(2);runtime.engine.stop();
    });
    it('General OFF suppresses Prepare and ON before the next cached/offline start enables it',async()=>{
        const f=precision();await f.audio.unlock();f.release();await flush();
        const p=defaultPreferences();p.guidance.generalVoice=false;f.audio.setPreferences(p);f.audio.enter(f.scope);await flush();expect(f.sources).toHaveLength(1);
        f.audio.cancelSession('fresh');p.guidance.generalVoice=true;f.audio.setPreferences(p);f.fetcher.mockRejectedValue(new Error('offline'));
        f.audio.enter({...f.scope,sessionId:'next',stageId:'next/0'});await flush();expect(f.sources).toHaveLength(3);
    });
    it('missing or hung files resolve readiness without starting a second clock',async()=>{
        vi.useFakeTimers();const f=precision();await f.audio.unlock();const ready=f.audio.readyForStart();await vi.advanceTimersByTimeAsync(5001);await ready;expect(f.audio.diagnostics().failures).toContain('voice.prepare');
    });
    it('countdown gaps hold one duck and restore once to the same stable retention level',async()=>{
        vi.useFakeTimers();let volume=0;const trace:number[]=[];
        const element={paused:true,ended:false,currentTime:12,duration:600,loop:false,src:'',preload:'',get volume(){return volume;},set volume(v:number){volume=v;trace.push(v);},addEventListener(){},removeAttribute(){},load(){},pause(){this.paused=true;},async play(){this.paused=false;}};
        const controller=new BackgroundController({resolve:async()=>({url:'online:test',owned:false,name:'test'})},()=>element as unknown as HTMLAudioElement);
        const p=defaultPreferences();p.background={source:'ambience.floating',mode:'retention',loop:true};controller.setPreferences(p);await flush();
        const snapshot=createSnapshot({kind:'hormesis',presetId:'hormesis-60',intervalSeconds:2,cycles:20,retentions:[60,60,60],recoveryHoldSeconds:15});
        controller.sync({status:'running',sessionId:'s',snapshot,stage:snapshot.stages.find(s=>s.phase==='retention'),remainingMs:5000,elapsedMs:0,roundsCompleted:0,stagesCompleted:0,releaseAvailable:true});await flush();await vi.advanceTimersByTimeAsync(750);
        controller.setDucking(true);await vi.advanceTimersByTimeAsync(900);expect(volume).toBeCloseTo(.128);
        controller.setDucking(false);await vi.advanceTimersByTimeAsync(110);const gapPeak=volume;controller.setDucking(true);await vi.advanceTimersByTimeAsync(900);
        expect(gapPeak).toBeCloseTo(.128);expect(volume).toBeCloseTo(.128);
        controller.setDucking(false);await vi.advanceTimersByTimeAsync(575);expect(volume).toBeCloseTo(.32);
        const writes=trace.length;await vi.advanceTimersByTimeAsync(1000);expect(trace).toHaveLength(writes);controller.dispose();
    });
    it('reset cancels an old restore and overlapping fade requests settle once',async()=>{
        vi.useFakeTimers();const element={volume:0};const paused=vi.fn();const gain=new BackgroundGain(element as HTMLAudioElement,paused);
        gain.play();await vi.advanceTimersByTimeAsync(750);gain.setVoice(true);await vi.advanceTimersByTimeAsync(275);gain.setVoice(false);
        gain.reset();gain.play();gain.play();await vi.advanceTimersByTimeAsync(750);
        expect(element.volume).toBeCloseTo(.32);expect(gain.diagnostics().pendingRestore).toBe(false);expect(gain.diagnostics().pendingFrame).toBe(false);expect(paused).not.toHaveBeenCalled();gain.reset();
    });
    it('Release clears duck state and fades without a volume jump before next entry',async()=>{
        vi.useFakeTimers();const element={volume:0};const pause=vi.fn();const gain=new BackgroundGain(element as HTMLAudioElement,pause);gain.play();await vi.advanceTimersByTimeAsync(750);gain.setVoice(true);await vi.advanceTimersByTimeAsync(275);
        gain.pause();expect(element.volume).toBeCloseTo(.128);await vi.advanceTimersByTimeAsync(750);expect(element.volume).toBe(0);expect(pause).toHaveBeenCalledTimes(1);
        gain.play();await vi.advanceTimersByTimeAsync(750);expect(element.volume).toBeCloseTo(.32);gain.reset();
    });
});
