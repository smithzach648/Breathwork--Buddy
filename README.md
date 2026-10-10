# Breathwork Buddy 2.0

A personal, local-first breathwork PWA. Phase 4A adds exact-cycle custom patterns, independent hormesis rounds and timed natural settling to saved routines compiled through the existing deterministic engine. The preparation/recovery flow, local data and meditation sound environment remain intact. Earlier phase sections below document their original delivery.

The modernization branch is `breathwork-buddy-2`. Preserve legacy `main` at `ea409acd59ecb440530d9c4938139720b7aecada`; do not merge or change it during this phased build.

## Development and checks

Use Node.js 24 and pnpm 11.19.0. The lockfile records exact dependencies; the workspace permits only esbuild's dependency build script.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm test
pnpm build
node scripts/check-pwa-build.mjs
pnpm preview
```

Open `/Breathwork--Buddy/`. Production service workers are disabled in the development server. Tests use Vitest, Testing Library, jsdom, and fake-indexeddb. Injected timing covers transitions, both retention sequences, release, cancellation, delayed callbacks, snapshots, and background reconciliation. Audio mocks verify native scheduling, deduplicated loads, stale-load rejection, failures, fades, and independent gain buses. Integration tests cover UI, history, volume persistence, result retry, version-1 database upgrade, update gating, and wake-lock races.

## Supported practice

| Preset | Stages in seconds |
| --- | --- |
| Box | Inhale 4 → hold in 4 → exhale 4 → hold out 4 |
| 4-7-8 | Inhale 4 → hold in 7 → exhale 8 |
| Calm | Inhale 4 → hold in 4 → exhale 6 → hold out 2 |
| Coherent | Inhale 6 → exhale 6 |

Every preset starts with Prepare: welcome voice over a 4-second inhale, a 6-second exhale without the normal In/Out voice cues, then 3 seconds of silence. Patterned sessions then offer 3, 5, or 10 minutes of repeating breathing, defaulting to 5. These selections exclude the 13-second preparation. Zero stages are omitted and the final stage is clipped at the breathing deadline.

Hormesis offers 2- or 3-second inhale/exhale intervals; 20, 30, or 40 breaths per round; and three retentions of either 60/60/60 or 60/90/90 seconds. Defaults remain 2-second intervals and 30 breaths. After Prepare, each round has a spoken announcement followed by a deterministic 400 ms margin before rapid breathing. Round windows are 3.326 / 2.046 / 2.203 seconds, computed from decoded clip lengths rounded up to milliseconds plus the margin. The final cue says **Final round**. In each round, the final normal exhale is replaced by one explicit four-second **Exhale fully** stage, using `voice.Full Exhale.mp3` (2.115918 seconds) and the four-second breath sample. Generic Out is omitted. The stage exists even with every guidance category disabled; retention starts only at its absolute four-second deadline.

Recovery after natural retention or Release is always **4-second inhale → 15-second hold → 6-second exhale → 3-second silent settle**. The guided hold is now fixed at 15 seconds; the 10/20 selector was removed to match the spoken instruction. New inhale/hold and exhale instructions overlap their breath sources. Recovery hold has no redundant generic Hold cue. The full recovery and quiet settle also close the final round, with no extra announcement. The legacy extended final breath remains omitted.

**Release retention** records actual elapsed hold time, cancels its countdown/deadline, and starts recovery immediately. **Stop practice** saves a cancelled result; **Start again** creates a fresh session. Hormesis includes a concise seated/lying-down safety note. Practice should never occur while driving or in/near water.

## Engine and audio architecture

- `src/session/config.ts`: validated configuration, compiled stages, and cloned recursively frozen Start-time snapshots.
- `src/session/clock.ts`: injected clock/scheduler. Browser timing uses `performance.now()` and deadline-driven timeout wakeups.
- `src/session/engine.ts`: non-React session authority. Each stage starts from the prior absolute deadline, rather than callback arrival. Observable remaining time is derived from the deadline. A 100 ms wakeup refreshes observation; it does not define elapsed time.
- Session identity combines a snapshot UUID with a runtime generation; stage identity includes the stage index. Old callbacks verify both, and cancellation invalidates scheduled work.
- `src/session/runtime.ts`: audio, wake lock, preferences, and result persistence. React observes stable state with `useSyncExternalStore`; component effects never determine transitions.
- `src/audio/web-audio.ts`: gesture-created AudioContext, decoded-buffer Promise cache, independent Master/Voice/Breath gains, diagnostics, and cancellable non-looping sources.
- Engine milliseconds map to AudioContext seconds using an offset measured at initialization/resume. Native sources schedule against mapped absolute times. Audio events never advance the engine.
- Every stage entry has an audio epoch plus session/stage identity. Late loads cannot attach to an old scope. Cues more than 250 ms overdue are dropped. Missing/decode-failed assets are optional; timing continues.
- Retention schedules five/four/three/two/one at deadline minus 5/4/3/2/1 seconds. Release and Stop cancel all remaining sources. Breath sources use a short attack and up to a 60 ms end fade, bounded by the stage deadline. Stop/release immediately mute and stop obsolete sources.
- Preparation, announcement, recovery exhale, and settle are explicit deterministic stages. Announcement metadata lives in `src/audio/voice-metadata.ts`; loading/playback completion never controls stage timing. No leading-silence offsets are added.
- The recovery instruction is 4.989 seconds long. Its final ~0.989 seconds may finish into the adjacent quiet recovery hold using an explicit cue continuation. Only the same session and exact adjacent hold boundary can retain it. Other transitions, Stop, hiding, or restart cancel it. The inhale/hold remain exactly 4/15 seconds.

## Local audio

All filenames are preserved. URLs encode each path segment and use Vite's project base.

| Logical ID | Actual filename |
| --- | --- |
| `voice.in`, `voice.out` | `voice.breath-in.wav`, `voice.breath-out.wav` |
| `voice.hold60`, `voice.hold90` | `voice.60 second hold.wav`, `voice.90 second hold.wav` |
| `voice.hold` | `voice.Hold.wav` |
| `voice.one` through `voice.five` | `voice.count-1.wav` through `voice.count-5.wav` |
| `voice.fullExhale` | `voice.Full Exhale.mp3` — 2.115918 seconds |
| `voice.prepare` | `voice.Prepare.mp3` — 3.474286 seconds |
| `voice.round1`, `voice.round2` | `voice.Round 1.mp3` — 2.925714 s; `voice.Round 2.mp3` — 1.645714 s |
| `voice.finalRound` | `voice.Final round.mp3` — 1.802449 seconds |
| `voice.recoveryInhaleHold15` | `voice.Recovery breath inhale 15 second hold.mp3` — 4.989388 seconds |
| `voice.recoveryExhale` | `voice.Recovery breath exhale.mp3` — 3.239184 seconds |
| `breath.in4`, `breath.in6` | `Inhale 4 second.wav` — 3.91 s; `Inhale 6 second.wav` — 5.87 s |
| `breath.out4`, `breath.out8` | `Exhale 4 seconds.wav` — 3.91 s; `Exhale 8 seconds.wav` — 7.87 s |
| `ambience.floating`, `ambience.homeAgain` | `Floating.mp3`, `Home Again.mp3` |

There is no six-second exhale recording. The user approved the four-second file for four-second phases and the eight-second file faded at six seconds for six-second phases. Hormesis uses the four-second sources cut/faded at two or three seconds. Samples never loop inside a phase. The physical file duration never sets practice timing.

Phase 2 MP3s were replaced by the user-supplied edited WAVs and new prefixed voice filenames. The unused generic Recovery Breath file/ID is retired. The edited four/six/eight-second breath sources are slightly shorter than their nominal phases; this does not change deadlines. Decoded-buffer caching and offline precaching support both WAV and MP3.

## Guidance and background media

Settings offers independent persistent Breath sounds, Spoken breath cues, and General voice guidance toggles, all ON by default. Central `src/audio/guidance.ts` maps physical breath samples to Breath sounds; In/Out/Full Exhale voices to Spoken breath cues; and welcome, round announcements, hold/recovery instructions, and countdowns to General voice. Disabled categories stop current/future scoped sources immediately. Enabling does not replay missed entry cues. Timing and frozen session snapshots never change when settings change.

Master, Voice, Breath, and Background volume persist. Background uses the existing `ambience` preference value, preserving older settings. Source defaults to None, mode Off, Loop ON, and Lower background during voice guidance ON. Choose Floating, Home Again, or one My Audio file; selection itself never auto-plays.

`src/media/background.ts` owns one persistent streaming HTMLAudioElement. Long files never enter the precision AudioContext decode cache. Play/Pause/Stop controls, source epochs, transient object URLs, native position, and fade timers remain independent of engine deadlines. Entire practice runs from Start through all stages and fades at completion. Hormesis retention only starts at retention, fades/pauses on Release or recovery, and resumes its previous position in later retentions; patterned practices clearly state this mode is unavailable. After practice starts only on normal completion and exposes controls on the result view; cancellation cannot auto-start it. Non-looping media that ends naturally does not restart on the next stage.

Background fades normally take 700 ms. Voice ducking attenuates background to 40% of its unducked level (about -7.96 dB), with a 250 ms ramp; breath sounds do not duck. Active native voice windows determine ducking, so future countdown sources do not lower audio early. Combined active voices and cancellable fades avoid competing restores. Stop/source removal cancels playback immediately; Start Again resets position and old ducking. Hidden pages pause background immediately and preserve position; return follows the current mode and surviving session stage. Locked-screen playback is platform-dependent and is not promised.

The Media Library previews built-ins and local imports. File selection uses `accept="audio/*"`; native streaming playability is checked before an atomic IndexedDB write. Stored metadata includes generated ID, display/original name, MIME, bytes, discovered duration, import time, and Blob. Files are never uploaded. Object URLs are recreated on demand and revoked after probing, replacement, stale resolution, deletion, or disposal. Supported formats depend on browser codecs; MP3 and WAV are validated in Chrome. Unsupported/empty files and quota failures produce readable errors without partial entries or deleting other records.

Floating and Home Again remain deployed under the project path. **Make available offline** explicitly downloads and validates a built-in into the same Dexie media table, using an `offline:` ID. **Remove offline copy** removes its Blob. Neither large track is forced into the service-worker precache. Online playback streams its published URL; offline copies and My Audio stream local Blob URLs. Unavailable media reports an error while practice timing/audio remain functional.

Storage usage/quota estimates and persistent-storage status appear where supported. Storage is not guaranteed permanent: site-data clearing, browser eviction, and OS pressure can remove local audio. Keep original files. No playlists, waveform/artwork tools, cloud accounts, or full meditation stage are added.

## Results and storage

Dexie database `breathwork-buddy-v2` preserves the original version-1 tables: preferences, routines, journal, history, migrations. Explicit version 2 adds the history `outcome` index. Explicit version 3 adds the `media` table and extends valid preference rows with guidance/background defaults, preserving theme, volumes, and all history. Migration tests cover both version 1 and version 2. Added result fields remain optional for old rows.

Every completed/cancelled practice writes an idempotent result containing preset/name, timestamps, planned/actual duration, completed stages, and Hormesis rounds/actual retentions with completed/released/cancelled outcome. History shows the 30 most recent results. Failed writes remain available for explicit retry while the page remains open; closing before a write finishes cannot guarantee persistence. No legacy import occurs. `localStorage["breathwork_data"]` is only checked for presence and remains untouched.

Actual elapsed duration includes everything from Start through completion/cancellation, including Prepare and transitions. Patterned planned duration remains the selected 180/300/600 seconds; completed actual duration is 193/313/613 seconds. Hormesis planned duration includes all compiled stages. Completed stage count includes all fully finished preparation/announcement/recovery/settle stages; completed rounds increment after recovery settle. Phase 2.2 requires the media/preferences migration above; no extra History fields are required. Replacing a final 2-second exhale adds 2 seconds per Hormesis round; replacing a 3-second exhale adds 1 second per round.

## Visibility, wake lock, and updates

Timing continues logically while hidden. Audio is cancelled on hiding; on return the engine reconciles elapsed deadlines, skips expired phases/cues, and schedules only future retention countdowns. It never extends a hold to accommodate a late callback. Returning after the final deadline records completion at that deadline.

Screen wake lock is optional and requested only during an active visible practice. Stop/completion/hiding release it; visibility return reacquires it. A generation check immediately releases stale grants. Denial/unsupported browsers do not affect practice.

Mobile operating systems can suspend pages, audio, and timers. Wake lock cannot guarantee background execution; monotonic clock behavior across device sleep varies by platform. Foreground use remains the intended workflow. Hard closing the page ends in-memory execution; sessions do not automatically resume across a reload.

New service workers wait for user activation. During practice the update notice explains deferral and hides **Update app**. The activation handler also checks the live engine state before proceeding. Completion or Stop restores the button.

## Pages and offline

Live: <https://smithzach648.github.io/Breathwork--Buddy/>.

`.github/workflows/pages.yml` runs locked install, type checks, tests, production build, and artifact validation on pushes to `breathwork-buddy-2`, then deploys through GitHub Actions/Pages. It never writes/merges `main`. Pages uses Actions as its source and the environment permits the modernization branch.

Vite base, manifest identity/start URL/scope, and worker scope are `/Breathwork--Buddy/`. The worker precaches shell, icons, manifest, and all 21 voice/breath files: 29 entries totaling approximately 9.3 MiB. The edited WAVs increase initial offline download size. Navigation falls back to the project-path index. Large ambient MP3s are deployed but excluded from the mandatory practice cache; explicit offline copies live in IndexedDB. Allow initial installation to finish, then reload once under the worker before testing offline.

Production browser validation covers every preset's start/transition/Stop/restart, offline reload and practice, decoding all cached recordings with HTTP cache disabled, saved History, mobile overflow, and absence of external requests/page errors. An isolated test-only clock build exercises full Hormesis flows and update protection; its debug controls and shortened execution are never part of `dist` or Pages.

The Phase 2.1 audio-resume race and bounded recovery continuation remain covered. Phase 2.2 adds deterministic Full Exhale/toggle tests and media import/migration/player/ducking regressions: **112 Phase 2.2 tests remain covered**. Real production-browser validation checks built-in playback, actual file-chooser import, native decoding, persistence, offline copies, offline browser restart, deletion, mobile layout, and absence of unexpected external requests. A separate harness uses production modules/assets and injected timing to skip long repeated breathing/holds, then measures the new four-second stage at real speed for both cadences. Subjective listening and physical-phone checks remain human review.

## Phone review and next boundary

Check Chrome/Android and Safari/iOS installation, airplane-mode cold relaunch, preparation rhythm, round announcements before rapid breaths, the full 4/15/6/3 recovery, early release before/during countdown, rapid Stop/restart, background return, wake lock, volume persistence, History, large text, screen-reader stage announcements, landscape, and an update during practice. Review phone speaker and earbuds with Voice/Breath balance. Listen specifically to two- and three-second breaths: dedicated short recordings are recommended only if the truncation sounds abrupt or unnatural. The recovery sentence must finish clearly into the quiet hold without a second Hold instruction. Round onset is about 0.23–0.29 s into the supplied clips; edit those assets further if that feels delayed rather than adding offsets in code.

Phase 3C remains deferred. Review Full Exhale at both cadences; try Breath ON/Spoken OFF/General ON, Breath OFF/Spoken ON/General ON, Breath ON/Spoken ON/General OFF, and all guidance OFF. Check both built-in tracks, voice ducking, retention-only position continuity, After practice controls, local phone-file import/reopen/delete, storage estimates, and airplane-mode playback on speaker and earbuds. Saved routine composition is now implemented as described below. No craving/habit mode, journal editor, AI/TTS, cloud/backend, notifications, haptics, or native packaging is implemented here.


## Phase 3A stabilization and saved routines

Version: `2.0.0-phase3a`. The stabilization gate passed 121 tests before routine-builder implementation began; the full Phase 3A suite passed 154 tests across eight files.

**Retention-volume root cause:** actual countdown recordings leave 110–260 ms between spoken words. Previously, each gap immediately restored background volume, and the next word ducked it again, repeatedly replacing the player fade. Native Chrome traces reproduce that pumping. `BackgroundGain` is now the sole `HTMLAudioElement.volume` writer: Master × Background × transport envelope × voice envelope. Transport fades take 700 ms and voice ramps take 250 ms. A cancellable 300 ms voice-release grace bridges the measured gaps; it does not move or delay any cue. Overlapping voice windows share one duck/restore. Release clears duck state without a volume jump, then fades to silence and pauses. Hide, Stop/restart and source replacement invalidate stale gain/play work. Diagnostics expose effective gain, both envelopes, native position, visibility, stage/session identity and generation tokens.

**Prepare root cause:** the engine could start its four-second Prepare stage before the cold fetch/decode finished. The existing 250 ms lateness rule correctly rejected the late cue. An already-running AudioContext could also receive an unnecessary resume/re-entry that cancelled and rescheduled the fresh cue. Start now unlocks audio in the gesture and, when needed, shows **Getting ready** until Prepare is decoded or its load fails. The authoritative session clock starts afterward; the Prepare sequence remains exactly 4/6/3 seconds. Loads have a five-second failure bound, missing audio cannot change running deadlines, and pending starts can be cancelled or invalidated by hiding. A running context and repeated running-state events preserve an already-entered scope. Existing expired/reconciled cue skipping remains intact. App updates also wait during readiness.

### Saved routine model and storage

The existing Dexie `routines` table stores IDs, name, created/updated ISO timestamps and ordered blocks. No schema/version change: database version remains 3, and preferences, History, media/ambience Blobs, journal placeholders, prior routines and migration metadata are preserved. Edits retain routine/block identity; duplicates receive a new routine ID and new block IDs, with a `copy` name suffix. Reads used for Start and duplication validate before use. Save/delete errors stay visible and failed saves retain the draft.

Limits: names trim to 1–80 characters; 1–20 blocks; unique block IDs and routine IDs use 1–128 letters/digits/hyphens/underscores, beginning with a letter or digit; valid ISO-compatible dates are required. Patterned blocks support Box 4-4-4-4, 4-7-8, Calm 4-4-6-2 and Coherent 6-6 for exactly 3/5/10 minutes. Hormesis supports exactly 60/60/60 or 60/90/90, 2/3-second intervals, 20/30/40 breaths and fixed 15-second recovery holds. Invalid or old unsupported records remain visible for repair/delete, with Start and Duplicate disabled; repair supplies an editable draft and never silently rewrites a record.

### Builder and one engine session

**My Routines** is reachable through Home and Practice, keeping the five existing navigation destinations. Home shows at most two valid saved routines with Start and a quiet empty-state invitation. The builder provides labeled practice/duration/cadence/count inputs, add/remove, numbered blocks and semantic Move up/Move down buttons. Delete requires an explicit confirmation and keeps historical results.

Start unlocks audio, reloads/validates the saved routine, clones its configuration, compiles all blocks and deep-freezes the snapshot. One universal Prepare precedes the first block. A silent three-second `block-transition` stage appears only between blocks; internal exercise stages are unchanged. The existing engine remains the only clock and scheduler, with absolute monotonic deadlines, one identity, cancellation, wake-lock and update-deferral lifecycle. Editing a saved routine during a run cannot change its frozen snapshot. Start Again repeats that original snapshot with fresh identity, even if the saved routine was edited or deleted. Reload/hard-close does not resume an in-memory run.

Routine planned duration includes Prepare, every block and transitions; actual duration includes everything after the authoritative start. Early Release shortens only its retention and shifts subsequent deadlines exactly as in standalone practice. Stop cancels all future blocks and precision audio, stops background and releases the wake lock.

### Routine media and History

All guidance, volume, source, loop and ducking preferences remain global; routines contain no presentation overrides. Entire practice spans the whole routine. Off never starts automatically. Retention only runs during Hormesis block retentions and preserves the native media position between holds/blocks. After practice starts only after the whole routine completes, never between blocks or after cancellation. Universal Prepare/recovery/Full Exhale assets and mappings remain unchanged.

One parent History result is saved per routine run, containing routine ID/name, timestamps, planned/actual duration, total/completed blocks and nested block outcomes (completed/cancelled/not started), planned/actual block durations and their actual retention summaries. Prepare/transitions belong to the parent duration rather than an exercise block. Standalone History fields and behavior remain unchanged. History still lists the 30 most recent parent results.

Saved routine configuration is local IndexedDB data, available offline after the shell and short recordings are cached. Large ambience still requires **Make available offline**; imported media already stores its Blob locally. Routine creation/editing/execution adds no runtime network dependency. Clearing/evicting site data can remove local data; no cloud sync or export is introduced.

### Validation and next boundary

Automated coverage includes stabilization, CRUD/reopen, corrupt values, storage preservation, save/delete failure, immutable compilation, block order/transitions, one Prepare, Release, whole-routine cancellation, stale callbacks, one wake lock/save/update boundary and all background modes. Production Chrome checks use 390×844 viewports and genuine native audio/IndexedDB/service-worker behavior. An isolated clock harness completes long routines without changing production timing. Phone speaker/earbud listening, Android/iOS policies and OS suspension remain physical-device review.

Phase 3B now extends this compiler and History model as described below. Binaural generation, per-block media, journal/craving/habit features, AI/cloud, notifications/haptics/native packaging and arbitrary timing/scripts remain unimplemented.


## Phase 3B meditation and layered noise

Version: `2.0.0-phase3b`. Standalone **Explore meditation** and saved **Meditation** blocks share the deterministic engine. Choose 5/10/15/20/30 minutes or 1–60 whole custom minutes. One universal 4-second inhale / 6-second exhale / 3-second settle precedes the entire run; later blocks use the existing 3-second silent transition. Meditation duration excludes those lead-ins. There is no Pause or Skip. **End Early** cancels the entire session/routine and records actual meditation time, with prior blocks and one parent History result. Start Again repeats the frozen timing configuration with a new identity. Hide timer removes the visible clock without moving deadlines; stage announcements do not announce every tick.

**Meditation Audio:** music Off or use the existing selected background track, existing music level, white/pink/brown noise with an independent 0–35% level (10% default), independent opening/completion signals (On by default), and Silent environment. Defaults, last valid duration and timer visibility persist locally. Saved blocks contain duration and a defaults/silent policy only. Schema 3 is retained; valid older preferences gain meditation defaults without rewriting existing data. Audio choices remain live presentation preferences; saved timing snapshots remain immutable.

No suitable existing chime asset was present. Opening/completion use two quiet sine tones (432/648 Hz), a bounded 1.2-second envelope, existing **Signals** and **Master** volumes, and scoped deduplication. They never own the timer and do not play on End Early, silent blocks, expired return, or twice at a final routine boundary. A new session stops an old ending tail.

Noise uses two independent, periodic Fourier-synthesized channels of 1,048,576 samples each (23.78 seconds at 44.1 kHz / 21.85 seconds at 48 kHz), DC removal, RMS target ≤0.12, peak ≤0.5, and low-frequency shelves below 20 Hz pink / 40 Hz brown. White has equal power per Hz; pink approximates −3 dB/octave and brown −6 dB/octave. Spectrum tests measure octave-band power per Hz from 250 Hz through 16 kHz with ±0.5 dB/octave tolerance. Periodic synthesis avoids a join splice; subjective loop audibility still needs phone/headphone review. Generation yields between bounded FFT tasks and is cancellable; playback uses native looping nodes, with no per-sample JavaScript, microphone, worklet download or ScriptProcessor. Cache holds at most two 8 MiB stereo buffers (16 MiB); color changes crossfade for 300 ms. Working arrays temporarily add memory during synthesis.

Music remains one streaming HTMLAudioElement with **BackgroundGain as the only volume writer**: Master × Background × transport × voice duck. It joins a shared Web Audio output compressor after Master, so Master is not multiplied twice. Noise has its own transport/duck/level gains before Master; voice/breath/signals retain their buses. The shared output compressor reserves digital headroom across all layers; sliders cannot guarantee a real-world sound pressure level. Keep device/headphone volume comfortable. Noise ducks to 40% under actual spoken voice with a 250 ms ramp and 300 ms release grace; breath sounds alone do not duck it. Hiding, Stop, End Early, source changes and pending synthesis invalidate stale work. No node graph is created by React renders.

| Global mode | Meditation music On | Meditation music Off / silent block | Outside meditation |
| --- | --- | --- | --- |
| Off | Selected track plays | Suppressed | Off |
| Entire practice | Same player continues, preserving position | Suppressed through meditation lead-in/block | Entire practice resumes |
| Hormesis retention only | Selected track plays | Suppressed | Retention pause/resume behavior |
| After practice | Selected track plays during meditation | Suppressed | Starts only on successful whole-parent completion |

This override includes the lead-in to meditation. A new environment ramps from zero during Prepare toward its level at 13 seconds; a later block ramps during its existing 3-second transition. Source generation/loading never delays the authoritative engine. If late, audio joins with a smooth remaining lead-in (minimum 700 ms), so slow-device audio can reach level after meditation starts. Entire-practice media already playing is preserved without a second player or restart. Audio fades and voice ducking affect presentation only.

Built-in tracks require an explicit offline copy; imported audio is local already. Missing offline music gracefully leaves noise or silence, with unchanged deadlines. The app shell, all short guidance assets and local synthesis work offline after installation/first load. Preview requires a user gesture and stops on leaving setup, starting a run or hiding the app. Noise is a masking bed, not active noise cancellation; color names describe spectra rather than guaranteed health outcomes. Brown may mask high-frequency interruptions less effectively. Android/iOS locked-screen playback is not guaranteed.

Natural noise endings fade over 700 ms; End Early/Stop cancels with a 50 ms anti-click fade. Hidden graphs are disconnected immediately.

Validation: **207 passing tests across 10 files**, including 53 new meditation domain, policy, persistence, signal, spectrum and lifecycle checks and all 154 baseline tests. Browser evidence covers native audio, mobile layout, offline process restart, real Prepare, live Pages and installed Chrome. Physical speaker/headphone listening remains the next acceptance step. **Historical Phase 3B boundary (superseded below):** the AudioEnvironmentPort exposes a stereo-capable pre-Master input for an independent future tone bus; it should get its own scoped envelopes and two channel-specific oscillators. Noise is not a binaural carrier. Await sensory acceptance and research-informed design before implementing that phase.


## Phase 3B.1 — unified meditation sound environment

Version `2.0.0-phase3b1`. The Phase 3B section above documents the earlier implementation; this section supersedes its live noise/output/UI behavior. Work remains on `breathwork-buddy-2`, with the existing Actions deployment and `/Breathwork--Buddy/` base, manifest and service-worker scope.

**Meditation** is now a permanent destination alongside Home, Practice, Journal, History and Settings, with `#meditation` deep links. Six touch targets use two columns on phones so long labels remain readable at larger font sizes. Setup waits for persisted preferences, with a usable fallback and saving error if storage fails. Convenient durations retain 5/10/15/20/30 and add 45/60 minutes; custom 1–60 whole minutes remain valid.

