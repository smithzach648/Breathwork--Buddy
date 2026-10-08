# Breathwork Buddy 2.0

A personal, local-first breathwork PWA. Phase 3A stabilizes Prepare and background ducking, and adds saved routines compiled through the existing deterministic engine. The deterministic engine, preparation/recovery flow, and History remain intact. No accounts, runtime cloud services, external fonts, breath animation, or gamification.

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

Phase 3B/3C remain deferred. Review Full Exhale at both cadences; try Breath ON/Spoken OFF/General ON, Breath OFF/Spoken ON/General ON, Breath ON/Spoken ON/General OFF, and all guidance OFF. Check both built-in tracks, voice ducking, retention-only position continuity, After practice controls, local phone-file import/reopen/delete, storage estimates, and airplane-mode playback on speaker and earbuds. Saved routine composition is now implemented as described below. No craving/habit mode, journal editor, meditation timer, AI/TTS, cloud/backend, notifications, haptics, or native packaging is implemented here.


## Phase 3A stabilization and saved routines

Version: `2.0.0-phase3a`. The stabilization gate passed 121 tests before routine-builder implementation began; the full Phase 3A suite currently passes 154 tests across eight files.

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

Phase 3B should be planned only after this phone review: a bounded meditation block/timer can extend the same compiler and History model, with its own explicit product/audio decisions. Binaural generation, per-block media, journal/craving/habit features, AI/cloud, notifications/haptics/native packaging and arbitrary timing/scripts remain unimplemented.
