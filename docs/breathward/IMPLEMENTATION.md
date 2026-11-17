# Breathward production design

User explicitly approved implementing and deploying the previously separate Breathward design on November 17, 2026. This release brings that design into the real application; it does not deploy the silent prototype as the app.

## Entry points

- Home: serif typography, green illustrated practice card, Breathe / Meditate / Take a journey paths, and an invitation to write.
- Practices: All / Breathe / Meditate / Journeys filters and ready-to-use cards. Every breathing pattern, both fixed Hormesis options, sound-only meditation and both full journeys use the existing session/audio engine. Selecting a card opens real setup, not a demo.
- Saved: persistent practice favorites, a simple two-block routine builder, existing routines and the full block editor through My Routines. The simple builder stores the existing validated routine format, fixed Hormesis prescriptions, complete sound recipes and the same three-second transition.
- Reflect: local Journal and Practice history tabs. Session results and completed/ended practice screens can open a linked reflection. Returning to that result opens its existing note.
- Settings: top-right control, usable during sessions, with a return action. An active-practice bar provides a way back from the other screens. Navigation does not reset or restart audio, session identity, snapshot or deadline. Session completion does not redirect an open journal editor.

The default journey setup is compact: duration and Start, with customization collapsed. Preparation teaching and refresh remain available. Breathing offers 5/10/20 complete cycles and an optional custom count; Hormesis remains fixed and presents its full precautions. The meditation-afterward option and sound environments remain available.

## Local data and naming

The database remains `breathwork-buddy-v2`, schema 3 (native IndexedDB version 30). Preferences, routine, journal, media and History tables and indexes are unchanged. Journal rows accept optional title, feeling and session name in addition to the original text/timestamps/session ID. Older text-only entries display and edit without identity or timestamp loss. Legacy localStorage is detected but never changed or imported automatically.

Journal supports autosaved drafts across navigation/reload, optional prompts and feelings, safe plain-text rendering, editing, search, JSON export, confirmed deletion/discard and explicit save/draft-storage errors. A conflicting draft is shown before another entry replaces it. Each new draft has a stable identifier, making retries idempotent. Drafts use `breathward-journal-draft-v1`; favorites and the last opened practice use `breathward-ui-v1`. Neither contains authentication data. Notes are never sent to a server or a voice service. Export is a journal backup, not an import/migration flow. Prototype-origin notes remain separate from production-origin notes.

Name, document title, install name/short name and leaf icons are Breathward. The PWA id, scope, start URL and service-worker location remain `/Breathwork--Buddy/` to preserve the existing installation and storage. The public GitHub Pages URL and repository do not change. A phone may refresh its launcher label/icon separately from the in-app update; reinstalling or clearing data is unnecessary to use this release.

## Audio and assets

No audio generation or new ElevenLabs credits. All 63 existing suite/practice recordings, Soft Felt timing/envelopes, acoustic environments and bowl remain unchanged. Original audio SHA pins remain enforced by the build check. The three deliberately replaced app icons have separate explicit pins in `brand-assets.json`; the original laboratory baseline is unchanged. Audio DSP and deterministic timing code are untouched.

## Checks

- 689 tests across 23 files pass, including 16 new journal/navigation/simple-builder regressions; existing navigation expectations were updated to the four-tab design.
- Typecheck and production/QA harness builds pass. PWA installation paths, offline inclusion and production isolation checks pass. The new app name is asserted while stable install identity remains asserted.
- `scripts/verify-breathward.cjs`: real previous-release service-worker update with identical preferences, real History, saved routines and older journal entries; untouched legacy storage; new manifest/title; 320/390/430/900px layouts at 16/24/32px text; favorites across reload; real simple routine save; complete journal save/edit/search/export/link/delete flow and draft restoration; fresh offline native Hormesis, journey and acoustic timer; live mix and one audio context; active-session navigation invariants and writing uninterrupted by completion.
- `scripts/verify-hormesis.cjs`: native 44.1/48kHz checks of both exact protocols, all final-breath chimes and 4/6 pacing, retention countdowns, early Release, automatic meditation, result identity, hash-pinned recordings and offline setup. No audio/protocol changes in the redesign.
- Evidence is written under ignored `qa/breathward`, `qa/hormesis` and `qa/listening-update`. Physical phone screen-lock testing and full-duration headphone listening remain device checks; browser QA does not claim them.

The user-authorized public release and exact commit/deployment evidence are recorded in the workspace post-build handoff. The separate private design preview remains available as a review artifact.