One **Sound environment** presents Generated, Selected audio or Mix; independent masking and binaural levels; and the existing music library, built-in offline-copy controls and local imports. Silent environment turns all meditation layers/signals Off. Individual music previews are omitted from the inline library; Preview environment auditions the selected combination for at most 20 seconds. Navigation, Start, Stop preview, source/recipe changes and hiding cancel previews. No additional streaming player or upload path was added.

**Warm** is the default brown-based listening texture; **Balanced** retains the pink ID; **Broad Masking** retains white. Existing choices, Off states, noise levels, track IDs, imported Blobs, history, routines and schema 3 survive normalization. Binaural is an additive `{mode, level}` preference, default Off with a quiet 0.08 level and a 0–0.30 range. Optional width/warmth knobs are deferred. Generated masking is centered: the same periodic wave is copied to both channels, while tones retain separate left/right signals. Original color generators remain internal diagnostics only.

Warm/Balanced/Broad use fixed random-phase periodic Fourier synthesis with low-frequency roll-offs at 60/90/120 Hz and soft high roll-offs at 1400/1800/3500 Hz respectively, underlying power exponents 2/1/0, precomputed circular 0.5-second energy calibration bounded 0.8–1.25, DC removal, RMS ≤0.10 and sample peak ≤0.50. No playback AGC is used. Cooperative cancellable generation and the two-buffer cache remain bounded. The pre-binaural native gate found brown one-second RMS CV fell from 5.43% to 0.86%; pink 1.91% to 0.40%; white 0.33% to 0.24%. Natural short-window noise fluctuations remain. Independent old channels and intrinsic low-frequency variation explained the measured wandering; bypassing the compressor did not remove it. The old compressor also supplied measurable makeup gain.

