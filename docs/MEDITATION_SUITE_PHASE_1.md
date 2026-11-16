# Meditation Suite Phase 1

Implemented in the existing app on `breathwork-buddy-2`. This is an original, Focus-inspired practice; it does not reproduce proprietary Monroe/PCC audio or certify a mental state. Public release is separate from this development delivery.

## Delivered experience

Home → Explore journeys, or the Meditate navigation item, opens two fixed choices:

| Journey | Preparation | Main environments | Return | Total |
|---|---:|---|---:|---:|
| The Foundation | 10:00 | Threshold 12:00 | 3:00 | 25:00 |
| Beyond the Familiar | 10:00 | Threshold 8:00 → Expansion 9:00 → Timeless 5:00 | 3:00 | 35:00 |

Guided provides fuller on-screen prompts; Familiar reduces instructions. Neither promises narration. Learn/Refresh explains the seven preparation steps, supports replay, and offers an actual 13-minute rehearsal (10-minute preparation plus 3-minute return). That rehearsal is an orientation route, not a third main journey card. The existing simple meditation timer remains available as Timer.

Both full journeys start with ECB (0–90 s), breathwork (90–270), body relaxation (270–390), optional humming (390–450), optional surrounding-space imagery (450–510), affirmation (510–540), and entry (540–600). Neutral alternatives retain the same time budget. Affirmation defaults to secular text, with an optional spiritual variant. No personal intention, emotional note, or inferred state is collected.

Customize contains the breathing choice and independent environment, breathing-tone, bowl, and future voice levels. Default 5/5 uses 18 whole cycles. 4/4/6 uses 12 cycles (168 seconds) plus 12 seconds natural settling. 4/7/8 uses four cycles (76 seconds) plus 104 seconds natural settling. Natural breathing uses the whole window without pacing. During breathwork, Breathe naturally instead cancels the remaining tone cues without changing the journey deadline. The ambiguous 4/4/4/6 pattern is deliberately excluded.

## Session and sound ownership

`src/meditation-suite/model.ts` validates and compiles a dedicated `meditation-journey` configuration. The existing deterministic session engine owns all stage deadlines, elapsed/remaining time, wake-lock requests, cancellation, and the single parent History result. Journey compilation bypasses the legacy 13-second preparation and 3-second routine transitions. All other practice compilers retain their existing behavior.

The versioned, immutable snapshot contains the selected pattern, guidance/alternatives/levels, exact acoustic recipes, source seed, transition policy, duration, tone/narration versions, interruption policy, recorded bowl asset ID/hash, and an explicitly empty list of approved new voice assets. History adds optional journey metadata to the existing record; Dexie remains at the same schema version (browser IDB version 30). No migration, replacement database, or data-clearing operation is used.

The laboratory's model, DSP, JourneySynth, program dispatcher, and original worklet moved unchanged into `src/audio/acoustic/`, apart from relative imports. Original `lab/` module paths remain re-export/import shims, preserving its separate interface and tests. Production includes the shared synthesis code and its own small adapter, never the lab UI or independent player.

`BrowserAudio` owns one AudioContext and the existing Master/output path. `JourneyAudio` receives that context and routes separate centered note, bowl, voice, and stereo environment buses into the same Master. A worker prepares one seeded 4 MiB Warm source; a single AudioWorklet runs the continuous JourneySynth. At most two acoustic designs are evaluated in a blend. There are no full-length pre-rendered journey buffers or per-scene contexts. The adapter cancels the core's fixed 0.25 trim by multiplying by four before the app applies its existing output trim once. The memoryless output ceiling is unchanged.

Main scene recipes are copied from the existing immutable lab presets, with their original layer balances and carriers. Preparation uses the same Warm bed with carriers disabled; the first scene enters over the last 20 seconds of preparation. Beyond's two main smoothstep blends occupy 17:40–18:00 and 26:40–27:00. A single recorded bowl starts at each of 18:00 and 27:00, retaining its approximately 14.988-second tail. No entry, completion, or breathing-boundary bowls are added. Return retains the outgoing recipe and applies one continuous linear fade over the final 180 seconds, with progressive reorientation text. Entry has a five-second fade; resumed sound has a 50 ms fade. Manual Stop ramps down over 50 ms; retirement cleanup completes before another journey prepares.

## Musical timing

`major-steps.1` uses discrete triangle notes for directional phases and softer stationary sine pulses for holds. Every N-second phase has exactly N attacks at offsets 0…N−1; notes last 0.72 seconds with rounded gain envelopes. Pitch is assigned once to each oscillator, without frequency ramps. Notes are centered before the stereo output.

For 2–8 attacks, selected major-scale steps span C4–C5; one attack uses a middle note. Longer future phases extend a major scale and transpose down to cap the upper pitch at MIDI 84. Whole-second phases outside 1–20 reject rather than silently compressing or stretching the scale. Holds repeat C5 after inhale and C4 after exhale. The 4/4/6/2 contract is tested even though it is not an offered preparation choice. Scale and timbre are listening prototypes, not therapeutic frequency claims.

