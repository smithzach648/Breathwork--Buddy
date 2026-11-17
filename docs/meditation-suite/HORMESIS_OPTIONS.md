# Hormesis Foundation / Advanced and optional meditation

Implemented from the approved November 17 specification. Public deployment explicitly authorized.

## Exact practice

- Foundation: three rounds, twenty breaths per round, four seconds in / four seconds out; optional retention targets 60 / 60 / 60 seconds.
- Advanced: three rounds, thirty breaths per round, two seconds in / two seconds out; optional retention targets 60 / 90 / 90 seconds.
- The last cycle is exactly breath 20 or 30, not an extra breath. Both versions finish it with a four-second inhale and six-second exhale. A short 660/880 Hz two-note chime marks the start of that inhale, with a visible Final breath label on inhale/exhale. Signals use the breath bus and obey its mute/volume. No late chime is replayed after suspension/resume.
- Every retention retains the five-to-one spoken countdown. Early Release cancels all remaining cues for that hold and immediately enters recovery. Recovery remains 4 seconds in, 15-second comfortable hold, 6 seconds out and 3 seconds settling. Stop is always available.
- Separate 90-second introductions contain Marshall's profile-specific instructions with locally added phrase pauses. Foundation recording is 76.756 seconds, Advanced 81.220 seconds; each fits in full with room to settle. Intro, round, retention, countdown and recovery text remain visible or available with audio disabled.
- Safety instruction in both new recordings and setup: only sit or lie down safely; never stand, walk, drive or practice in water; stop for dizziness/discomfort; do not force retentions. The user's requested precautions were checked against the official safety guidance at https://www.wimhofmethod.com/breathing-exercises . These are original user-defined schedules, not a claim of official certification or a clinical benefit.

The versioned `hormesis.2` prescription is fixed and validated by value. New IDs are `hormesis-foundation` and `hormesis-advanced`. Legacy two/three-second custom combinations and four-second final exhalations remain valid for replay; no old record is rewritten. Routine builder includes both fixed options alongside retained legacy records.

## Follow-up meditation

Practice setup offers Add meditation afterward for ordinary breathing as well as Hormesis. Turning it on reveals a duration and the existing complete sound environments (or Silence). This builds one parent session with two frozen blocks; it does not save an unwanted routine. After final recovery, one three-second transition leads directly into the meditation. No preparation ritual or second breathing introduction is repeated. The selected scene is frozen at Start, and the combined planned duration is visible before Start. Stopping breathing cancels the entire session and leaves meditation marked unstarted.

Foundation alone: 14:09. Advanced alone: 13:21. With five-minute meditation and transition: 19:12 and 18:24. Early retention Release shortens the actual session and advances its meditation automatically. One parent History result contains actual retentions, the fixed Hormesis prescription and meditation block details. Start again reuses the saved session configuration instead of appending meditation twice.

## Voice production

Two one-take Marshall `eleven_v4` recordings; the existing round, hold, five-count, final-exhale and recovery files were reused. Actual new credits 1,445 (estimate 1,446); previous recorded spend 8,165, cumulative 9,610. No retakes, live TTS, runtime credit use or generated signal files. Original speech samples were preserved before MP3 re-encoding and phrase gaps were extended locally. Exact scripts, generation IDs, hashes, splice points and 44.1/48 kHz measurements are in HORMESIS_MARSHALL_PRODUCTION.json. The production package contains no signed download URLs or credentials.

## Verification

673 tests across 22 files pass, including 14 new protocol, intro-slot, countdown, follow-up, early-release, cancellation and UI regressions. Typecheck, production/harness/laboratory builds, PWA and 31-original-asset preservation checks pass. The two new clips are included in the offline precache (96 entries; about 30.4 MiB).

Native Chrome at 44.1 and 48 kHz verifies both complete three-round protocols, every final breath's two-note chime and 4/6 pacing, five correctly scheduled countdown seconds for all six retention targets, no duplicate signal on reconciliation, no partial signal on resume, early Release disposal of old countdowns, immediate recovery, automatically advanced meditation, one parent result, Stop cleanup, no duplicate legacy sound graph and one shared AudioContext. Both intros are hash-verified, finite, unclipped, and fit their slots at each rate. A fresh offline browser starts Advanced with the new introduction and its prepared sound environment. Mobile layout is checked at 320/390/430 px and reviewed visually.

Existing native live-mix, original sound PCM parity, 21 practice voice recordings and real service-worker data-preserving update checks pass. Native evidence: qa/hormesis/verification.json and qa/listening-update/verification.json. Physical headphone listening and phone screen-lock behavior remain device checks; accelerated tests are not a claim of full-duration human listening.
