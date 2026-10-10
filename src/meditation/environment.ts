import type { Preferences } from '../settings/preferences';
import type { PracticeConfig } from '../session/config';
import type { SessionState } from '../session/engine';
import { meditationWindow } from './policy';

export type SignalKind = 'off' | 'legacy' | 'bowl';
/** Additive JSON recipe; local media identities remain device-local. */
export interface SoundRecipe {
    version: 1;
    texture: Preferences['meditation']['noise'];
    source: string;
    noiseLevel: number;
    musicLevel: number;
    loop: boolean;
    mode: Preferences['meditation']['binaural']['mode'];
    toneLevel: number;
    opening: SignalKind;
    closing: SignalKind;
    signalLevel: number;
}
export interface FrozenEnvironment {
    version: 1;
    foundation?: SoundRecipe;
    blocks: Record<string, SoundRecipe>;
    legacyBackground: Preferences['background'];
    legacyMusicLevel: number;
}
const bounded = (n: number, max: number) => Number.isFinite(n) && n >= 0 && n <= max;
export function validRecipe(value: unknown): value is SoundRecipe {
    const r = value as SoundRecipe;
    return !!r && r.version === 1 && ['off','brown','pink','white'].includes(r.texture)
        && typeof r.source === 'string' && /^(none|ambience\.(floating|homeAgain)|local:[A-Za-z0-9_-]{1,128})$/.test(r.source)
        && bounded(r.noiseLevel,.35) && bounded(r.musicLevel,1) && typeof r.loop === 'boolean'
        && ['off','baseline','layered','modulated'].includes(r.mode) && bounded(r.toneLevel,.3)
        && [r.opening,r.closing].every(s=>['off','legacy','bowl'].includes(s)) && bounded(r.signalLevel,1);
}
export function validateRecipe(value: unknown) { if (!validRecipe(value)) throw new Error('This sound recipe needs repair. Choose supported sounds and levels, then save explicitly.'); }
export function recipeFromPreferences(p: Preferences): SoundRecipe {
    return {version:1,texture:p.meditation.noise,source:p.meditation.music?p.background.source:'none',noiseLevel:p.meditation.noiseVolume,musicLevel:p.volumes.ambience,loop:p.background.loop,mode:p.meditation.binaural.mode,toneLevel:p.meditation.binaural.level,opening:p.meditation.openingSignal?(p.meditation.signalKind||'legacy'):'off',closing:p.meditation.completionSignal?(p.meditation.signalKind||'legacy'):'off',signalLevel:p.meditation.signalLevel??p.volumes.signals};
}
export function silentRecipe(p: Preferences): SoundRecipe { return {...recipeFromPreferences(p),texture:'off',source:'none',mode:'off',opening:'off',closing:'off'}; }
export function warmFoundation(p: Preferences): SoundRecipe { return {...recipeFromPreferences(p),texture:'brown',source:'none',mode:'off',opening:'off',closing:'off'}; }
export function customMeditation(p: Preferences): SoundRecipe { return {...recipeFromPreferences(p),opening:'off',closing:'bowl',signalLevel:.5}; }
export function preferencesFromRecipe(p:Preferences,r:SoundRecipe):Preferences {return {...structuredClone(p),background:{source:r.source,loop:r.loop,mode:'off'},volumes:{...p.volumes,ambience:r.musicLevel},meditation:{...p.meditation,noise:r.texture,noiseVolume:r.noiseLevel,music:r.source!=='none',binaural:{mode:r.mode,level:r.toneLevel},openingSignal:r.opening!=='off',completionSignal:r.closing!=='off',signalLevel:r.signalLevel}};}
export function resolveEnvironment(config: PracticeConfig, p: Preferences): FrozenEnvironment {
    const blocks: Record<string,SoundRecipe> = {};
    const routine = config.kind === 'routine' ? config.routine : undefined;
    for (const block of routine?.stages || [config]) if (block.kind === 'meditation') {
        const key = 'id' in block ? String(block.id) : 'standalone';
        const recipe = block.audioPolicy === 'silent' ? silentRecipe(p) : block.audioPolicy === 'custom' ? structuredClone(block.sound!) : recipeFromPreferences(p);
        // Older entire-practice music keeps its transport through inherited meditation.
        if (routine && !routine.foundation && block.audioPolicy === 'defaults' && p.background.mode === 'entire') recipe.source = p.background.source;
        validateRecipe(recipe); blocks[key] = recipe;
    }
    return {version:1,...(routine?.foundation?{foundation:structuredClone(routine.foundation)}:{}),blocks,legacyBackground:structuredClone(p.background),legacyMusicLevel:p.volumes.ambience};
}
export function validEnvironment(e: FrozenEnvironment) {
    return !!e && e.version===1 && (e.foundation===undefined || validRecipe(e.foundation)) && !!e.blocks && typeof e.blocks==='object'&&!Array.isArray(e.blocks)&&Object.keys(e.blocks).length<=20&&Object.values(e.blocks).every(validRecipe)
        && !!e.legacyBackground && ['off','entire','retention','after'].includes(e.legacyBackground.mode) && typeof e.legacyBackground.source==='string' && typeof e.legacyBackground.loop==='boolean' && bounded(e.legacyMusicLevel,1);
}
export function recipeSummary(r: SoundRecipe) {
    const track=r.source==='ambience.floating'?'Floating':r.source==='ambience.homeAgain'?'Home Again':'My Audio';
    return `${r.texture==='off'?(r.source==='none'?'Off':'Selected audio'):r.texture==='brown'?'Warm':'Legacy masking'}${r.source!=='none'?(r.texture!=='off'?' + ':' · ')+track:''} · ${r.mode==='off'?'tones Off':r.mode==='modulated'?'Experimental Modulated':r.mode} · opening ${r.opening} / closing ${r.closing}`;
}
export function activeRecipe(session?: SessionState) {
    const window=meditationWindow(session);
    return window ? session?.snapshot?.meditationSound?.environment?.blocks[window.blockId] : undefined;
}
/** Pure engine-derived presentation intent. No future breathing/retention timers. */
export function environmentPlan(session?: SessionState) {
    if (!session || session.status!=='running') return undefined;
    const e=session.snapshot?.meditationSound?.environment;
    if (!e) return undefined;
    const current=activeRecipe(session);
    let recipe=current || e.foundation;
    let ramp=25;
    if(session.snapshot?.config.kind==='meditation'){const w=meditationWindow(session);if(w)ramp=Math.max(.7,(w.fadeDeadline-(session.stageStart!+session.stage!.durationMs-session.remainingMs))/1000);}
    // A predictable settling/transition window can end at exact silence.
    const stages=session.snapshot!.stages,index=stages.indexOf(session.stage!);
    const next=stages[index+(session.stage?.phase==='natural-settling'?2:1)];
    if ((session.stage?.phase==='natural-settling'||session.stage?.phase==='block-transition') && next?.phase==='meditation') {
        const incoming=e.blocks[next.blockId||'standalone'];
        const remaining=session.remainingMs/1000+(session.stage.phase==='natural-settling'?3:0);
        if (incoming && remaining<=25) {
            recipe=incoming;
            const quiet=incoming.texture==='off'&&incoming.source==='none';
            ramp=quiet||session.stage.phase==='natural-settling'?Math.max(.05,remaining):25;
        }
    }
    if (!recipe) {
        const b=e.legacyBackground,wanted=b.mode==='entire'||b.mode==='retention'&&session.stage?.phase==='retention';
        return {texture:'off' as const,source:wanted?b.source:'none',noiseLevel:0,musicLevel:e.legacyMusicLevel,loop:b.loop,ramp:.7,key:session.sessionId!};
    }
    if (session.stage?.phase==='meditation' && (session.stage.meditationPolicy==='silent'||recipe.texture==='off'&&recipe.source==='none')) ramp=.05;
    return {...recipe,ramp,key:session.sessionId!};
}
