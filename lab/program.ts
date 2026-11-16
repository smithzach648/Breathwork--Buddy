import { validateRecipe, type Recipe } from './model';
import { Synth, render, validateOptions, type RenderOptions } from './dsp';
import { JourneySynth, validateJourney, type Journey } from './journey';
export type SoundProgram = Recipe | Journey;
export const isJourney = (p: unknown): p is Journey => !!p && typeof p === 'object' && 'kind' in p && (p as {
  kind: unknown;
}).kind === 'journey';
export const validateProgram = (value: unknown): SoundProgram => isJourney(value) ? validateJourney(value) : validateRecipe(value);
export function createSynth(program: SoundProgram, options: RenderOptions, wave: Float32Array) {
  return isJourney(program) ? new JourneySynth(program, options, wave) : new Synth(program, options, wave);
}
export function renderProgram(program: SoundProgram, options: RenderOptions, wave: Float32Array) {
  if (!isJourney(program)) return render(program, options, wave);
  validateOptions(program, options);
  const synth = new JourneySynth(program, options, wave),
    left = new Float32Array(synth.frames),
    right = new Float32Array(synth.frames);
  for (let frame = 0; frame < synth.frames; frame += 8192) synth.block(left.subarray(frame, frame + 8192), right.subarray(frame, frame + 8192), frame);
  return [left, right] as const;
}
