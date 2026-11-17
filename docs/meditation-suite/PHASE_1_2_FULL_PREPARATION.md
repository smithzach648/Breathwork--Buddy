# Phase 1.2 — full preparation and recorded narration

The user approved the supplied v0.2 scripts, Marshall's tonality, and the edited 50-second ECB sample with action pauses, then explicitly authorized completing and deploying the update. That chat decision supersedes the attached handoff's older generation and release holds. Continue using `breathwork-buddy-2`; no main merge or force push is needed. The Pages workflow remains manual-publication only.

## Experience

The Foundation is **33:00**: preparation 00:00–15:00, Threshold 15:00–30:00, return 30:00–33:00. Beyond the Familiar is **48:00**: preparation 00:00–15:00, Threshold 15:00–25:00, Expansion 25:00–37:00, Timeless 37:00–45:00, return 45:00–48:00. Rehearsal is **18:00**, using the identical preparation followed by the three-minute return.

| Preparation | Time | Actual composition |
|---|---|---|
| ECB | 00:00–02:00 | Approved Guided passage is 50 seconds, followed by 70 seconds of quiet. Familiar uses its shorter recording. |
| Breathing + progressive release | 02:00–07:00 | Short bowl, selected introduction, five regional invitations between complete groups, then natural release. No separate relaxation block. |
| Resonant tuning | 07:00–09:30 | Short bowl; voice starts 07:06 and ends before 07:45. Humming or quiet practice has 07:45–09:15 uninterrupted, followed by 15 quiet seconds. |
| REBAL or nonvisual space | 09:30–12:00 | Guided recording lasts 50 seconds, leaving 100 seconds of practice. Familiar and nonvisual options have distinct recordings. |
| Affirmation | 12:00–14:00 | Optional Guided lead-in at 12:00; selected intention at 12:12, with ample repetition time. Personal words remain local and are read/spoken by the listener. |
| Entry | 14:00–15:00 | Invitation and quiet. Warm blends into Threshold at 14:40–15:00. |

Soft Felt remains the selected breathing instrument. Its timbre, bounded pitch range and one distinct attack per second are unchanged. Holds pulse at one pitch. The same continuous acoustic engine, shared 4 MiB Warm source, carrier recipes, production output trim and ceiling remain in use.

## Deterministic event schedule and compatibility

New snapshots use schema **3**, `meditation-suite.1.2`, `full-preparation.1`, `full-preparation-voice.1`, and the existing `soft-steps.2` tone version. The snapshot contains section boundaries, all regional cue and complete-cycle boundaries, chime times, the protected humming interval, selected affirmation, local personal words, exact acoustic recipes, mix and voice hashes. `preparation.ts` builds the single immutable grid consumed by session stages, notes, narration and captions. Main environmental boundaries derive from the same acoustic stage durations.

The 300-second breath block reserves 25 seconds for opening and 25 for closing. Five intervening groups are exactly 50 seconds each:

- 5/5: 10-second cue + four 10-second cycles per group; **20 cycles, 200 notes**, first inhale at 02:35.
- 4/4/6: 8-second cue + three 14-second cycles per group; **15 cycles, 210 notes**, first inhale at 02:33.
- 4/7/8: first two groups each have a 10-second cue, two 19-second cycles and 2 natural seconds. Remaining groups contain cues and natural breathing; **four cycles, 76 notes**, ending at 04:03. Every hold has seven pulses.
- Natural: cue windows and unpaced quiet, **zero notes**.

Short chimes start at 02:00 and 07:00. Their 4.5-second audio leaves 1.5 seconds before narration. The source bowl is unchanged: SHA-256 `a51cd3515750342723df6db5322878534b11e9661be69d7f73241b0a8ffda1ee`. The separate short derivative uses the first 4.5 seconds at 0.65 gain, a 40 ms cosine attack and 1.6-second cosine release, with zero endpoints. Its hash is `a48919e9c4dde8d492123fa2ad9cdc762cd87d9a90f7270ee395541848b4a42e`. It is verified and cached, with quiet fallback if unavailable.

Beyond's environmental blends occupy 24:40–25:00 and 36:40–37:00. The full original bowl starts once at 25:00 and 37:00; selected deepening narration starts at 25:16 and 37:16. Return cues start at 30/31/32 minutes for Foundation or 45/46/47 for Beyond. No bowls were added to return.

