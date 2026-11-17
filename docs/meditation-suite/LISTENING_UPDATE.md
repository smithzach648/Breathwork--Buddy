# Live balance, Marshall breathwork and sound-only meditation

Implemented from Zach's November 17 voice request, including his final addition and explicit authorization to deploy when finished.

## Listener experience

- **Settings → Journey sound balance** now adjusts Warm, binaural tones, Soft Felt breathing notes, narration and singing bowl during a journey. Presets and Reset work live. Levels persist for the next journey; Start again on a current-schema journey uses the latest saved mix. Older journey schemas retain their saved replay behavior.
- New Practice and routine breathing starts use the same approved Soft Felt instrument as the meditation suite. One separate note marks each second: ascending inhale, descending exhale, stationary optional hold. No competing recorded breath sounds or repeated spoken in/out cues are layered over the new pacing.
- Marshall introduces each breathing exercise: 25 seconds for box, 4–7–8, calm, coherent and custom patterns; 30 seconds for Hormesis. Selected ordinary breathing time follows the introduction. Hormesis also uses Marshall for rounds, retention invitations, final five-second countdown and recovery. Release and Stop remain immediate.
- Standalone meditation and customized routine meditation blocks offer Threshold, Expansion, Timeless, Open, and **Beyond · sound journey**. The last flows through Threshold, Expansion and Timeless in the original 10:12:8 proportions with outgoing smooth transitions. It needs at least three minutes. Individual environments support one to sixty minutes.
- These meditation blocks have no preparation ritual or narration. The standalone timer starts directly. Routines retain their three-second transitions. Optional opening/closing signals remain separately configurable. New customized meditation blocks initially choose Threshold; existing saved choices are preserved.

## Timing, audio and compatibility

`soft-felt-marshall.1` versions new breathing behavior without rewriting old configs or results. Legacy direct configurations retain their original preparation, recordings and timing. The starting config remains immutable; live mix adjustments are stored separately with elapsed time in History. History identifies the new guidance and live adjustments.

Acoustic selection version `acoustic-environment.1` freezes the original recipes by value. It uses the same bounded Warm source, deterministic synthesis and shared AudioContext as full journeys. The legacy masking and binaural controllers are disabled for an acoustic block. Silent blocks still suppress all sound and signals. Companion audio remains optional. Scene previews are opening excerpts, not time-compressed journeys.

Warm/binaural gain changes use a 50 ms sample ramp inside the existing worklet, including when retargeted or crossing a scene boundary. Note/voice/bowl buses smooth their gain changes. No clock reset, graph replacement or note rescheduling occurs on a mixer adjustment. Voice enabled after an initially muted start only loads and schedules complete future passages; it does not replay the current or elapsed passage. A hidden/interrupted paced phase rejoins at a full inhale.

Original source recordings, recipes, legacy schemas and public URL are retained. The manual publication workflow is unchanged; `main` is not merged or rewritten. No audio is generated at runtime.

## Voice production and credits

Nineteen reusable Marshall recordings were generated once using the previously approved voice and delivery. Phrase spacing was edited locally. No retakes, speech acceleration or new subscriptions were needed.

- New ElevenLabs credits: **1,850**.
- Previous approved voice work: 6,315; cumulative recorded total: **8,165**.
- Exact scripts, hashes, durations, edit joins and native decoding measurements: `BREATHWORK_MARSHALL_PRODUCTION.json`.
- All final MP3s fit their slots at both 44.1 and 48 kHz. Five-second countdown clips are shorter than their one-second slots. All are cached offline and SHA-checked before playback.

## Validation

- 638 tests across 20 files pass, including unchanged legacy contracts and 21 added listening/voice regressions.
- Typecheck, production build, PWA checks, preserved-asset checks, laboratory typecheck/build and native harness build pass.
- Native Chrome at 44.1 and 48 kHz: live Settings changes retain clock/config and create no new environment graph or notes; live changes are saved separately; all 19 files match their hashes, decode correctly and fit; four breathing presets introduce before ascending one-second notes; midphase resume skips partial pacing; early Release enters recovery immediately.
- Sound-only Flow starts directly, uses one AudioContext, creates no legacy masking/binaural graph, completes at its exact duration, and has **zero sample error** against the original renderer across a scene transition at both rates.
- Real previous-release → current PWA update preserves history/preferences byte-for-byte. A fresh offline browser process can start the new Marshall introduction and finds all **61** suite/practice recordings in cache.
- Existing refinement native parity, maximum-mix headroom and offline preference checks pass. Original 31 audio/icon assets remain unchanged. Production precache: 94 entries, about 28 MiB.
- Settings tested at 320/390/430 px and 16/24/32 px text sizes; screenshot reviewed.

Repeat native checks with `scripts/verify-listening-update.cjs`. Its ignored `qa/listening-baseline/` fixture is the production artifact from commit `53c07174f76dc685ec7e869324ce2a14d3bdbef4`; alternatively set `LISTENING_BASELINE_DIST` to that separately built artifact. `scripts/verify-listening-public.cjs` validates the published artifact and offline listening after release.

Physical headphone listening and actual phone screen-lock behavior remain for Zach to verify. Browser tests do not establish those. Keep the app visible; hidden audio stops while the timer continues. A runtime sound failure leaves text, timer and Stop available.