The adaptive output compressor is replaced by a fixed 0.25 output trim and a memoryless stereo safety curve (identity through ±0.85, soft ceiling below ±0.95; 4× oversampling). Voice, breath, signals, masking and binaural pass through their existing/independent gains before Master. Music retains BackgroundGain as its only volume writer, including Master once, and joins after Master before the common trim/ceiling. This deliberately lowers overall output compared with the old makeup-gain path. Keep device volume comfortable; desktop digital checks do not measure headphone sound pressure.

`BinauralController` observes the existing engine's meditation window and monotonic clock. Baseline is L194/R198 Hz; Layered adds L245/R249 and L292/R296, with equal pair gains 1/√3, preserving total RMS. Experimental Modulated uses the same three pairs plus one 40 Hz oscillator controlling a shared amplitude gain with depth 0.15 (envelope 0.85–1.15). Sideband/carrier amplitude is 0.075 (−22.50 dBc). The level multiplier is 0.14, so default untrimmed RMS is about 0.00792 per channel, below the default masking RMS 0.01. No reference audio is shipped or copied, and no medical/cognitive, Focus-state or EEG effect is claimed.

At Start, the synthesis mode, masking choice, music inclusion and recipe version are deeply frozen in the practice snapshot; levels remain live. Start Again reuses that recipe with a new session ID. Entry/Steady/Return change amplitude only: 10 minutes = 1/8/1, 15 = 2/11/2, 20 = 2/15/3, 30 = 3/23/4, 45 = 4/35/6, 60 = 5/48/7. Other 10–60-minute durations use rounded 10% Entry and 12% Return in seconds, with the exact remainder Steady. Tones rise 0→0.2 during the universal 13-second Prepare or later 3-second transition, then 0.2→1 in Entry and 1→0 in Return. Masking/music reach their chosen level during the lead-in and remain steady except for explicit voice ducking/user adjustments. Short standalone binaural Start explains the 10-minute minimum and requires a longer choice or Off; saved short blocks remain valid and explicitly use masking/music only without mutating the saved mode. Silent blocks suppress every meditation layer and chime.

