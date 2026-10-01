import type { StageAudio } from '../session/audio-port';
export interface AudioCue {
    id: string;
    at: number;
    until: number;
    breath: boolean;
}
/** Absolute monotonic times. Files never decide the duration or transition. */
export function stageCues(scope: StageAudio): AudioCue[] {
    const { stage, start, deadline } = scope;
    const cues: AudioCue[] = [];
    const voice = (id: string, at = start, until = deadline) => cues.push({ id, at, until, breath: false });
    if (stage.phase === 'inhale' || stage.phase === 'exhale') {
        const inhale = stage.phase === 'inhale';
        voice(inhale ? 'voice.in' : 'voice.out');
        const seconds = (deadline - start) / 1000;
        cues.push({ id: inhale ? (seconds > 4 ? 'breath.in6' : 'breath.in4') : (seconds > 4 ? 'breath.out8' : 'breath.out4'), at: start, until: deadline, breath: true });
    }
    else if (stage.phase === 'retention') {
        voice(stage.durationMs === 90000 ? 'voice.hold90' : 'voice.hold60');
        ['five', 'four', 'three', 'two', 'one'].forEach((word, index) => voice(`voice.${word}`, deadline - (5 - index) * 1000, deadline - (4 - index) * 1000));
    }
    else if (stage.phase === 'recovery-inhale')
        voice('voice.recoveryBreath');
    else
        voice('voice.hold');
    return cues;
}
