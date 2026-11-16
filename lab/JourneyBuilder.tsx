import { useEffect, useState } from 'react';
import { download, type Player } from './audio';
import type { Recipe } from './model';
import type { RenderOptions } from './dsp';
import type { SoundProgram } from './program';
import { defaultJourney, validateJourney, updatedJourney, stageFrom, journeySchedule, journeyAt, exportJourney, importJourney, type Journey } from './journey';
const STORE = 'breathwork-buddy-acoustic-journeys-v1';
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
function Numeric({
  label,
  value,
  min,
  max,
  step = 1,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <label>{label}<input aria-label={label} type="number" value={draft} min={min} max={max} step={step} onChange={e => setDraft(e.target.value)} onBlur={() => {
      const n = Number(draft);
      if (draft.trim() && Number.isFinite(n) && n >= min && n <= max) onChange(n);else setDraft(String(value));
    }} onKeyDown={e => {
      if (e.key === 'Enter') e.currentTarget.blur();
    }} /></label>;
}
interface Props {
  choices: Recipe[];
  player: Player;
  busy: boolean;
  state: string;
  error: string;
  onStop: () => Promise<void>;
  onPlay: (program: SoundProgram, options: RenderOptions, label: string) => Promise<void>;
  onExport: (program: SoundProgram, options: RenderOptions) => Promise<void>;
}
export default function JourneyBuilder({
  choices,
  player,
  busy,
  state,
  error,
  onStop,
  onPlay,
  onExport
}: Props) {
  const [journey, setJourney] = useState(defaultJourney),
    [library, setLibrary] = useState<Journey[]>([]),
    [message, setMessage] = useState(''),
    [problem, setProblem] = useState(''),
    [adding, setAdding] = useState('threshold'),
    [length, setLength] = useState(30),
    [rate, setRate] = useState(48000),
    [position, setPosition] = useState('start'),
    [current, setCurrent] = useState<ReturnType<Player['diagnostics']>>();
  const [nameDraft, setNameDraft] = useState(journey.name);
  useEffect(() => setNameDraft(journey.name), [journey.name]);
  useEffect(() => {
    try {
      const text = localStorage.getItem(STORE);
      if (text) {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed) || parsed.length > 12) throw new Error('Unsupported saved journey library');
        setLibrary(parsed.map(validateJourney));
      }
    } catch (e) {
      setProblem('Could not read the saved journey library. Its original data is unchanged. ' + String(e));
    }
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setCurrent(player.diagnostics()), 500);
    return () => clearInterval(timer);
  }, [player]);
  const schedule = journeySchedule(journey),
    total = journey.timeline.durationSeconds;
  const positions = [{
    id: 'start',
    label: 'Journey beginning',
    at: 0
  }, ...schedule.slice(1).flatMap(s => [{
    id: `transition-${s.id}`,
    label: `Transition into ${s.recipe.name} (${time(s.start - journey.transitionSeconds)}–${time(s.start)})`,
    at: Math.max(0, s.start - journey.transitionSeconds - 2)
  }, {
    id: `stop-${s.id}`,
    label: `${s.recipe.name} begins (${time(s.start)})`,
    at: s.start
  }])];
  const from = positions.find(p => p.id === position)?.at ?? 0;
  const options = (full = false): RenderOptions => ({
    sampleRate: rate,
    startSeconds: full ? 0 : from,
    durationSeconds: full ? total : Math.min(length, total - from),
    selection: 'combined'
  });
  const active = current?.programId === journey.id && current.activeGraphs > 0;
  const at = active ? journeyAt(journey, current.positionSeconds ?? 0) : null;
  const update = (change: (j: Journey) => void, fitBlend = false) => {
    void onStop();
    setMessage('');
    setProblem('');
    try {
      const draft = structuredClone(journey);
      change(draft);
      if (fitBlend) {
        const max = Math.floor(Math.min(...draft.stages.map(s => s.durationSeconds)) / 2);
        if (draft.transitionSeconds > max) {
          draft.transitionSeconds = max;
          setMessage(`Transition shortened to ${max} seconds to fit the shortest stop.`);
        }
      }
      setJourney(updatedJourney(draft, () => {}));
      setPosition('start');
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };
  const restore = (j: Journey) => {
    void onStop();
    setJourney(structuredClone(j));
    setPosition('start');
    setMessage('Journey loaded.');
    setProblem('');
  };
  const save = (asNew = false) => {
    try {
      const j = validateJourney(asNew ? {
          ...journey,
          id: 'journey-' + crypto.randomUUID()
        } : journey),
        exists = library.some(x => x.id === j.id);
      if (!exists && library.length >= 12) throw new Error('The lab holds up to 12 journeys. Export a copy before making more.');
      const next = [...library.filter(x => x.id !== j.id), j];
      localStorage.setItem(STORE, JSON.stringify(next));
      setLibrary(next);
      if (asNew) {
        void onStop();
        setJourney(j);
      }
      setMessage('Journey saved in this browser. Export JSON for a portable copy.');
      setProblem('');
    } catch (e) {
      setProblem(String(e));
    }
  };
  return <section className="journey" aria-labelledby="journey-title">
    <p className="eyebrow">BUILD A CONTINUOUS EXPERIENCE</p><h2 id="journey-title">Build a journey</h2>
    <p>Let one environment flow into the next. Choose your order, time in each, and transition length. The Warm bed continues while the tones and spatial texture gently blend.</p>
    <div className="controls"><label>Journey name<input aria-label="Journey name" value={nameDraft} maxLength={80} onChange={e => setNameDraft(e.target.value)} onBlur={() => {
          if (nameDraft.trim()) update(j => {
            j.name = nameDraft;
          });else setNameDraft(journey.name);
        }} onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }} /></label><Numeric label="Journey transition seconds" value={journey.transitionSeconds} min={1} max={Math.min(120, Math.floor(Math.min(...journey.stages.map(s => s.durationSeconds)) / 2))} onChange={v => update(j => {
        j.transitionSeconds = v;
      })} /><Numeric label="Journey listening level (0–1)" value={journey.output.level} min={0} max={1} step={.05} onChange={v => update(j => {
        j.output.level = v;
      })} /></div>
    <ol className="journey-strip" aria-label="Journey overview">{schedule.map(s => <li key={s.id} style={{
        flexGrow: s.durationSeconds
      }} className={active && at?.current?.id === s.id ? 'active' : ''}><span>{s.recipe.name}</span><small>{time(s.start)}–{time(s.end)}</small></li>)}</ol>
    <p className="journey-total"><strong>Total: {time(total)} · {journey.stages.length} environments</strong>. Each transition happens during the last {journey.transitionSeconds} seconds of the outgoing stop, so the total stays exactly as shown.</p>
    <ol className="journey-stops">{schedule.map((s, index) => <li key={s.id}><fieldset><legend>Journey stop {index + 1} · {time(s.start)}–{time(s.end)}</legend><div className="controls"><label>Environment<select aria-label={`Journey stop ${index + 1} environment`} value={s.recipe.id} onChange={e => {
                const selected = choices.find(p => p.id === e.target.value);
                if (selected) update(j => {
                  j.stages[index] = stageFrom(selected, s.durationSeconds, s.id, j.sampleSeed);
                });
              }}>{!choices.some(p => p.id === s.recipe.id) && <option value={s.recipe.id}>{s.recipe.name} (saved snapshot)</option>}{choices.map((p, i) => <option key={`${p.id}-${i}`} value={p.id}>{p.name}</option>)}</select></label><Numeric label={`Journey stop ${index + 1} minutes`} value={s.durationSeconds / 60} min={.5} max={60} step={.5} onChange={v => update(j => {
              j.stages[index].durationSeconds = Math.round(v * 60);
            }, true)} /></div><div className="actions"><button disabled={index === 0} onClick={() => update(j => {
              [j.stages[index - 1], j.stages[index]] = [j.stages[index], j.stages[index - 1]];
            })}>Move stop {index + 1} earlier</button><button disabled={index === schedule.length - 1} onClick={() => update(j => {
              [j.stages[index + 1], j.stages[index]] = [j.stages[index], j.stages[index + 1]];
            })}>Move stop {index + 1} later</button><button disabled={schedule.length >= 12} onClick={() => update(j => {
              j.stages.splice(index + 1, 0, {
                id: crypto.randomUUID(),
                durationSeconds: s.durationSeconds,
                recipe: structuredClone(s.recipe)
              });
            })}>Repeat stop {index + 1}</button><button disabled={schedule.length === 1} onClick={() => update(j => {
              j.stages.splice(index, 1);
            })}>Remove stop {index + 1}</button></div><p className="hint">{s.recipe.carrierPairs.filter(p => p.enabled).map(p => `${p.leftHz}/${p.leftHz + p.deltaHz} Hz${p.curve.length ? ' with glide' : ''}`).join(' · ')} · {s.recipe.noise.kind === 'warm-static' ? 'static Warm' : s.recipe.noise.kind === 'warm-phased' ? 'phased Warm' : 'noise Off'} · settings pinned into this journey</p></fieldset></li>)}</ol>
    <div className="controls"><label>Add environment<select aria-label="Add journey environment" value={adding} onChange={e => setAdding(e.target.value)}>{choices.map((p, i) => <option key={`${p.id}-${i}`} value={p.id}>{p.name}</option>)}</select></label></div><div className="actions"><button disabled={schedule.length >= 12} onClick={() => {
        const selected = choices.find(p => p.id === adding);
        if (selected) update(j => j.stages.push(stageFrom(selected, 300, crypto.randomUUID(), j.sampleSeed)));
      }}>Add journey stop</button><button onClick={() => update(j => {
        j.stages.forEach(s => {
          s.durationSeconds = 30;
        });
        j.transitionSeconds = Math.min(j.transitionSeconds, 10);
        j.name = 'Short test journey';
      })}>Make a short test version</button><button onClick={() => restore(defaultJourney())}>Reset journey</button></div>
    <details><summary>How the journey flows</summary><p>The journey holds each sound's steady tone/noise balance, with one overall level and shared noise seed. It does not repeat the standalone entry/return envelope at every stop. Open Exploration's glide spans its stop; other carriers stay fixed. Smooth crossfades blend two designs instead of abruptly switching frequencies. These are sound environments and exploratory qualities, not guaranteed brain states.</p><p>Up to 12 stops, 30 seconds minimum each, 60 minutes total. Transitions are 1–120 seconds and at most half the shortest stop. Shared Warm stays coherent; equal-amplitude smoothstep weights avoid an artificial volume boost. Different tones may become a little quieter during a blend. Headphone comfort still needs your own listening.</p></details>
    <div className="controls"><label>Journey preview position<select aria-label="Journey preview position" value={positions.some(p => p.id === position) ? position : 'start'} onChange={e => {
          void onStop();
          setPosition(e.target.value);
        }}>{positions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label><label>Journey excerpt length<select aria-label="Journey excerpt length" value={length} onChange={e => {
          void onStop();
          setLength(Number(e.target.value));
        }}>{[15, 30, 60, 120].map(n => <option key={n} value={n}>{n} seconds</option>)}</select></label><label>Journey sample rate<select aria-label="Journey sample rate" value={rate} onChange={e => {
          void onStop();
          setRate(Number(e.target.value));
        }}><option value={48000}>48,000 Hz</option><option value={44100}>44,100 Hz</option></select></label></div>
    <p className="hint">Preview/export starts at {time(from)}. Start full journey always begins at 0:00. Excerpts use real journey time; choose a transition above to hear it right away. A short test version deliberately changes stop durations; ordinary preview never speeds up the journey.</p>
    <div className="actions"><button className="primary" disabled={busy} onClick={() => void onPlay(journey, options(true), `Journey: ${journey.name}`)}>Start full journey</button><button disabled={busy} onClick={() => void onPlay(journey, options(), `Journey excerpt: ${journey.name}`)}>Preview journey excerpt</button><button className="stop" onClick={() => void onStop()}>Stop journey / cancel</button><button disabled={busy} onClick={() => void onExport(journey, options())}>Export journey WAV excerpt</button></div>
    <p className="journey-state" aria-live="polite">{active ? `${state} · ${time(current?.positionSeconds ?? 0)} / ${time(total)} · ${at?.current?.recipe.name ?? 'Finishing'}${at?.next ? ` → ${at.next.recipe.name}` : ''}` : busy ? 'Preparing or rendering sound…' : 'Journey stopped'}</p>
    <progress aria-label="Journey playback progress" max={total} value={active ? current?.positionSeconds ?? 0 : 0} />
    {error && <p className="error">{error}</p>}{problem && <p className="error" role="alert">{problem}</p>}{message && <p className="hint">{message}</p>}
    <div className="actions"><button onClick={() => save()}>Save journey locally</button><button onClick={() => save(true)}>Save as new journey</button><button onClick={() => {
        void onStop();
        download(`${journey.id}.journey.json`, new Blob([exportJourney(journey)], {
          type: 'application/json'
        }));
      }}>Export journey JSON</button><label className="file">Import journey JSON<input aria-label="Import journey JSON" type="file" accept=".json,application/json" onChange={async e => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            if (file.size > 262144) throw new Error('Maximum journey import is 256 KiB');
            restore(importJourney(await file.text()));
          } catch (error) {
            setProblem(String(error));
          }
          e.target.value = '';
        }} /></label></div>
    {library.length > 0 && <label>Restore a saved journey<select aria-label="Restore a saved journey" value="" onChange={e => {
        const found = library.find(j => j.id === e.target.value);
        if (found) restore(found);
      }}><option value="" disabled>Choose a saved journey</option>{library.map(j => <option key={j.id} value={j.id}>{j.name} · {time(j.timeline.durationSeconds)}</option>)}</select></label>}
    <p className="hint">Saved only in this browser's separate lab storage; export JSON to keep a portable copy. The main app, routines and History are unchanged.</p>
  </section>;
}