No new meditation timer, Pause/Skip, database schema or locked-screen service was introduced. Whole-parent End Early, actual durations, one result per run, Prepare once, retention Release, Full Exhale, wake-lock/update protections and existing audio assets are preserved. Optional sound metadata is additive to History. Hiding disconnects old tone graphs; returning joins at the current envelope, without replaying Prepare or expired signals.

Validation at Phase 3B.1 delivery: **294 tests across 11 files**, type check, production build, PWA artifact check, native Chrome OfflineAudioContext frequencies/stereo/sidebands/envelope/mixed-headroom measurements, full breathing/media regressions and 320/360/390/430-pixel layouts at 16/24/32-pixel root font sizes. The optional native DSP harness lives in `scripts/dsp-harness`; build it with `vite build --config scripts/dsp-harness/vite.config.mjs --configLoader native`, then run `node scripts/verify-meditation-dsp.cjs all` with Playwright available through NODE_PATH and Chrome installed (CHROME_PATH may override). It is excluded from the production PWA. Physical phone/headphone listening remains a user acceptance step.

## Phase 4A — composable breathing blocks

Version `2.0.0-phase4a`. Home/Practice → My Routines retains saved practices and adds **Custom Pattern**, **One Hormesis Round** and **Natural Settling** alongside the existing preset patterns, full three-round hormesis and meditation. Each block can be reordered, duplicated with a fresh ID, removed and saved. Editing retains identity. Invalid fields stay in the draft with contextual explanations; unsupported records still require explicit repair. Routine names remain 1–80 characters and routines 1–20 blocks.

