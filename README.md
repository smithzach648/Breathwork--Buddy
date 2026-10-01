# Breathwork Buddy 2.0

A personal, local-first breathwork PWA. Phase 2 adds guided practice and recent session history to the Phase 1 shell. No accounts, runtime cloud services, external fonts, breath animation, or gamification.

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

Patterned sessions offer 3, 5, or 10 minutes, defaulting to 5. Zero stages are omitted and the final stage is clipped at the total deadline.

Hormesis offers 2- or 3-second inhale/exhale intervals; 20, 30, or 40 breaths per round; and three retentions of either 60/60/60 or 60/90/90 seconds. Defaults are 2-second intervals, 30 breaths, and a 15-second recovery hold. Recovery is always a 2-second inhale followed by a 10/15/20-second hold. The legacy extended final breath is intentionally omitted: every breathing cycle uses the selected interval.

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

## Local audio

All filenames are preserved. URLs encode each path segment and use Vite's project base.

| Logical ID | Actual filename |
| --- | --- |
| `voice.in`, `voice.out` | `breath-in.mp3`, `breath-out.mp3` |
| `voice.hold60`, `voice.hold90` | `60 second hold.mp3`, `90 second hold.mp3` |
| `voice.recoveryBreath`, `voice.hold` | `Recovery Breath.mp3`, `Hold.mp3` |
| `voice.one` through `voice.five` | `count-1.mp3` through `count-5.mp3` |
| `breath.in4`, `breath.in6` | `Inhale 4 second.mp3`, `Inhale 6 second.mp3` |
| `breath.out4`, `breath.out8` | `Exhale 4 seconds.mp3`, `Exhale 8 seconds.mp3` |
| `ambience.floating`, `ambience.homeAgain` | `Floating.mp3`, `Home Again.mp3` |

There is no six-second exhale recording. The user approved the four-second file for four-second phases and the eight-second file faded at six seconds for six-second phases. Hormesis uses the four-second sources cut/faded at two or three seconds. Samples never loop inside a phase. The physical file duration never sets practice timing.

Both user-supplied ambient tracks are tracked and published with explicit user authorization. They are catalogued for future use, excluded from automatic preload/precache, and have no playback/mixer controls in Phase 2. Voice/breath files are all precached. Master/Voice/Breath sliders update independently during a running session and persist locally; future Ambience/Signals preferences remain preserved.

## Results and storage

Dexie database `breathwork-buddy-v2` preserves the original version-1 tables: preferences, routines, journal, history, migrations. Explicit version 2 adds the history `outcome` index. Existing rows and settings survive the upgrade; added result fields are optional for old rows.

Every completed/cancelled practice writes an idempotent result containing preset/name, timestamps, planned/actual duration, completed stages, and Hormesis rounds/actual retentions with completed/released/cancelled outcome. History shows the 30 most recent results. Failed writes remain available for explicit retry while the page remains open; closing before a write finishes cannot guarantee persistence. No legacy import occurs. `localStorage["breathwork_data"]` is only checked for presence and remains untouched.

## Visibility, wake lock, and updates

Timing continues logically while hidden. Audio is cancelled on hiding; on return the engine reconciles elapsed deadlines, skips expired phases/cues, and schedules only future retention countdowns. It never extends a hold to accommodate a late callback. Returning after the final deadline records completion at that deadline.

Screen wake lock is optional and requested only during an active visible practice. Stop/completion/hiding release it; visibility return reacquires it. A generation check immediately releases stale grants. Denial/unsupported browsers do not affect practice.

Mobile operating systems can suspend pages, audio, and timers. Wake lock cannot guarantee background execution; monotonic clock behavior across device sleep varies by platform. Foreground use remains the intended workflow. Hard closing the page ends in-memory execution; sessions do not automatically resume across a reload.

New service workers wait for user activation. During practice the update notice explains deferral and hides **Update app**. The activation handler also checks the live engine state before proceeding. Completion or Stop restores the button.

## Pages and offline

Live: <https://smithzach648.github.io/Breathwork--Buddy/>.

`.github/workflows/pages.yml` runs locked install, type checks, tests, production build, and artifact validation on pushes to `breathwork-buddy-2`, then deploys through GitHub Actions/Pages. It never writes/merges `main`. Pages uses Actions as its source and the environment permits the modernization branch.

Vite base, manifest identity/start URL/scope, and worker scope are `/Breathwork--Buddy/`. The worker precaches shell, icons, manifest, and all 15 voice/breath files. Navigation falls back to the project-path index. Large ambient MP3s are deployed but excluded from the practice cache. Allow initial installation to finish, then reload once under the worker before testing offline.

Production browser validation covers every preset's start/transition/Stop/restart, offline reload and practice, decoding all cached recordings with HTTP cache disabled, saved History, mobile overflow, and absence of external requests/page errors. An isolated test-only clock build exercises full Hormesis flows and update protection; its debug controls and shortened execution are never part of `dist` or Pages.

## Phone review and next boundary

Check Chrome/Android and Safari/iOS installation, airplane-mode cold relaunch, audible phase/countdown timing, early release, rapid Stop/restart, background return, wake lock, volume persistence, History, large text, screen-reader stage announcements, landscape, and an update during practice. Listen specifically to two- and three-second breaths: dedicated short recordings are recommended only if the truncation sounds abrupt or unnatural. Check the two-second recovery phrase for clarity too.

Phase 3 remains deferred. Recommended next scope is phone feedback first, then simple local journal/reflection and carefully designed routine composition. Legacy migration should have a backup/preview and idempotent validation before any data writes. No routine builder, journal editor, advanced analytics, AI/TTS, cloud/backend, notifications, haptics, native packaging, or ambience mixer is implemented here.
