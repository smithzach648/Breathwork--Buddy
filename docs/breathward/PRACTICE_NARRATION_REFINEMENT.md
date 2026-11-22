# Practice narration: Full, Brief and Off

Implements the November 22 feedback: preserve the spacious journey narration, reduce pauses elsewhere, and provide lighter or silent breathing guidance, particularly for Hormesis.

## User experience

Practice narration is available before standalone breathing, before a routine, in Settings, and in a collapsed “Practice voice” control during breathing. The preference is saved on this device and also applies when starting existing saved routines.

- **Full** explains the exercise with the original, natural-paced Marshall recordings. Added action pauses are absent, and each introduction ends shortly after its actual speech. Foundation Hormesis now has a 50-second introduction slot, Advanced 53 seconds and Two rounds 47.5 seconds, replacing the previous 90-second slots. No speaking speed or pitch was altered.
- **Brief** announces each breathing practice in a short phrase. It skips the shared routine introduction, extensive explanations and optional gentle retention narration. Hormesis keeps round announcements, the final exhale cue, a short “Let the breath pause,” recovery cues and the spoken five-count.
- **Off** skips exercise introductions and all spoken practice cues, including the spoken countdown. Soft Felt notes, final-breath chimes, recorded meditation bowls, visual timing, on-screen precautions and Release remain available. The existing 3-second round-announcement stages remain as short round transitions; the long introduction is removed.

Live changes silence incompatible playing/scheduled speech immediately. Future phases use the new mode. The current stage deadline is preserved; shorter introductions apply at the next start. Enabling speech does not replay expired cues. Gentle hold guidance is disabled in the setup UI under Brief/Off, with the stored preference retained for Full.

Journey speech, action pauses, narration assets, voice settings and timing are independent of this preference. Existing global voice/breath controls still apply. No new safety gate or compulsory acknowledgment was added; existing Hormesis precautions remain visible before Start in every mode.

## Audio and compatibility

38 additive assets: 28 untouched original-generation MP3s copied under `practice.compact.*` identities, nine short exercise excerpts, and one short retention excerpt under `practice.brief.*`. Brief excerpts end at previously measured quiet phrase boundaries and receive a 20 ms tail fade. No words were synthesized, no recording was regenerated and no ElevenLabs credits were spent. The original 28 published practice recordings, all journey recordings, original audio and brand assets are preserved byte for byte.

`COMPACT_PRACTICE_PRODUCTION.json` records source identity/hash, exact excerpt boundary, decoded duration, published hash and zero new credits. `scripts/prepare-compact-practice.py` can reproduce the assets from the retained local `narration-auditions` originals. `scripts/verify-practice-narration.cjs` verifies production playback and both native decoding rates.

New modern starts opt into `{version:'concise.1',mode}` on the practice snapshot. Configurations without the field still compile to their previous timing. The common runtime start path applies the device preference to new sessions; explicitly supplied frozen sound replays preserve their original configuration. Results record the starting narration choice. No routine/history records or database schema were rewritten. The PWA caches both the retained originals and new assets for offline use.

Breathing cycles, per-phase duration, Hormesis rounds/targets/recovery, final-breath signal, early Release and meditation duration are identical across modes. Only spoken introduction time changes. Setup totals are calculated from the selected mode.

## Verification

Unit coverage includes all four breathing patterns and all three Hormesis options, full routines, exact non-introduction stage equivalence across modes, five-count cue placement, Off suppression, journey isolation, preference validation/persistence, common-start behavior, result metadata and old frozen replay timing. Native checks cover live cancellation, all 66 practice asset hashes/durations/peaks at 44.1 and 48 kHz, journey narration with practice Off, mobile layouts, an actual service-worker upgrade with unchanged local records/draft/journey preferences, saved mode across reload, and offline Brief Hormesis/Off routine starts.

Two existing laboratory checks exceeded local CPU wall-clock limits while all sample comparisons passed. The channel-equality check now compares complete channels once instead of invoking a matcher for every sample; it retains exact equality for every sample. The full typed-array seeking comparison retains both exact comparisons with a 15-second wall-clock allowance. Laboratory DSP and all its expected outputs remain unchanged. These test-run allowances do not affect app timers.

Physical phone/headphone listening and screen-lock testing remain user checks.