New additive persisted shapes (each also carries its stable `id`):

```json
{"kind":"custom-pattern","presetId":"custom-pattern","inhaleSeconds":4,"holdInSeconds":4,"exhaleSeconds":6,"holdOutSeconds":0,"cycles":5}
{"kind":"hormesis-round","presetId":"hormesis-round","intervalSeconds":2,"cycles":20,"retentionSeconds":90}
{"kind":"settling","presetId":"settling","durationSeconds":120}
```

Custom inhale/exhale accept whole seconds 1–20, independent holds 0–20, cycles 1–100, and total breathing duration at most 1,800 seconds. Zero holds create no stages or cues. The exact duration and hold roles appear in the editor. Legacy presets remain duration-based. Existing generic In/Out/Hold clips and breath samples are bounded by stage deadlines; no spoken custom-duration asset or time stretching is introduced. Breath recordings can end before a longer custom phase, while the engine and visual deadline continue.

Independent hormesis supports only 20/30/40 breaths, 2/3-second inhale/exhale, and 60/90-second retention targets. It shares a round compiler with legacy full prescriptions and omits multi-round announcements. The final normal exhale is replaced by the established four-second Full Exhale. Release works immediately, cancels pending retention cues and begins the same 4/15/6/3-second recovery. The target is optional, never a requirement. Safety guidance explains seated/lying practice, early Release, dizziness/fainting, unsafe settings and stopping with symptoms.

