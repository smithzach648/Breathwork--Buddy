# Recovery sound and listening controls — 2.1.0

Implements the November 22 approval to deploy the recovery hold sound, listening preview, quick session sound controls and visible release information. The broader signal/environment redesign is explicitly deferred.

## Recovery holds

New modern breathing starts use warm chord pulses during **Hormesis recovery holds only**. The fixed D3/F3/A3 chord pulses once per second; a four-pulse emphasis pattern changes the blend rather than making an ascending/descending breathing contour. The existing Soft Felt instrument, attack, decay and short release are retained. Equal-energy weights keep average power comparable to the previous single note; the sum remains bounded with ample output headroom. This is a presentation change, not a different breathing protocol.

Choose **Warm chord pulses**, **Quiet**, or **Single note · previous sound** before Hormesis, before a routine containing it, in Settings, or through the live Sound panel. Quiet affects recovery tones only; the selected narration and visual timer remain. Other breathing/hold tones, final-breath chimes, singing bowl recording, journey pacing and acoustic recipes are unchanged. Counts, deadlines, retentions, early Release and recovery duration are unchanged.

The selected sound is frozen onto the new snapshot/recovery stages and recorded in History. Explicit old frozen replays retain their original single-note behavior. Live changes cancel incompatible scheduled recovery notes, release an already sounding pulse gently, and schedule only future whole-second pulses. They do not replay a missed pulse after resuming. New sessions reset all transient overrides.

## Preview

The setup preview uses the **same instrument and pulse scheduler** as live practice. It samples shortened inhale/hold/exhale sounds for the selected pattern; Hormesis samples recovery tones. It is 6–12 seconds, contains no retention, voice or bowl, and explicitly asks the user to breathe naturally. Quiet still previews the ordinary inhale/exhale sounds around a quiet recovery hold.

A preview never creates a session, changes protocol timing or writes History. It respects Master, Breath and Breath sounds. Another preview, Stop, navigation, a real Start, visibility loss or audio suspension cancels it. A generation check rejects late unlock work. It is synthesized locally and works offline without new recordings or voice credits.

## Quick sound controls

The **Sound** button is available in the app header during a running practice or journey. A modal panel keeps the active session in place, traps focus through the browser's native dialog, closes with Done/Escape, and returns focus to the trigger.

- Practices: Master, Narration, Breathing tones, selected practice background level and Singing bowl. Practice guidance exposes narration/recovery sound choices. No background is silently enabled if none was selected.
- Acoustic meditation additionally exposes the existing Warm and binaural mix levels.
- Journeys reuse the existing five-layer journey mixer, plus Master, preserving the current live mix and recording mix changes through the existing path.

Existing gains/players remain the only output path; changes do not create a second AudioContext, restart a track or reset the session clock. Live background level is supplied to the existing pure environment plan, preserving retention-only gating and the smooth settling-to-meditation fade. It does not rewrite a saved routine's recipe. Device preferences retain edited levels for future practice setup. Active recorded bowl adjustment uses a gain after its original envelope, so it changes level without replaying or replacing the recording.

## Release information

Settings displays **Breathward 2.1.0**, release date and a **What changed** disclosure. Future releases should update `src/shared/release.ts`; PWA identity/scope/database schema remain unchanged.

## Validation

Unit coverage checks equal-energy fixed-frequency chord emphasis, Quiet isolation, unchanged stage deadlines across all three Hormesis options/sound choices, old snapshot/journey isolation, preferences, preview cancellation/no History, crossfade behavior, live bowl gain without a replay, and dialog controls/Escape focus restoration. Native checks render actual PCM at 44.1/48 kHz, compare chord/single RMS and peak/seam bounds, verify all 45 scheduled voices for a 15-pulse recovery hold, exercise live Quiet/single/chords and mix changes, and test visibility/AudioContext interruption without changing deadlines or replaying the bowl.

The installed-upgrade check preserves routines/history/journal/draft and prior settings, adds only the default recovery sound, checks saved choices/release information, and exercises preview/practice/mixer offline. Phone-width layouts are checked at 320/390/430 px with normal and enlarged text. Native screenshots/reports live in local ignored `qa/recovery-comfort`.

Browser visibility/audio interruption tests are not physical phone screen-lock or incoming-call tests; those still need the user's actual device. No new health claims or changes to the user's breathing protocol were introduced. No audio or brand assets were regenerated or altered.