All note attacks, bowl sources, and acoustic transitions use AudioContext scheduling/render frames. JS/React polling only updates presentation. Cleanup timers, preparation timeouts and bounded QA capture timeouts do not pace the exercise.

## Narration gate

No ElevenLabs call, new voice generation, credit spending, live API, or new narrated audio asset is included. `narration.ts` is a versioned manifest of original English scripts and stable intended clip IDs. Asset IDs and decoded durations are absent until approved recordings exist; the UI states this and disables its unavailable voice slider. Text, musical tones, continuous sound, and bowls are fully functional.

Future voice work requires review of the complete scripts, chosen voice/model and estimated credits, followed by explicit approval. Approved clips must be registered in the existing catalog and cached locally, pinned in a new reviewed snapshot version, checked against their decoded durations, and tested with ducking and both text variants. The scheduler already rejects clips that overrun a section and reserves a 16-second gap after a deepening bowl. This version schedules no spoken breathwork introduction; introducing one requires a new supported budget/version with whole cycles plus natural remainder, rather than overlapping first tones. Optional humming/imagery/spiritual variants need matching approved clips or remain text-only. Current empty-asset paths are tested; future recorded narration remains a separate acceptance gate.

## Interruptions and fallbacks

Keep the app visible. Hiding or suspending audio disconnects current/future sound; the monotonic session clock continues. On return, sound reanchors to current elapsed time. During breathwork, visual guidance says breathe naturally until the next complete inhale. Completed cues, introductions, and past bowls are not replayed. There is no promise of continuous Android/iOS locked-screen audio. Page reload/process termination does not restore a running session.

If AudioContext is unavailable, text, timing and Stop still work. If worklet/source preparation fails, a clear notice appears and text/tones continue. Worker preparation has a bounded timeout. Stereo headphones preserve stereo effects; no headset detection or mental-state measurement is claimed. Master volume and the fixed output safety path remain in force.

## Verification

Fresh baseline: 478 tests on clean `31f9760e9b56ac1d3ca1512626fd6590d49e46e1`. Commands used for delivery:

The final automated run passed **533 tests across 16 files**, including 55 new suite checks and the unchanged laboratory golden WAV checks.

```text
pnpm test
pnpm typecheck
pnpm build
node scripts/check-pwa-build.mjs
node scripts/check-suite-build.mjs
pnpm exec tsc --project lab/tsconfig.json
pnpm exec vite build --config lab/vite.config.mjs
pnpm exec vite build --config scripts/routine-harness/vite.config.mjs
node scripts/verify-meditation-suite.cjs
node scripts/verify-modular-routines.cjs
node scripts/verify-acoustic-environment.cjs
node scripts/verify-modular-installed.cjs
node lab/verify-native.cjs
node lab/verify-journey.cjs
```

Native scripts require the bundled Playwright runtime/native Chrome, disposable browser profiles, and local server access; the lab scripts use its separate server on port 4187. `SUITE_SAMPLE_RATE=48000` requests an additional production sound run at 48 kHz; the ordinary desktop run uses the device's native rate. Native suite checks cover actual worklet PCM against shared-core samples, exact note/bowl scheduling, one-context ownership, final fade, History, no-audio/failed-worker fallbacks, audio suspension/visibility recovery, offline fresh-process sound startup, preserved routines/settings, and 320/360/390/430 px at 16/24/32 px text. Test clocks only exist in the optional QA harness, which is excluded from production.

Evidence is written under ignored `qa/`: suite JSON/build hashes/screenshots, routine/environment/installed-PWA reports, and lab reports/decoded exports. Automated full-duration completion uses a test clock, not a claim of a wall-clock 35-minute hardware soak. Physical headphone audition, actual Android/iOS screen lock and long device runs remain open user/hardware checks.

The old `lab/check-isolation.mjs` is intentionally unchanged: it asserts that *all production source and build bytes* match Phase 4B, appropriate only for a lab-only change. It cannot truthfully pass a new production feature. Its production-integration equivalent, `check-suite-build.mjs`, verifies all 31 original audio/icon fingerprints, exclusion of lab UI/player/research/QA, unchanged PWA scope, and precaching of the new worker/worklet. Existing lab WAV fingerprints continue to pass unchanged.

## Release boundary

The previous Pages workflow deployed on every development push. This change retains automatic checks/artifact creation but gates the deploy job on an explicit manual dispatch with `publish=true`. No dispatch, main merge, force push, or public deployment is part of this delivery. Main must remain `ea409acd59ecb440530d9c4938139720b7aecada`.

Deferred: approved narration, arbitrary journey editing, additional Focus themes/contact/OBE libraries, emotional/habit programs, the separate short reset feature, cloud sync, naming changes, and hardware background guarantees. Future work should extend this same versioned timeline/audio owner rather than create a parallel player.