Settling accepts 30–600 whole seconds and has one `natural-settling` stage labeled **Breathe naturally / settle**, with no breath pacing, hold or countdown cues. It proceeds automatically. A ready-gate is deferred.

All saved blocks compile into one immutable parent: Prepare 4/6/3 once, precisely one silent three-second transition between blocks, and one result. Planned routine duration includes Prepare, transitions and target retentions; early Release shortens actual time and shifts every later deadline. Stop cancels the parent and reports completed/cancelled/not-started blocks. Custom History adds configured phase durations and requested/completed full cycles; single-round History adds preparation, target, actual retention outcome and recovery completion. Settling uses existing planned/actual block durations. Prior History fields and rows remain readable. Start Again retains the Start-time timing/sound snapshot.

Dexie remains schema **3**: no row rewrite, migration, deletion, new table, preference reset or imported-media change. Warm/other textures, oscillator recipes, gains/ducking, the single long-media player, meditation policy and PWA scope remain as in 3B.1. Retention-only background now recognizes the new round kind. Continuous sound across breathing/recovery/settling is reserved for **4B**; the existing `sessionId`, `stageId`, `blockId`, `stageStart`, `deadline` and meditation-window events are its integration boundary.

Phase 4A automated regression: **347 tests / 12 files**, including all 294 prior tests. Type checking, production build and PWA artifact checks pass. Native Chrome QA covers the exact example, immediate Release/full recovery, natural settling, Warm/Layered meditation, Stop/cleanup, imported Blob preservation, offline browser-process restart and editor widths 320/360/390/430 with 16/24/32-pixel root text. Desktop tests do not establish physical Android/iOS or headphone behavior.

