# Whole cycles, audible Soft Felt and one sound-environment selector

Requested after Zach's mobile listening review on November 17, 2026.

## Result

New ordinary breathwork starts use a whole cycle count instead of a time limit. A cycle includes the entire inhale, optional holds, exhale and final rest. The displayed duration is derived from the count. Marshall's existing 25-second introduction remains separate. Routine preset-breathing blocks have the same cycle control; custom patterns and Hormesis already use cycles/breath counts. Full meditation journeys retain their fixed preparation grids and complete-cycle groups.

New cycle prescriptions store both count and its exact derived duration. Validation rejects partial, noninteger or mismatched prescriptions and caps a block at 100 cycles / 30 minutes. Old time-based configs, saved routines and History stay readable and replayable. Editing an old timed block offers an explicit cycle replacement; opening it does not guess or rewrite a count. History records requested and completed cycles, including only fully completed cycles after Stop.

Soft Felt note peak is restored from 0.10 to 0.25 (optional hold 0.07 to 0.175). The timbre, 75 ms rounded attack, exponential decay, 240 ms release, 0.86-second note length and separate note each second are unchanged. The gentle contour provides softness at an audible level. All existing master/breath/journey volume controls remain independent. No files or narration were regenerated.

The meditation timer now presents one Sound environment dropdown: Threshold, Expansion, Timeless, Open, Beyond sound journey, or Silence. New starts default to Threshold when only old masking/binaural preferences exist. The scene freezes its complete original recipe; there is no separate masking or binaural mode selector. Live sound balance, optional companion audio and signals are tucked into details. No carrier-frequency controls have been added.

Every new timer starts directly, with no preparation or narration. Silence suppresses the environment, companions and signals. Beyond needs at least three minutes; individual scenes support one to sixty minutes. Routine meditation blocks use the same scene choices in one dropdown, plus Use Meditation sound default. New routine starts resolve that default to a developed scene. Previously pinned legacy custom recipes remain unchanged until an explicit new scene is selected.

## Validation

- 659 tests / 21 files pass, including 21 additional cycle/environment/instrument checks.
- Production, native harness and laboratory typechecks/builds, PWA and preserved-asset checks pass.
- Native Chrome at 44.1/48 kHz verifies completion after the very last hold, cycle History, direct timer scenes and Silence, saved-routine scene playback, and one AudioContext with no duplicate legacy synthesis.
- The native isolated Felt note peak is 0.0620 / 0.0621 after fixed output trim at unit master. Its attack begins at zero, all PCM is finite, and maximum-mix headroom regression checks pass.
- Developed environment selection survives reload and works offline. Existing voice/mixer/native parity and real service-worker update regressions pass. Original 31 audio/icon assets are unchanged. No new ElevenLabs credits spent.
- Mobile timer layout checked at 320/390/430 px; screenshot reviewed. Physical headphone level preference remains for Zach to assess.

Evidence: `qa/cycles-environments/verification.json`, `qa/listening-update/verification.json`, `qa/meditation-refinement/verification.json`. Repeat the new native check using `scripts/verify-cycles-environments.cjs` after building production and the routine harness.

The separate Breathward design prototype also changes its breathing and routine controls to cycles. It remains a silent design preview with its own local journal storage; production navigation and the app's name have not been changed.
