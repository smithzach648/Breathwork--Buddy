import type { SessionState } from '../session/engine';
import type { Preferences } from '../settings/preferences';
/** One shared interpretation for music and noise, including the lead-in before meditation. */
export function meditationWindow(session?: SessionState) {
    if (!session || session.status !== 'running' || !session.stage || !session.snapshot || session.stageStart === undefined) return undefined;
    const { stages } = session.snapshot;
    const index = stages.indexOf(session.stage);
    let target = index, start = session.stageStart, fadeMs = 0;
    if (index >= 0 && index < 3 && session.stage.phase.startsWith('prepare-')) {
        target = 3; start -= stages.slice(0,index).reduce((sum,stage)=>sum+stage.durationMs,0); fadeMs = 13000;
    } else if (session.stage.phase === 'block-transition') { target = index + 1; fadeMs = 3000; }
    else if (session.stage.phase === 'meditation') {
        fadeMs = index === 3 ? 13000 : 3000; start -= fadeMs;
    } else return undefined;
    const stage = stages[target];
    if (stage?.phase !== 'meditation') return undefined;
    return { key: `${session.sessionId}/meditation/${stage.blockId || 'standalone'}`, silent: stage.meditationPolicy === 'silent', start, fadeDeadline: start + fadeMs, meditationStart:start+fadeMs,durationSeconds:stage.durationMs/1000,leadSeconds:fadeMs/1000 };
}
export function backgroundWanted(session: SessionState | undefined, preferences: Preferences): boolean {
    if (!session) return false;
    const meditation = meditationWindow(session);
    if (meditation) return !meditation.silent && (session?.snapshot?.meditationSound?.music ?? preferences.meditation.music);
    const mode = preferences.background.mode;
    return mode === 'entire' && session.status === 'running' || mode === 'retention' && session.status === 'running' && (session.snapshot?.config.kind === 'hormesis' || session.stage?.blockKind === 'hormesis') && session.stage?.phase === 'retention' || mode === 'after' && session.status === 'completed';
}