Optional reproducible browser checks (Playwright must be available through `NODE_PATH`; `CHROME_PATH` can override Chrome):

```sh
pnpm exec vite build --config scripts/routine-harness/vite.config.mjs --configLoader native
node scripts/verify-modular-routines.cjs
node scripts/verify-modular-installed.cjs
# After deploying this branch, verify HTTPS installed PWA:
node scripts/verify-modular-installed.cjs --live
```

The QA entry uses an injected clock with native Web Audio; the normal production/offline and installed checks use the actual app build. Generated screenshots and evidence stay in ignored `qa/`; installed-PWA profiles use a short OS temporary path to avoid Windows CacheStorage path limits; the harness is excluded from the production bundle and service-worker precache. Consult the Phase 4A handoff for actual installed/deployment status and the physical-phone checklist.


## Phase 4B — one acoustic environment and recorded bowl

Version `2.0.0-phase4b`. My Routines now configures **Sound from Start**, with Warm generated, Selected audio, Warm + Companion, or Off. New routines start with Warm; opening an old row leaves its foundation absent and retains its old background choice. A legacy Entire-practice track also continues into an inherited Meditation block, fixing the reported Floating cutoff. Custom blocks and explicit Silent take precedence.

Meditation blocks support **Use Meditation sound defaults**, **Customize This Block**, and **Silent, including signals**. Custom stores an exact independent recipe: masking/media identity, levels, loop, established binaural mode, and independent opening/closing signal choices and level. Defaults resolve at Start. New custom blocks default opening Off / recorded closing Bowl On at 50% signal level. Short blocks remain valid and omit tones under 10 minutes. Standalone meditation retains legacy signal defaults and adds an explicit Recorded singing bowl choice. Balanced/Broad are moved to advanced legacy choices; their IDs and synthesis remain supported.

