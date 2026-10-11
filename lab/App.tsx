import { useEffect, useRef, useState } from 'react';
import { PRESETS, duplicate, diagnostic, pair, validateRecipe, importRecipe, exportRecipe, gains, ENGINE_VERSION, type Recipe, type Selection, type Pair } from './model';
import { carrier, matchLevels, type RenderOptions } from './dsp';
import { Player, workerJob, download, type RenderResult } from './audio';
import research from './docs/RESEARCH_PROVENANCE.md?raw';
import integration from './docs/INTEGRATION_DESIGN.md?raw';
const STORE = 'breathwork-buddy-acoustic-lab-v1';
const presets = PRESETS;
const fmt = (x: number) => Number(x.toFixed(3));
function NumberField({
  label,
  value,
  min,
  max,
  step = .01,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <label>{label}<input type="number" min={min} max={max} step={step} value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => {
      const n = Number(draft);
      if (draft.trim() && Number.isFinite(n) && n >= min && n <= max) onChange(n);else setDraft(String(value));
    }} onKeyDown={e => {
      if (e.key === 'Enter') e.currentTarget.blur();
    }} /></label>;
}
export default function App() {
  const [recipe, setRecipe] = useState<Recipe>(structuredClone(presets[0])),
    [builtIn, setBuiltIn] = useState(true),
    [selection, setSelection] = useState<Selection>('combined'),
    [duration, setDuration] = useState(30),
    [position, setPosition] = useState(.5),
    [rate, setRate] = useState(48000),
    [long, setLong] = useState(false);
  const [state, setState] = useState('Stopped'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [metrics, setMetrics] = useState<RenderResult>(),
    [saved, setSaved] = useState<Recipe[]>([]),
    [notes, setNotes] = useState(''),
    [prep, setPrep] = useState('No prep'),
    [mask, setMask] = useState(false),
    [reveal, setReveal] = useState(false),
    [comparison, setComparison] = useState(false),
    [aId, setAId] = useState('reference'),
    [bId, setBId] = useState('threshold'),
    [matched, setMatched] = useState<ReturnType<typeof matchLevels>>(),
    [playingLabel, setPlayingLabel] = useState('');
  const player = useRef<Player | null>(null);
  if (!player.current) player.current = new Player(setState);
  const job = useRef<AbortController | null>(null),
    action = useRef(0),
    lastCompare = useRef<{
      a: Recipe;
      b: Recipe;
      options: RenderOptions;
    } | null>(null);
  const choices = [...presets, ...saved, recipe.id.startsWith('draft-') ? recipe : null].filter((r): r is Recipe => !!r);
  const options = (r: Recipe, full = false): RenderOptions => {
    const startSeconds = Math.round(position * r.timeline.durationSeconds * rate) / rate;
    return {
      sampleRate: rate,
      startSeconds,
      durationSeconds: Math.min(full ? r.timeline.durationSeconds : duration, r.timeline.durationSeconds - startSeconds),
      selection
    };
  };
  const stop = async (immediate = false) => {
    ++action.current;
    job.current?.abort();
    job.current = null;
    setBusy(false);
    setPlayingLabel('');
    await player.current!.stop(immediate);
  };
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORE);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed) || parsed.length > 20) throw new Error('Invalid saved lab library');
        setSaved(parsed.map(validateRecipe));
      }
    } catch {
      setError('Saved lab library could not be read. Exported recipes and the main app are unchanged.');
    }
    const hide = () => {
        if (document.hidden) void stop(true);
      },
      leave = () => {
        void stop(true);
      };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', leave);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', leave);
      void stop(true);
    };
  }, []);
  const edit = (change: (r: Recipe) => void) => {
    void stop();
    try {
      const next = builtIn || recipe.sourceClassification !== "original-experiment" ? duplicate(recipe) : structuredClone(recipe);
      change(next);
      setRecipe(validateRecipe(next));
      setBuiltIn(false);
      setMetrics(undefined);
      setMatched(undefined);
      setError('');
    } catch (e) {
      setError(String(e));
    }
  };
  const load = (r: Recipe, isBuiltIn = true) => {
    void stop();
    setRecipe(structuredClone(r));
    setBuiltIn(isBuiltIn);
    setMetrics(undefined);
    setMatched(undefined);
    setError('');
  };
  const begin = async (r = recipe, gain = 1, label = '') => {
    setError('');
    setBusy(true);
    const token = ++action.current;
    try {
      await player.current!.stop();
      if (token !== action.current) return;
      await player.current!.start(r, {
        ...options(r, long),
        matchGain: gain
      });
      if (token === action.current) setPlayingLabel(label || r.name);
    } catch (e) {
      if (token === action.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (token === action.current) setBusy(false);
    }
  };
  const exportAudio = async () => {
    const token = ++action.current;
    job.current?.abort();
    setBusy(true);
    setPlayingLabel('');
    await player.current!.stop();
    if (token !== action.current) return;
    const abort = new AbortController();
    job.current = abort;
    setError('');
    try {
      const o = options(recipe),
        result = await workerJob<RenderResult>('render', recipe, o, true, abort.signal);
      if (token !== action.current) return;
      if (result.metrics.invalidSamples) throw new Error('Invalid samples; export cancelled.');
      setMetrics(result);
      download(`${recipe.id}-${fmt(o.startSeconds)}s.wav`, new Blob([result.wav], {
        type: 'audio/wav'
      }));
      download(`${recipe.id}-render-report.json`, new Blob([JSON.stringify({
        engineVersion: ENGINE_VERSION,
        recipe,
        render: {
          ...o,
          bitDepth: 16,
          noiseSize: 1 << 20,
          algorithm: 'Shared sample DSP; honest excerpt, fades .5s by default'
        },
        ...result,
        wav: undefined
      }, null, 2)], {
        type: 'application/json'
      }));
    } catch (e) {
      if (token === action.current && !(e instanceof DOMException && e.name === 'AbortError')) setError(String(e));
    } finally {
      if (token === action.current) setBusy(false);
    }
  };
  const match = async () => {
    const token = ++action.current;
    job.current?.abort();
    setBusy(true);
    setPlayingLabel('');
    await player.current!.stop();
    if (token !== action.current) return;
    const abort = new AbortController();
    job.current = abort;
    setError('');
    setMatched(undefined);
    setReveal(false);
    try {
      const a = choices.find(r => r.id === aId)!,
        b = choices.find(r => r.id === bId)!;
      if (!a || !b) throw new Error('Choose two available recipes.');
      if (a.timeline.durationSeconds !== b.timeline.durationSeconds) throw new Error('Use recipes with the same session duration for an honest A/B excerpt.');
      const o = options(a),
        ar = await workerJob<RenderResult>('render', a, o, false, abort.signal),
        br = await workerJob<RenderResult>('render', b, o, false, abort.signal);
      if (token !== action.current) return;
      const values = matchLevels(ar.metrics, br.metrics);
      if (values.targetRms < 1e-8) throw new Error('One side is silent. Choose an audible component and level.');
      const swap = mask && (crypto.getRandomValues(new Uint8Array(1))[0] & 1) === 1;
      lastCompare.current = {
        a: structuredClone(swap ? b : a),
        b: structuredClone(swap ? a : b),
        options: o
      };
      setMatched(swap ? {
        ...values,
        a: values.b,
        b: values.a
      } : values);
      setComparison(true);
    } catch (e) {
      if (token === action.current && !(e instanceof DOMException && e.name === 'AbortError')) setError(String(e));
    } finally {
      if (token === action.current) setBusy(false);
    }
  };
  const comparePlay = async (which: 'a' | 'b') => {
    if (!matched || !lastCompare.current) return;
    setError('');
    setBusy(true);
    const token = ++action.current;
    try {
      await player.current!.stop();
      if (token !== action.current) return;
      await player.current!.start(lastCompare.current[which], {
        ...lastCompare.current.options,
        matchGain: matched[which]
      });
      if (token === action.current) setPlayingLabel(mask && !reveal ? `Sample ${which.toUpperCase()}` : lastCompare.current[which].name);
    } catch (e) {
      if (token === action.current) setError(String(e));
    } finally {
      if (token === action.current) setBusy(false);
    }
  };
  const changeSettings = (update: () => void) => {
    void stop();
    update();
    setMatched(undefined);
    setMetrics(undefined);
  };
  const pairEdit = (index: number, change: (p: Pair) => void) => edit(r => change(r.carrierPairs[index]));
  // Lab-only diagnostics for reproducible native QA. No production globals, DB, or graph imports.
  useEffect(() => {
    Object.assign(window, {
      labQA: {
        presets,
        recipe,
        player: player.current,
        workerJob,
        options: options(recipe),
        metrics,
        matched
      }
    });
  }, [recipe, position, duration, selection, metrics, matched, rate]);
  const stateTime = options(recipe).startSeconds;
  const silent = recipe.output.level === 0 || (selection === 'noise' || recipe.output.toneLevel === 0 || gains(recipe).length === 0) && (selection === 'tones' || recipe.noise.kind === 'off' || recipe.noise.level === 0);
  return <main>
    <header><p className="eyebrow">BREATHWORK BUDDY · LOCAL RESEARCH SPACE</p><h1>Acoustic Laboratory</h1><p className="intro">Create the conditions. Release the effort. Let the experience unfold.</p><p>This separate laboratory lets you explore sound before choosing what belongs in your practice.</p><span className="tag">Phase 4C.1 · local only</span></header>
    <aside className="guidance"><strong>Stereo headphones required.</strong> Start at low device volume, seated comfortably. Avoid listening while driving, near machinery, or in water. Stop if dizzy, uncomfortable or overstimulated. Breathwork and retention are not required.<br /><span>Exploratory intentions are not guaranteed states. Headphone comfort and personal experience need your own listening.</span></aside>
    <section aria-labelledby="worlds"><div className="section-title"><h2 id="worlds">Choose a sound environment</h2><span>Four experiments + a familiar control</span></div><div className="worlds">{presets.map(p => <button key={p.id} className={`world ${builtIn && recipe.id === p.id ? 'selected' : ''}`} aria-pressed={builtIn && recipe.id === p.id} onClick={() => load(p)}><span className="world-label">{p.sourceClassification === '4b-reference' ? '4B CONTROL' : p.id === 'threshold' ? 'PUBLISHED TONES + ORIGINAL NOISE' : 'ORIGINAL EXPERIMENT'}</span><strong>{p.name}</strong><span>{p.description}</span><span>{p.carrierPairs.filter(q => q.enabled).map(q => q.curve.length ? `${q.curve.map(k => k.hz).join(' → ')} L / ${q.curve.map(k => k.hz + q.deltaHz).join(' → ')} R Hz` : `${q.leftHz} L / ${q.leftHz + q.deltaHz} R Hz`).join(' · ')}</span><small>Exploratory intention, not guaranteed state</small></button>)}</div></section>
    <section className="listen" aria-labelledby="listen"><div><p className="eyebrow">{builtIn ? 'BUILT-IN · READ-ONLY' : 'MY DRAFT · EDITABLE'}</p><h2 id="listen">{recipe.name}</h2><p>{recipe.intentLabel}. {recipe.noise.kind === 'off' ? 'No noise' : recipe.noise.kind === 'warm-static' ? 'Static, centered 4B Warm' : 'Original coordinated delay movement over 4B Warm'}.</p><p className="carriers">At selected excerpt start: {recipe.carrierPairs.map(p => {
            const hz = carrier(p, stateTime, recipe).hz;
            return `${p.enabled ? '' : 'Off: '}${fmt(hz)} left / ${fmt(hz + p.deltaHz)} right · ${p.deltaHz} Hz intended difference`;
          }).join(' | ')}</p></div>
      {silent && <p className="hint">This component selection is silent. Check enabled pairs, the noise method, and levels before expecting sound.</p>}
      <div className="controls"><label>Listen to<select aria-label="Listen to" value={selection} onChange={e => changeSettings(() => setSelection(e.target.value as Selection))}><option value="combined">Combined</option><option value="tones">Tones only</option><option value="noise">Noise only</option></select></label><label>Excerpt length<select aria-label="Excerpt length" value={duration} onChange={e => changeSettings(() => setDuration(Number(e.target.value)))}>{[15, 30, 60, 120].map(x => <option key={x} value={x}>{x} seconds</option>)}</select></label><label>Listen at<select aria-label="Listen at" value={position} onChange={e => changeSettings(() => setPosition(Number(e.target.value)))}>{[0, .5, .9].map(x => <option key={x} value={x}>{x * 100}% of session</option>)}</select></label><label>Export / playback sample rate<select aria-label="Export / playback sample rate" value={rate} onChange={e => changeSettings(() => setRate(Number(e.target.value)))}><option value={48000}>48,000 Hz</option><option value={44100}>44,100 Hz</option></select></label>
      <NumberField label="Listening level (0–1)" min={0} max={1} value={recipe.output.level} onChange={v => edit(r => {
          r.output.level = v;
        })} /><label className="check"><input type="checkbox" checked={long} onChange={e => changeSettings(() => setLong(e.target.checked))} />Listen until session end (exports stay short)</label></div>
      <p className="hint">Honest excerpt from {fmt(stateTime)}s of a {recipe.timeline.durationSeconds / 60}-minute session. Glides use the steady portion after entry; excerpts do not compress time. New playback restarts at the selected position, with a gentle fade.</p>
      <div className="actions"><button className="primary" disabled={busy} onClick={() => {
          setComparison(false);
          void begin();
        }}>Start stereo preview</button><button className="stop" onClick={() => void stop()}>Stop audio / cancel</button><button disabled={busy} onClick={() => void exportAudio()}>Export stereo WAV</button><button onClick={() => download(`${recipe.id}.json`, new Blob([exportRecipe(recipe)], {
          type: 'application/json'
        }))}>Export recipe JSON</button></div>
      <p role="status" aria-live="polite">{state}{playingLabel ? ` · ${playingLabel}` : ''}{busy ? ' · working…' : ''}</p>{error && <p className="error" role="alert">{error}</p>}
      <details><summary>What this sound contains</summary><p>{recipe.provenance}</p><p>Tones use independent left/right sine carriers. Layered tones also create same-ear and cross-pair differences; the listed differences are intended pair assignments. A mono speaker does not preserve ear isolation.</p><p>Noise comes from the original 4B Warm synthesis, with a repeatable seed. Phase movement shares the same mathematical session clock as the carrier phases. This is not EEG synchronization or a reconstruction of commercial processing.</p><p>Pair energy normalization: {gains(recipe).map(x => `${x.pair.id} ${fmt(x.gain)}`).join(', ')}. Tone level {recipe.output.toneLevel}, noise level {recipe.noise.level}, fixed output trim 0.25. No automatic gain increase or adaptive compressor.</p></details>
    </section>
    <section aria-labelledby="compare"><h2 id="compare">Compare two sounds</h2><p>Match the measured stereo RMS of the same excerpt, by turning down the louder side. This reduces volume bias; it does not fully match perceived loudness.</p><div className="controls"><label>Sample A<select aria-label="Sample A" value={aId} onChange={e => changeSettings(() => setAId(e.target.value))}>{choices.map((r, i) => <option key={`${r.id}-${i}`} value={r.id}>{r.name}</option>)}</select></label><label>Sample B<select aria-label="Sample B" value={bId} onChange={e => changeSettings(() => setBId(e.target.value))}>{choices.map((r, i) => <option key={`${r.id}-${i}`} value={r.id}>{r.name}</option>)}</select></label><label className="check"><input type="checkbox" checked={mask} onChange={e => {
            void stop();
            setMask(e.target.checked);
            setReveal(false);
            setMatched(undefined);
          }} />Hide recipe labels during comparison</label></div><div className="actions"><button disabled={busy} onClick={() => void match()}>Measure and match A/B</button><button disabled={busy || !matched} onClick={() => void comparePlay('a')}>Listen A</button><button disabled={busy || !matched} onClick={() => void comparePlay('b')}>Listen B</button>{mask && <button onClick={() => setReveal(!reveal)}>{reveal ? 'Hide labels' : 'Reveal labels'}</button>}</div>{matched && <p>{matched.method}. Attenuation A {fmt(matched.a)}, B {fmt(matched.b)}. Target RMS {matched.targetRms.toFixed(6)}. Playback restarts; A and B never overlap.</p>}{mask && reveal && lastCompare.current && <p>A: {lastCompare.current.a.name} · B: {lastCompare.current.b.name}</p>}{comparison && mask && !reveal && <p>The two choices above remain visible for setup; their A/B listening order is randomized when you measure with labels hidden. Reveal labels afterward to see the assignment. This personal comparison is not a scientific study.</p>}</section>
    <section aria-labelledby="generator"><h2 id="generator">Manual / advanced generator</h2><p>Editing duplicates a built-in into your draft. The five originals stay available above.</p><div className="actions"><button onClick={() => load(presets.find(p => recipe.id.includes(p.id)) ?? presets[0])}>Reset to original preset</button><button onClick={() => {
          try {
            const custom = duplicate(recipe, recipe.name.replace(/ — my draft$/, '') + ' — saved');
            custom.id = `custom-${Date.now()}`;
            const list = [...saved, custom].slice(-20);
            localStorage.setItem(STORE, JSON.stringify(list));
            setSaved(list);
            setError('');
          } catch (e) {
            setError('Could not save locally: ' + String(e));
          }
        }}>Save As in lab</button><label className="file">Import recipe JSON<input aria-label="Import recipe JSON" type="file" accept=".json,application/json" onChange={async e => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              if (file.size > 65536) throw new Error('Maximum recipe size 64 KiB');
              const imported = importRecipe(await file.text());
              load(imported, false);
            } catch (error) {
              setError(String(error));
            }
            e.target.value = '';
          }} /></label></div>{saved.length > 0 && <label>Restore a saved lab variant<select aria-label="Restore a saved lab variant" defaultValue="" onChange={e => {
          const found = saved.find(r => r.id === e.target.value);
          if (found) load(found, false);
        }}><option value="" disabled>Choose saved variant</option>{saved.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
      <details open><summary>Carrier pairs · left Hz + intended difference</summary><p>Right Hz follows left + difference, including during glides. Range 60–1000 Hz; difference 0–30 Hz; up to six pairs. Audibility varies; do not increase volume to compensate.</p>{recipe.carrierPairs.map((p, index) => <fieldset key={p.id}><legend>Pair {index + 1}</legend><div className="controls"><label className="check"><input type="checkbox" checked={p.enabled} onChange={e => pairEdit(index, q => {
                q.enabled = e.target.checked;
              })} />Enabled</label><label className="check"><input type="checkbox" checked={p.solo} onChange={e => pairEdit(index, q => {
                q.solo = e.target.checked;
              })} />Solo this pair</label><NumberField label={`Pair ${index + 1} left Hz`} value={p.leftHz} min={60} max={1000 - p.deltaHz} step={.25} onChange={v => pairEdit(index, q => {
              q.leftHz = v;
              if (q.curve.length) q.curve[0].hz = v;
            })} /><NumberField label={`Pair ${index + 1} difference Hz`} value={p.deltaHz} min={0} max={Math.min(30, 1000 - Math.max(p.leftHz, ...p.curve.map(k => k.hz)))} step={.25} onChange={v => pairEdit(index, q => {
              q.deltaHz = v;
            })} /><NumberField label={`Pair ${index + 1} relative gain`} value={p.gain} min={0} max={1} onChange={v => pairEdit(index, q => {
              q.gain = v;
            })} /><p>Right: {fmt(p.leftHz + p.deltaHz)} Hz · sine</p></div><div className="actions"><button onClick={() => edit(r => {
              r.carrierPairs.splice(index, 1);
            })}>Remove pair {index + 1}</button><button onClick={() => pairEdit(index, q => {
              q.curve = q.curve.length ? [] : [{
                at: 0,
                hz: q.leftHz
              }, {
                at: .5,
                hz: Math.min(1000 - q.deltaHz, q.leftHz + 80)
              }, {
                at: 1,
                hz: Math.min(1000 - q.deltaHz, q.leftHz + 160)
              }];
            })}>{p.curve.length ? 'Return to fixed carrier' : 'Add gentle glide'}</button></div>{p.curve.length > 0 && <><label>Glide interpolation<select aria-label="Glide interpolation" value={p.interpolation} onChange={e => pairEdit(index, q => {
                q.interpolation = e.target.value as Pair['interpolation'];
              })}><option value="smooth">Smooth easing</option><option value="linear">Linear</option></select></label><div className="controls">{p.curve.map((k, j) => <NumberField key={j} label={`Pair ${index + 1} at ${fmt(k.at * 100)}% steady Hz`} value={k.hz} min={60} max={1000 - p.deltaHz} step={.25} onChange={v => pairEdit(index, q => {
                q.curve[j].hz = v;
                if (j === 0) q.leftHz = v;
              })} />)}</div><p>Waypoints are percentages of {recipe.timeline.durationSeconds - recipe.timeline.entrySeconds - recipe.timeline.returnSeconds}s steady listening. Edit the full JSON for additional timed waypoints (maximum eight).</p></>}</fieldset>)}<button disabled={recipe.carrierPairs.length >= 6} onClick={() => edit(r => r.carrierPairs.push(pair(200, 4, 1, `pair-${Date.now()}`)))}>Add carrier pair</button></details>
      <details><summary>Noise and movement</summary><div className="controls"><label>Noise method<select aria-label="Noise method" value={recipe.noise.kind} onChange={e => edit(r => {
              r.noise.kind = e.target.value as Recipe['noise']['kind'];
              r.noise.stereoRelation = r.noise.kind === 'warm-phased' ? 'correlated-delay' : 'centered';
            })}><option value="off">Off</option><option value="warm-static">Unchanged 4B Warm</option><option value="warm-phased">Experimental Phased Warm</option></select></label><NumberField label="Noise level" value={recipe.noise.level} min={0} max={.35} onChange={v => edit(r => {
            r.noise.level = v;
          })} /><NumberField label="Noise seed (repeatable source)" value={recipe.sampleSeed} min={1} max={4294967295} step={1} onChange={v => edit(r => {
            r.sampleSeed = v;
          })} />{recipe.noise.kind === 'warm-phased' && <><NumberField label="Movement depth (0 = Off)" value={recipe.noise.movementDepth} min={0} max={.8} onChange={v => edit(r => {
              r.noise.movementDepth = v;
            })} /><NumberField label="Movement rate Hz" value={recipe.noise.sweepHz} min={.001} max={.25} step={.001} onChange={v => edit(r => {
              r.noise.sweepHz = v;
            })} /><NumberField label="Delay seconds" value={recipe.noise.delaySeconds} min={.0001} max={.008} step={.0001} onChange={v => edit(r => {
              r.noise.delaySeconds = v;
            })} /><NumberField label="Delayed mix (0–0.30)" value={recipe.noise.mix} min={0} max={.3} onChange={v => edit(r => {
              r.noise.mix = v;
            })} /><NumberField label="Stereo width (0 = centered)" value={recipe.noise.width} min={0} max={1} onChange={v => edit(r => {
              r.noise.width = v;
            })} /></>}</div><button onClick={() => edit(r => {
          r.noise.movementDepth = 0;
          r.modulations.am.enabled = false;
        })}>Modulation Off</button><p>Depth Off freezes both delays at their base value; static comb coloration may remain. Choose Unchanged 4B Warm or mix 0 to bypass the delay entirely. Width changes the relationship between delay sweeps, not left/right volume.</p></details>
      <details><summary>Timeline, tone level and optional amplitude modulation</summary><div className="controls"><NumberField label="Session minutes (10–60)" value={recipe.timeline.durationSeconds / 60} min={10} max={60} step={1} onChange={v => edit(r => {
            const scale = v * 60 / r.timeline.durationSeconds;
            r.timeline.durationSeconds = v * 60;
            r.timeline.entrySeconds *= scale;
            r.timeline.returnSeconds *= scale;
          })} /><NumberField label="Entry seconds" value={recipe.timeline.entrySeconds} min={0} max={600} step={1} onChange={v => edit(r => {
            r.timeline.entrySeconds = v;
          })} /><NumberField label="Return seconds" value={recipe.timeline.returnSeconds} min={0} max={600} step={1} onChange={v => edit(r => {
            r.timeline.returnSeconds = v;
          })} /><NumberField label="Tone level (0–0.30)" value={recipe.output.toneLevel} min={0} max={.3} onChange={v => edit(r => {
            r.output.toneLevel = v;
          })} /><label className="check"><input type="checkbox" checked={recipe.modulations.am.enabled} onChange={e => edit(r => {
              r.modulations.am.enabled = e.target.checked;
            })} />Optional sine amplitude modulation of tones</label><NumberField label="AM rate Hz" value={recipe.modulations.am.rateHz} min={.01} max={40} onChange={v => edit(r => {
            r.modulations.am.rateHz = v;
          })} /><NumberField label="AM depth (0–0.15)" value={recipe.modulations.am.depth} min={0} max={.15} onChange={v => edit(r => {
            r.modulations.am.depth = v;
          })} /><NumberField label="AM right phase radians" value={recipe.modulations.am.channelPhase} min={-Math.PI} max={Math.PI} onChange={v => edit(r => {
            r.modulations.am.channelPhase = v;
          })} /></div><p>Amplitude modulation defaults Off, changes tones only, and has no claimed neurological target. All components share the session time origin.</p></details>
      <details><summary>One-variable comparisons</summary><div className="actions">{(['septon', 'single', 'all4', '375', 'fixed', 'static', 'movement-off'] as const).map((kind, i) => <button key={kind} onClick={() => load(diagnostic(recipe, kind), false)}>{['Published Septon · tones only', 'Single 200 / 204 · tones only', 'Expansion · all 4 Hz', 'Timeless · 3.75 Hz variant', 'Open · fixed 160 / 164', 'Same carriers · static Warm', 'Same recipe · movement Off'][i]}</button>)}</div><p>Use these as drafts in A/B against the original. Choose the matching original before creating its comparison variant.</p></details>
    </section>
    <section aria-labelledby="observations"><h2 id="observations">Your listening notes</h2><p>Personal observations, not EEG measurements. Notes stay here unless you export them.</p><label>Preparation context<select aria-label="Preparation context" value={prep} onChange={e => setPrep(e.target.value)}>{['No prep', 'After breathwork', 'After natural settling', 'Other'].map(x => <option key={x}>{x}</option>)}</select></label><label>Attention, comfort, mental chatter, spatial impression, or distraction<textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="What did you notice? No particular experience is expected." rows={4} /></label><button onClick={() => download('acoustic-lab-notes.json', new Blob([JSON.stringify({
        context: prep,
        notes,
        recipeId: recipe.id,
        excerpt: options(recipe),
        personalObservation: true
      }, null, 2)], {
        type: 'application/json'
      }))}>Export my notes</button></section>
    {metrics && <section><h2>Measured exported audio</h2><p>Stereo 16-bit PCM WAV · {metrics.metrics.sampleRate} Hz · {metrics.metrics.seconds}s · {metrics.wav.byteLength.toLocaleString()} bytes. Render {Math.round(metrics.renderMilliseconds)} ms.</p><div className="metric-grid"><p>Sample peak L / R<strong>{metrics.metrics.peak.map(v => v.toFixed(6)).join(' / ')}</strong></p><p>RMS L / R<strong>{metrics.metrics.rms.map(v => v.toFixed(6)).join(' / ')}</strong></p><p>Channel correlation<strong>{metrics.metrics.correlation.toFixed(6)}</strong></p><p>Invalid samples<strong>{metrics.metrics.invalidSamples}</strong></p></div><p>Sample metrics, not true-peak, sound-pressure, EEG or comfort measurements. Spectrum and one-second RMS/correlation windows are in the downloaded render report.</p></section>}
    <footer>Original generated audio · engine {ENGINE_VERSION} · no recordings copied · no connection to practice settings, routines or History.<br />Keep this tab visible. Browser suspension and phone screen-lock playback are not guaranteed.<br /><button onClick={() => download('RESEARCH_PROVENANCE.md', new Blob([research], {
        type: 'text/markdown'
      }))}>Read research and provenance</button> <button onClick={() => download('INTEGRATION_DESIGN.md', new Blob([integration], {
        type: 'text/markdown'
      }))}>Read future integration boundaries</button></footer>
  </main>;
}
