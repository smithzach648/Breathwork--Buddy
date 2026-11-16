# Phase 1.1 listening refinement

This updates the real Meditation Suite. Public release and ElevenLabs generation remain held. Approved narration recordings are still absent. The script review and local sound excerpts are review artifacts, not a voiced-release claim.

## Versions and compatibility

New journeys use schema 2, suite `meditation-suite.1.1`, tone policy `soft-steps.2`, narration `preparation-voice.2`, and mix `listener-mix.1`. Original schema-1 snapshots remain valid, including the original 18-cycle 5/5 timing, major-step pitches, triangle/sine instrument, single environment gain and text. `createLegacyJourneyConfig` is an explicit regression/replay path, not a user-facing mode. No stored History row is rewritten.

The new listener preference is an optional `journeyMix` field on the existing preferences row. Older rows gain a default mix during the normal additive preference load; their theme, global volumes, legacy meditation preferences and media settings remain intact. Invalid mix data falls back to Balanced without discarding those other fields. No Dexie table/version change, history rewrite, storage clearing or new database is used. A single-environment read adapter maps its gain to `warm = environment/3`, `binaural = environment/4`, retaining the old effective relative gain when interpreted through the new split path. Old playback itself still uses its original environment bus directly.

Mix changes apply **before a journey starts**, and the screen says so. There is no live scene-mixer control in this phase. The immutable session config stores the exact chosen mix/preset/version; later preference edits affect the next session. Existing global Master, voice permission/volume and ducking controls remain global controls and use their existing smoothed-gain behavior. They are distinct from the saved relative scene mix and from physical headphone sensitivity.

## Instrument

Two genuine native offline prototypes were implemented and rendered: Soft Felt and Warm Wooden. Both use one centered native oscillator per note with a cached band-limited PeriodicWave, no filters/reverb/delay/cloud samples, and a 129-point smooth gain envelope. Felt's relative sine partials are 1, 0.055, 0.012; Wooden's are 1, 0.12, 0.035. Felt attacks over 75 ms, Wooden over 95 ms. Both decay gently and release over 240/280 ms respectively, ending at zero after 860 ms. Each new onset is still exactly one second apart. A single native frequency is assigned per note; there is no frequency slide. Moving-note local peak gain is 0.1, holds 0.07, before the independent note bus and existing Master/output trim.

The new contour spans at most D3–D4 (approximately 146.83–293.66 Hz), for every 1–20-second phase. Up to six attacks select ordered D-minor pentatonic steps `[0,3,5,7,10,12]` semitones; longer phases use evenly spaced log-frequency steps within the same octave, retaining strict direction without multi-octave expansion. A one-second phase uses the middle G3 pitch. Inhale ascends and exhale reverses the same contour. Holds repeat A3 after inhale and D3 after exhale, once per second, including exactly two pulses for a two-second final rest. Legacy pitches and durations stay unchanged for old snapshots.

**Soft Felt is the provisional new default**, following the requested preferred direction and objective comparison. Physical headphone A/B remains a user acceptance step. The genuine offline WAVs compare Felt, Wooden and the original instrument after attenuation to the same stereo RMS; that is not perceived-loudness or SPL calibration. A first-note Hann FFT measures centroid/energy above 1 kHz in the actual native output. Both new candidates have substantially less upper-frequency energy than the original. Separate examples include Felt against Warm, all three balance presets and the two real bowl transitions. Never describe these digital checks as a completed physical listening test.

## Split mixer and gain audit

No second JourneySynth, sound player, AudioContext or Warm source is introduced. `Synth.block` receives an optional internal layer multiplier. Tone scaling occurs after the original pair normalization/envelope/AM path; masking scaling occurs after the original Warm/delay mixture. The contributions meet at the original recipe output trim/ceiling. `JourneySynth.block` passes the same multipliers into the outgoing/incoming layer cores, so both keep absolute source/carrier phase and the original convex smoothstep weights. Source parameters, seed, lab recipes, carrier pairs and per-recipe relative characteristics remain unchanged. Omitted multipliers preserve the laboratory renderer and its five golden WAVs.

The complete scene path is:

1. Original normalized carrier pairs × existing `toneAmplitude` (0.14) × recipe tone level (normally 0.08) × relative binaural listener scale; original AM/envelope rules remain.
2. Original shared Warm samples/delay movement × recipe masking level (normally 0.1) × relative Warm listener scale.
3. Sum → recipe output level 1 and original 0.25 trim/ceiling → journey output level 1 / original smoothstep blend.
4. Production adapter ×4 cancels only that laboratory trim; apply the existing five-second entry, 50 ms resume and final 180-second return envelopes.
5. Existing scene bus (schema 2 fixes its combined level to 1) → optional voice duck (0.65 target) → existing global Master → existing production 0.25 trim and memoryless safety ceiling.

Notes, approved local narration and the authentic bowl use separate buses into the same Master; they never pass through scene-layer scaling. The bowl retains the original fixed ×8 recording compensation and its own listener level. Narration uses its listener level and existing global voice permission/volume. No ceiling or Master is bypassed, and no automatic louder Timeless/Focus-dependent adjustment is added.

UI sliders remain 0–100%. Internally Warm multiplies the original layer by `3 × slider`, and binaural tones by `4 × slider`. These are bounded relative scales, not a new master-volume boost. Balanced thus uses Warm 2.1 and carriers 2.4, versus the old combined default 0.8; that is approximately +8.4 / +9.5 dB of digital layer gain. Actual perceived presence depends on headphones, output setting and the mix; keep volume comfortable. Maximum layer scales are 3 and 4, validated before the worklet starts.