Schemas 1 and 2 remain explicit historical paths. `createLegacyJourneyConfig` retains original 25/35/13-minute snapshots, while `createRefinedJourneyConfig` retains Phase 1.1's durations and 20-second introduction. They do not acquire new recordings or timings. Do not edit a released preparation profile or narration ID in place; add a version and retain its historical compiler/validator. Future builder work should reuse the event grid, but no builder has been shipped here.

## Voice production and credits

There are **42 local reusable passages**, including all present Guided/Familiar alternatives, four breathing introductions, five body cues, tuning and imagery alternatives, four journey-specific neutral/spiritual affirmations, personal prompt, three returns, seven Learn explanations and one Refresh passage. Exact source text is in `PHASE_1_2_SCRIPT_SOURCE.md`. The complete production inventory is `PHASE_1_2_NARRATION_PRODUCTION.json`: exact words, IDs, usage, character count, planned maximum, native decoded duration, generation provenance, actual credits, edit points, final file and SHA-256.

Narrator: **Marshall — Warm, Soft & Natural**, voice `Gr5QdabS0jJCHV2pLdyD`; model `eleven_v4`; one take per script. The original audition cost **413 credits** and is reused. The 41 new takes cost **5,902 credits**, bringing total narration spending to **6,315 credits**. No failed takes, retakes or paid pause regeneration. The aggregate estimate was 5,942 credits because it included 40 join-newlines that individual requests did not send. Credits remaining on the user's account were not queried.

Pauses were inserted only in existing quiet gaps, retaining all original decoded samples in order before encoding. No words, pitch or speaking speed were changed. Longer action prompts receive longer gaps; short regional cues remain inside their 8/10-second reservations. Final assets are mono 128 kbps MP3, **11,283,758 bytes total**, reduced from about 62 MB of edited PCM. Lossy encoding changes sample values; the preservation assertion refers to the pre-encoding edit. Native Chrome decoding at 44.1/48 kHz validates every final file, duration, finite samples and headroom.

Selected passages preload before the session clock starts. Voice off requests no suite speech, and missing, unpinned, hash-mismatched or oversized audio falls back to captions. Preparation requests serialize so canceling a start and changing options cannot reuse an earlier voice selection. No live speech API or generation key is shipped. Learn/Refresh playback uses the existing BrowserAudio owner and stops on navigation, interruption, session start or explicit Stop.

Affirmation preference and optional personal text extend the existing local preferences row without a database upgrade. Personal text is never sent to ElevenLabs. Original Neutral is the default. **Classic Gateway remains disabled, labeled coming soon**; `CLASSIC_GATEWAY` retains explicit pending text, source, permission and asset fields. No historical text was reconstructed or falsely labeled original. Future builder affirmations are separately defined and unvoiced.

## Verification and limits

- **617 tests** across 19 files pass, including the original lab fingerprint and routine/Practice/Hormesis/data tests plus exact new grids, all option combinations, voice fit, privacy, cancellation and resume cases.
- Typecheck, production build, PWA path/cache checks, preserved-asset isolation checks, lab typecheck/build and QA harness build pass. **31 original audio/icon hashes remain unchanged.** All 42 voice files, both bowl assets, worker and worklet are cached; 75 precache entries total approximately 25.2 MiB.
- Existing native suite and Phase 1.1 refinement checks pass: real Web Audio/AudioWorklet, layouts, offline process restart, stored mixes, legacy durations, interrupted recovery, worker/audio failure fallbacks and bounded shared source.
- Full-preparation native verification exercises a real old-to-new service-worker Update app flow, retained old schema-2 History/routines/preferences, offline voice playback in a fresh browser process, locally retained personal words, all new journey durations/patterns and selected alternatives at 44.1/48 kHz.
- Captured full-journey environmental samples match the shared core with **maximum error 0** across the new transitions at both rates. A conservative all-controls/master-at-1 stress render deliberately overlays the highest-peak voice, full bowl, notes and maximum environment; output peaks are approximately **0.2185 / 0.2221**, with no invalid samples or clipping.
- Timeline completion checks are accelerated QA. Physical phone screen-lock/background playback and human listening to every produced passage have not been verified. The app continues to explain that sound stops when hidden while its monotonic timer continues, and breathing recovers at the next complete inhale.

Public release is authorized by the latest user message. Publish only the exact development commit after its GitHub build checks pass, using the existing explicit release workflow; do not merge main. Record the actual commit, workflow and live verification in the post-build handoff.
