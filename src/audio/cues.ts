import type { StageAudio } from '../session/audio-port';
import type { Phase } from '../session/config';
import { roundVoiceIds, voiceDurations } from './voice-metadata';
export interface AudioCue {
    id: string;
    at: number;
    until: number;
    breath: boolean;
    continuesInto?: Phase;
}
/** Absolute monotonic times. Files never decide the duration or transition. */
export function stageCues(scope: StageAudio): AudioCue[] {
    const { stage, start, deadline } = scope;
    const cues: AudioCue[] = [];
    const voice = (id: string, at = start, until = deadline) => cues.push({ id, at, until, breath: false });
    const breath = (id: string) => cues.push({ id, at: start, until: deadline, breath: true });
    if (stage.phase === 'prepare-inhale') {
        voice('voice.prepare');
        breath('breath.in4');
    }
    else if (stage.phase === 'prepare-exhale')
        breath('breath.out8');
    else if (stage.phase === 'round-announcement')
        voice(roundVoiceIds[stage.round - 1]);
    else if (stage.phase === 'inhale' || stage.phase === 'exhale') {
        const inhale = stage.phase === 'inhale';
        voice(inhale ? 'voice.in' : 'voice.out');
        const seconds = (deadline - start) / 1000;
        cues.push({ id: inhale ? (seconds > 4 ? 'breath.in6' : 'breath.in4') : (seconds > 4 ? 'breath.out8' : 'breath.out4'), at: start, until: deadline, breath: true });
    }
    else if (stage.phase === 'pre-retention-exhale') {
        voice('voice.fullExhale');
        breath('breath.out4');
    }
    else if (stage.phase === 'retention') {
        voice(stage.durationMs === 90000 ? 'voice.hold90' : 'voice.hold60');
        ['five', 'four', 'three', 'two', 'one'].forEach((word, index) => voice(`voice.${word}`, deadline - (5 - index) * 1000, deadline - (4 - index) * 1000));
    }
    else if (stage.phase === 'recovery-inhale') {
        // The sentence is ~5 s: allow only its final word to finish in the quiet hold.
        // Breath/hold deadlines remain 4/15 s; Stop/hide/restart still cancel everything.
        cues.push({ id: 'voice.recoveryInhaleHold15', at: start, until: start + voiceDurations['voice.recoveryInhaleHold15'] * 1000, breath: false, continuesInto: 'recovery-hold' });
        breath('breath.in4');
    }
    else if (stage.phase === 'recovery-exhale') {
        voice('voice.recoveryExhale');
        breath('breath.out8');
    }
    else if (stage.phase === 'hold-in' || stage.phase === 'hold-out')
        voice('voice.hold');
    return cues;
}
