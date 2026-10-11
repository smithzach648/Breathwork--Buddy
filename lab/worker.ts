import { warmSteps, render, measure, spectrum, encodeWav, type RenderOptions } from './dsp';
import { validateRecipe, type Recipe } from './model';
const scope = self as unknown as {
  postMessage: (data: unknown, transfer?: Transferable[]) => void;
};
let cache: {
  key: string;
  wave: Float32Array;
} | undefined;
self.onmessage = async (event: MessageEvent<{
  id: number;
  recipe: Recipe;
  options: RenderOptions;
  task: 'wave' | 'render';
  spectra?: boolean;
}>) => {
  const {
    id,
    options,
    task
  } = event.data;
  try {
    const recipe = validateRecipe(event.data.recipe),
      key = `${options.sampleRate}/${recipe.sampleSeed}`;
    if (cache?.key !== key) {
      const steps = warmSteps(options.sampleRate, recipe.sampleSeed);
      let s = steps.next();
      while (!s.done) {
        s = steps.next();
      }
      cache = {
        key,
        wave: s.value
      };
    }
    if (task === 'wave') {
      const copy = cache.wave.slice();
      scope.postMessage({
        id,
        wave: copy
      }, [copy.buffer]);
      return;
    }
    const started = performance.now(),
      channels = render(recipe, options, cache.wave),
      metrics = measure(channels, options.sampleRate),
      wav = encodeWav(channels, options.sampleRate);
    const spectra = event.data.spectra ? channels.map(c => spectrum(c.subarray(Math.min(options.sampleRate, Math.max(0, c.length - (1 << 18)))), options.sampleRate)) : undefined;
    scope.postMessage({
      id,
      wav,
      metrics,
      spectra,
      renderMilliseconds: performance.now() - started
    }, [wav]);
  } catch (error) {
    scope.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
