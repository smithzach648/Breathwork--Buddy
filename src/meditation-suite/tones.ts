import { timeline, type JourneyConfig } from './model';
import type { Phase } from '../session/config';
import { SOFT_NOTE_SECONDS } from './instrument';
export interface NoteEvent { at: number; phase: Phase; index: number; seconds: number; hz: number; duration: number }
const major = [0, 2, 4, 5, 7, 9, 11];
const step = (index: number) => 12 * Math.floor(index / 7) + major[index % 7];
/** Up to eight attacks span one C-major octave; longer custom phases extend a transposed major scale, capped at MIDI84. */
export function noteHz(phase: Phase, index: number, seconds: number) {
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 20 || !Number.isInteger(index) || index < 0 || index >= seconds) throw new Error('Notes require whole-second phases of 1–20 seconds.');
  if (phase === 'hold-in' || phase === 'hold-out') return 440 * 2 ** (((phase === 'hold-in' ? 72 : 60) - 69) / 12);
  if (phase !== 'inhale' && phase !== 'exhale') throw new Error('No paced note for this phase.');
  const i = phase === 'exhale' ? seconds - 1 - index : index;
  const offset = seconds <= 8 ? step(seconds === 1 ? 3 : Math.round(i * 7 / (seconds - 1))) : step(i);
  const root = seconds <= 8 ? 60 : Math.min(60, 84 - step(seconds - 1));
  return 440 * 2 ** ((root + offset - 69) / 12);
}
/** D3–D4, at most one octave for all phase lengths. Longer phases use evenly spaced log pitches. */
export function softNoteHz(phase:Phase,index:number,seconds:number) {
  noteHz(phase,index,seconds); // Reuse strict window/phase validation, not the previous contour.
  if(phase==='hold-in')return 220;
  if(phase==='hold-out')return 146.8323839587038;
  const pentatonic=[0,3,5,7,10,12],i=phase==='exhale'?seconds-1-index:index;
  const semitones=seconds===1?5:seconds<=6?pentatonic[Math.round(i*5/(seconds-1))]:12*i/(seconds-1);
  return 146.8323839587038*2**(semitones/12);
}
export function phaseNotes(phase: Phase, seconds: number, at = 0): NoteEvent[] {
  if(!Number.isInteger(seconds)||seconds<1||seconds>20||!Number.isFinite(at)||at<0)throw new Error('Notes require a valid phase window.');
  return Array.from({ length: seconds }, (_, index) => ({ at: at + index, phase, index, seconds, hz: noteHz(phase, index, seconds), duration: .72 }));
}
export function journeyNotes(config: JourneyConfig) {
  return timeline(config).flatMap(({ stage, start }) => ['inhale', 'hold-in', 'exhale', 'hold-out'].includes(stage.phase) ? phaseNotes(stage.phase, stage.durationMs / 1000, start).map(event=>config.toneVersion==='major-steps.1'?event:{...event,hz:softNoteHz(event.phase,event.index,event.seconds),duration:SOFT_NOTE_SECONDS}) : []);
}
export function bowlTimes(config: JourneyConfig) { return config.presetId === 'beyond' ? timeline(config).filter(r=>r.stage.journeySection==='expansion'||r.stage.journeySection==='timeless').map(r=>r.start) : []; }
export function returnEnvelope(config: JourneyConfig, elapsedSeconds: number) {
  const end = config.sound.timeline.durationSeconds;
  return Math.max(0, Math.min(1, elapsedSeconds / 5, (end - elapsedSeconds) / 180));
}
