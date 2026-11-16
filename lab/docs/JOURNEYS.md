# Sound journeys — local lab extension

Added November 15, 2026 at the user's request after approving the four environments. This remains a local laboratory feature. The production PWA, routines, database, default environments and History remain unchanged.

## Try it

Open http://127.0.0.1:4187/ and select **Build a journey** near the top of the lab. The starting sequence is Threshold → Expansion → Timeless → Open Exploration, five minutes each, total 20 minutes, with 20-second transitions. Change the order and minutes, repeat/remove stops, or add any built-in/reference/custom environment. The four standalone sounds remain available and unchanged.

**Start full journey** always starts at 0:00. **Preview journey excerpt** uses the selected position and 15/30/60/120-second length. Select a named transition to hear it immediately. Ordinary preview never compresses journey time. **Make a short test version** explicitly changes every stop to 30 seconds and the transition to at most 10 seconds; four stops then last two minutes. Save the longer version first if you want to keep it.

Use **Save journey locally** for the current named journey, **Save as new journey** for another saved copy, and the restore picker to load one. Up to 12 journeys live in the separate `breathwork-buddy-acoustic-journeys-v1` localStorage key. **Export journey JSON** is a portable complete snapshot. **Import journey JSON** validates without changing the original file or overwriting saved journeys. A corrupt import leaves the draft intact. Full libraries fail visibly instead of dropping old entries. Original lab custom-recipe storage is unchanged.

**Export journey WAV excerpt** creates actual stereo 16-bit PCM at 44.1/48 kHz, at most 120 seconds, plus a render report. Full journeys up to 60 minutes play live; they do not generate huge files. Stop/cancel, a recipe edit, page hide or navigation disposes playback and invalidates pending preparation/export. Keep the tab visible. The local server needs to be running; the lab is not public hosting or a PWA.

## Meaning of durations and blends

The displayed total is the sum of stop durations. Each transition occupies the **last N seconds of the outgoing stop**; the next environment becomes audible during that interval and becomes dominant at the boundary. For five-minute stops and a 20-second blend, Threshold→Expansion blends from 4:40 to 5:00; Expansion's nominal stop runs 5:00–10:00. Overlaps do not shorten the displayed journey or add extra time.

The journey uses the **steady mix** of each environment; it does not replay the standalone three-minute entry/four-minute return at every stop. One journey Master owns level; stage snapshots have level 1 and the journey defaults to .8. Tone/noise relative levels, carriers, optional modulation and delay parameters are copied by value. The common source seed is copied into every snapshot. Open Exploration's full glide spans its stop; the others remain fixed. Intro/outro audition fades default to one second.

This is a crossfade between complete designs, not a claim that the perceived or neurological state morphs on command. During a blend, both tone sets are present and can introduce additional acoustic interactions. The four names remain exploratory qualities. Comfort and personal experience require your own listening.

## Versioned data and bounds

Standalone engine `4c.1.0`, recipe schema and all built-in recipe values stay unchanged. New journey data is discriminated by `kind: "journey"`, `schemaVersion: 1`, engine `journey.1.0`. It includes ID/name, shared seed, transition seconds, explicit `transitionShape: "smoothstep"`, `layerEnvelope: "steady"`, `sourcePolicy: "shared-warm"`, complete per-stop recipe snapshots, exact total timeline, and one output level/fade. Unknown keys/policies/versions reject. No executable JSON, coercion or silent repair.

Use 1–12 stops, each 30–3600 whole seconds, at most 3600 seconds total. Transitions are 1–120 whole seconds and at most half the shortest stop, so at most two designs are active. UI duration edits visibly shorten a transition when necessary; imported data with conflicting durations is rejected. Overall level 0–1, fade .05–2 seconds, nonzero uint32 seed. Nested snapshots retain existing strict 60–1000 Hz / 0–30 Hz differences / six-pair and noise/modulation bounds. Snapshot seed must match the common seed and snapshot output level must be 1, preventing hidden source resets or double Master. Import limit 256 KiB.

## DSP and ownership

`program.ts` dispatches a standalone Recipe or Journey to the same live/export routes. `JourneySynth` composes the existing `Synth` sample core. Every voice receives the same original seeded Warm buffer; reads and delay movement use absolute journey sample time, including the incoming portion before a nominal stop begins. Fixed shared carrier phases use the common origin. Glides integrate local stop time with an explicit initial-phase offset. No second sound player, exercise timer or per-stop AudioContext is created.

For a transition ending at boundary B, `u=clamp((t-(B-T))/T,0,1)`, `w=u²(3−2u)`, and stereo output is `(1−w)A+wB`. Convex smoothstep weights keep the coherent Warm component at its ordinary level. Equal-power weights would boost shared/coherent content. Distinct tone energy can dip somewhat in the middle of a crossfade; no AGC increases it. No phase/frequency jump is inserted into either active voice. Stops are mixed at steady level, with only the complete audition's outer fade.

One rendering-thread worklet graph runs throughout. At most two layer cores are evaluated, each up to six carrier pairs; all stops share one 4 MiB source. Four reusable block buffers are bounded to 8192 samples each (128 KiB combined; actual 128-frame live blocks use 2 KiB). No long sample history is retained. The worker uses the same core for chunked WAV exports, preserving seek and live/export parity. Browser APIs/driver behavior and hour-long mobile playback are not certified.

`validateJourney` uses a finite-JSON copy after strict validation because `structuredClone` is not consistently available in AudioWorkletGlobalScope. A permanent regression and real browser worklet test cover this compatibility issue. The current-stop/progress display reads the audio context clock; its presentation polling never drives DSP transitions.

## Verification

Run the existing app/lab commands plus:

```powershell
pnpm exec tsc --noEmit -p lab/tsconfig.json
pnpm exec vite build --config lab/vite.config.mjs --configLoader native
node lab/verify-journey.cjs
```

The native command needs the lab dev server running and Playwright/native Chrome available through the bundled runtime. Evidence is ignored `qa/journey/native-report.json` and its actual journey JSON/WAV/screenshots. Permanent tests cover strict schemas, frozen snapshots, totals/repeats, weights, seamless centered Warm, finite boundary samples, deterministic arbitrary seek, worklet-sized/offline blocks, mute/fades, full-hour live geometry/export caps, worklet API compatibility and all five approved standalone WAV fingerprints. Existing original tests remain intact.

Native checks cover three actual transitions at 48 kHz with live/offline sample equality, 44.1 kHz OfflineAudioContext parity, one-context audit, full-start semantics, standalone/journey swaps, Stop/late preparation, real downloaded/decoded WAV, import/corrupt retention/save/restore, and 320/360/390/430 px with 16/24/32 px text. Physical headphone listening, subjective outcomes, Android, screen lock and a full-hour device soak remain outside automated certification.

Future production integration still requires its own explicit instruction and frozen-sound/runtime/source-ownership work. This extension does not connect journeys to breathing blocks, the main routine builder, bowl, companion media or History.