Additive JSON fields, without changing Dexie schema 3 / browser version 30:

```json
{
  "foundation": {
    "version": 1, "texture": "brown", "source": "none",
    "noiseLevel": 0.1, "musicLevel": 0.4, "loop": true,
    "mode": "off", "toneLevel": 0.08,
    "opening": "off", "closing": "off", "signalLevel": 0.7
  }
}
```

A custom meditation adds `audioPolicy: "custom"` and `sound` with the same versioned shape. Signals are `off`, `legacy`, or `bowl`; sources are `none`, existing built-in IDs or device-local import IDs. Invalid saved recipes are rejected and remain stored until explicit repair/Save. No silent clamp, migration, new table, upload, or rewriting of older rows occurs.

`FrozenSound` retains its version-1 fields and optionally adds `environment: {version:1, foundation?, blocks, legacyBackground, legacyMusicLevel}`. Runtime resolves every inherited/custom/Silent block once. Compiled meditation stages carry their resolved `soundRecipe`; History records the resolved metadata per block. Source choices, loop and signal design remain fixed for the run; existing live level adjustments remain available. Start Again reuses the entire frozen environment.

One parent identity owns the Warm source through compatible boundaries. Binaural profiles still begin only in the established meditation lead-in, with original stereo carriers/envelopes. Warm is steady without repetitive voice ducking; the single media player retains BackgroundGain as its sole volume writer and its established voice attenuation. Same-source boundaries preserve transport/position. True changes use conservative linear 25-second ramps; the last 25 seconds of a predictable settling window can begin the handoff. A three-second transition alone starts the long fade into meditation. Explicit silence instead fades within the available pre-boundary window and enforces silence at the block. Incoming media/generated readiness is checked before retiring the outgoing other component. Missing media reports an error and keeps an available prior bed rather than deleting data. Media-to-media uses one controlled fade-out/switch/fade-in, without a second player. Stop, hide and superseding identities invalidate late work; no session clock or breathing scheduler was added.

The original user recording `public/audio/signals/Singing Bowl Signal.wav` is bundled byte-identically: stereo signed 24-bit PCM, 44,100 Hz, 14.988027 seconds, 3,966,522 bytes. SHA-256: `a51cd3515750342723df6db5322878534b11e9661be69d7f73241b0a8ffda1ee`. No conversion, trimming or normalization was necessary for tested Chrome. Retaining the authentic PCM costs 3.78 MiB; the per-file precache budget is explicitly 5 MiB. This is the only newly published recording, authorized by its owner for this phase. Source sample peak is 0.015229 / -36.35 dBFS, RMS 0.001598 / -55.93 dBFS, with no clipped samples. A bounded fixed playback multiplier of 8, independent signal level, 8 ms attack and 25 ms terminal taper preserve its natural dynamics/decay through the shared Master/output. The new custom default is intentionally quiet, pending physical headphone acceptance.

Closing fires once on natural block completion, can ring for the true 15-second tail after parent completion, and does not extend History or hold wake lock. End Early never closes. Stop/new Start/hide/Silent cancel tails and pending decode callbacks. Consecutive enabled strikes replace earlier tails rather than overlapping. Environment previews remain bounded to 20 seconds; signal preview uses the actual sample, with navigation/Stop/source changes/Start/hide cancellation.

Phase 4B regression: **393 passing tests / 13 files**, retaining all 347 earlier cases and adding 46 acoustic recipe, lifecycle, recording, storage and editor cases. Native browser QA adds custom block duplication/independence, real library selection without accidental form submission, 320/360/390/430 widths at 16/24/32 root text, offline full-process restart with imported synthetic Blob preservation, uninterrupted Warm, Floating identity/position, long fade, Silent, early Release/full recovery, natural bowl tail, hide/rejoin and maximum layered mix. Desktop Chrome installation verifies actual standalone offline Start/Stop, custom saved shapes, database version 30 and cached bowl. See the external Phase 4B handoff for final live deployment evidence and physical phone limitations.

```powershell
$env:NODE_PATH='C:\Users\smith\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
pnpm exec vite build --config scripts/routine-harness/vite.config.mjs --configLoader native
node scripts/verify-acoustic-environment.cjs
node scripts/verify-modular-routines.cjs
node scripts/verify-modular-installed.cjs
node scripts/verify-modular-installed.cjs --live
```

QA profiles/evidence are isolated/ignored. Native graph measurement cannot establish acoustic headphone comfort, Bluetooth, Android/iOS playback, lock screen or calls. Use the normal idle update path; do not clear app data or uninstall the user's PWA. Phase 4C is not started.