| Preset | Warm | Binaural | Breathing notes | Narration | Bowl |
|---|---:|---:|---:|---:|---:|
| Balanced | 70% | 60% | 45% | 100% | 45% |
| Immersive | 85% | 80% | 40% | 100% | 45% |
| Quiet | 40% | 30% | 25% | 80% | 30% |

Manual edits visibly select Custom and retain the other values; Reset mix restores Balanced. These are balance preferences, not Focus levels. The narration control is disabled until approved clips exist. All values persist locally across navigation, journey choice and an offline browser-process restart. Stop is above the longer captions and stays sticky while scrolling on small screens.

Native verification checks Warm-only, carrier-only, both, and exactly silent environmental output through both transition boundaries at 44.1 and 48 kHz. Captured worklet samples are compared with the same shared core and exact listener multipliers. Maximum-mix OfflineAudioContext renders include both layer maxima, notes at maximum, the actual bowl ×8, an existing Prepare recording as a clearly labeled QA-only voice surrogate, Master 1, duck on/off, steady scenes and both crossfades. That surrogate is never a delivered meditation narration asset. Peak/RMS/NaNs and the unchanged ceiling are checked. Test evidence is under ignored `qa/meditation-refinement/`.

## Narration timing and readiness

New sessions reserve 20 seconds at 01:30 for the exact chosen breathing introduction, in Guided, Familiar, muted and missing-recording modes. Tones start at 01:50. The default is 16 whole 5/5 cycles; 4/4/6 is 11 cycles plus six natural seconds; 4/7/8 is four cycles plus 84 natural seconds. Natural breathing has the same 180-second window. ECB, every later preparation boundary, the exact 25/35-minute journeys and 13-minute rehearsal remain unchanged. The old legacy introduction and routine transitions are not added.

`voice-narration.ts` maps the actual options to unique cue slots, including the three return passages at +0/+60/+120. Deepening speech starts at 18:16 and 27:16, respecting the authentic bowls. Familiar reuses common clips, uses a shorter ECB and omits relaxation/main-arrival narration while retaining every stage and the full return. Captions stay available. Live natural-breathing override also stops its explanatory voice if one is playing; no future pacing is reintroduced on resume.

`voice-assets.ts` remains an empty approval registry. Future approved local assets require exact text, language, ID, file SHA-256, decoded duration and approval flag; catalog registration and caching are separate required integration steps. New snapshots pin available asset IDs and hashes. Historical pins remain readable if a recording later disappears; playback separately requires a matching approved local record. The loader checks bytes against the pinned hash before decoding. Declared/decoded duration, section budget, 18-second intro maximum, bowl gap and a 250 ms slot-end margin are validated. Missing, mismatched or oversized clips skip with a visible text fallback; time never stretches. Voice-off skips voice and ducking. Interrupted introductions cannot replay, including at an exact boundary. A small initial-start allowance prevents ordinary millisecond startup work from dropping the first ECB clip.

The script review includes exact words, Guided/Familiar reuse, all choice variants, three return cues, seven separate orientation lessons, an optional refresher, a 20–30-second audition passage, three existing library narrator candidates and model/budget review. Its machine-readable companion includes exact character counts and cue limits. Generate it with `node scripts/write-narration-review.cjs` using the existing TypeScript runtime. It makes no service call.

Code-ready is distinct from content-ready: recording and physical listening remain outstanding. The separate interactive teaching voice approach is documented but does not inject lessons into the bounded rehearsal. No new narration file, voice generation, credit spending or live API dependency is included.

## Verification commands and limitations

Fresh Phase 1.1 baseline: clean `a14df0388a38574ecd27bffa7a6c1cbe37061302`, 533 passing tests. The final refinement run passed **597 tests across 18 files**, including the original five lab WAV fingerprints. Added tests cover schema 2, all 1–20-second contours, split-layer samples at both boundaries, preferences, exact budgets and isolated approved-voice wiring. Initial unconstrained/parallel runs hit old CPU-bound laboratory timeouts; test worker concurrency is now bounded to two. Original test assertions, fingerprints and time budgets remain unchanged.

Final native evidence includes 16 split-layer boundary captures at 44.1/48 kHz with zero sample error against the shared core, 20 maximum-mix cases (largest output peak approximately 0.119), and 18 genuine audition/excerpt WAVs. First-note spectral centroids are about 147.3 Hz Felt, 149.3 Hz Wooden and 271.2 Hz original; the new examples have much less energy above 1 kHz at matched stereo RMS. These numbers describe the selected excerpts, not all listening conditions or therapeutic effects. A desktop 2,048-block core benchmark processed 5.94 / 5.46 seconds of stereo audio in approximately 210 / 104 ms, with one bounded 4 MiB source; this is not a mobile CPU or scheduling guarantee.

Run all existing app/lab gates plus `node scripts/verify-meditation-refinement.cjs`, which uses isolated native Chrome, actual AudioContext/AudioWorklet, disposable local data and genuine WAV exports. The optional QA harness is excluded from production. Existing `verify-meditation-suite.cjs` retains its full schema-1 native fixture checks; only new production-UI note-count expectations changed to the explicit 20-second introduction budget. Original permanent assertions remain intact and call the explicit legacy factory; new tests cover schema 2 and narration wiring with isolated synthetic approvals. No golden fingerprints, assertions or timeouts were weakened.

Keep the app visible. Audio stops when hidden/suspended while the monotonic clock continues; safe-inhale resume and overdue-bowl skipping remain. Phone screen lock, mobile CPU, a wall-clock full-session soak and physical headphone preference are not certified by desktop digital checks. Do not publish or generate paid voice content until separately authorized.
