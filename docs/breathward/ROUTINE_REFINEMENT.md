# Routine and background refinement

Implemented from the user's approved November 17 brainstorm, with public deployment authorized. No claim that the specific combinations or longer doses are clinically validated.

## Discover and customize

Practices has a Routines category with six original combinations and a Create your own routine card. The creation card also appears in Breathe and All; Saved opens the same designer. Favorites can include premade routines. Saved lists all existing saved routines; My Routines retains the full advanced editor.

- Comprehensive Calm, Short: Box 4–4–4–4 × 5 → Calm 4–4–6–2 × 5 → 4–7–8 × 5 → Threshold meditation 5 minutes.
- Comprehensive Calm, Unhurried: 10 / 10 / 5 cycles, same meditation. Core times are 9:15 and 11:55; app totals include real narration/transitions and are 10:47 and 13:27.
- Zach’s Practice, Short: Calm × 5 → 4–7–8 × 5 → exactly two Hormesis rounds of 30 breaths at 2 seconds in/out, optional 60/60-second retentions → Timeless meditation 15 minutes. App total 27:55 including all instructions and transitions. Unhurried changes only Calm to ten cycles, giving 29:15.
- Steady Ground: 10 coherent 6–6 cycles → 60 seconds natural breathing → 5-minute Threshold meditation. Unhurried offers 25 coherent cycles, exactly five minutes of paced breathing.
- Clear Some Space: Box × 5 → Calm × 5 → Coherent × 10 → 10-minute Open meditation. Unhurried uses 10 / 10 / 25 cycles.
- Into Stillness: unchanged Foundation Hormesis → 60 seconds natural breathing → Timeless meditation 10 minutes; Unhurried extends meditation to 15.
- Open Horizon: unchanged Advanced Hormesis → 60 seconds natural breathing → Beyond flow meditation 15 minutes; Unhurried extends meditation to 20.

Custom allows whole cycle counts, supported meditation durations/scenes/Silence, natural settling, all named breathing techniques and the three fixed Hormesis options; add, move or remove blocks, then Start or Save. Counts are validated and no cycle is cut short. Short is the default; Unhurried never increases Hormesis breaths/rounds/hold targets. Standalone coherent practice also offers a 25-cycle shortcut. Arbitrary custom breathing ratios remain available in the existing advanced editor.

Routine summaries and Start/Save are visible first; detailed sequence editing is collapsed until requested. Hormesis precautions remain visible outside customization. Existing three-round options are unchanged; the new versioned `hormesis-two` option has exactly two rounds, two final-breath chimes, 4-in/6-out final cycles, five-count endings and the original recovery after each round.

## Sound and guidance

Practice background is separate from Marshall and Soft Felt. Off means silence behind the guidance; On offers Floating, Home Again, or light Soft Warm masking with a level slider. Hormesis adds Entire practice / Retentions only. The settings are frozen by value in a session and saved with a routine. Standalone defaults remember the new preferences and recognize previously selected built-in background tracks. Retentions-only gating applies only to sessions containing Hormesis; ordinary patterns play their background throughout.

The existing streaming player and noise controller handle both playback windows with 700ms fades. Release cancels old retention audio and exits its background window. The final transition fades practice background away, then meditation uses its complete selected scene. The new background recipe contains no extra binaural layer or signal. Existing imported media/legacy routines remain in their original storage and advanced controls. Floating/Home Again need a saved offline track copy for offline playback; masking and guidance work offline without that download.

Gentle hold guidance defaults off. When enabled, one reusable Marshall passage is scheduled at 20 seconds into a retention, inside a protected 22-second window ending at 42 seconds. Its actual duration is 15.08 seconds. The five-to-one countdown begins at 55 or 85 seconds. Early Release, Stop, suspension and stale async preparation cancel obsolete cues. A resumed session does not replay an overdue passage. General voice settings still apply. Text support is available on screen.

New `flow.1` routines have one general opening and short pattern invitations rather than a full standalone explanation for every pattern. Hormesis keeps its complete safety/profile introduction. Meditation and natural settling receive no added preparation. If editing removes all meditation blocks, the meditation-promising opening is omitted and standalone explanations remain.

## Assets, credits and compatibility

Seven new one-take Marshall `eleven_v4` recordings, with phrase gaps extended locally and speech samples preserved before encoding. No retakes or runtime generation. Actual new spend 1,566 credits; project-recorded cumulative spend 11,176. There are now 28 practice plus 42 suite recordings, all available in the offline precache. Exact scripts, generation IDs, hashes, measurements and edit provenance are in `../meditation-suite/REFINEMENT_MARSHALL_PRODUCTION.json`. No credentials or signed download URLs are production inputs.

New fields are optional: routine `flowGuidance` and `practiceAudio`, standalone session `practiceAudio`, preferences `practiceAudio`, and frozen environment `practice`. The IndexedDB schema/name and PWA identity are unchanged. Existing records are not rewritten. Original audio assets remain byte-identical. History displays the correct two/three-round counts and background intent without requiring a meditation recipe for standalone breathing. Preparation completion respects later navigation, preserving an open journal editor.

## Evidence

`routine-refinement.test.tsx` adds protocol/variant, voice-slot, gating, normalization, early Release, persistence/failure, editor, history and asynchronous navigation coverage. The prior 689 tests and the new cases pass; exact final totals and release IDs are in the workspace handoff.

`scripts/verify-routine-refinement.cjs` verifies native Chrome at 44.1 and 48kHz: real retentions-only Warm, both actual streamed tracks, optional passage and five countdown cues, early Release cancellation, automatic Timeless entry, one parent result/context, and native SHA/duration/peak checks for all 28 practice recordings. It also checks a real previous-release service-worker upgrade, identical database and journal draft, phone layouts, saved custom sequence/audio and offline Zach routine start with all new clips cached.

Existing native Hormesis checks still pass for both original three-round profiles and final signals/countdowns. PWA paths, manifest, isolated production package, original audio SHA pins and brand pins are checked. Physical phone/headphone and screen-lock testing remain device checks. New routine names and scene pairings describe user-selectable experiences, not treatments or certified Focus states.

Research context: https://pmc.ncbi.nlm.nih.gov/articles/PMC9873947/ , https://pmc.ncbi.nlm.nih.gov/articles/PMC9277512/ , https://pubmed.ncbi.nlm.nih.gov/39864026/ . These studies do not validate the exact combinations or establish that Unhurried is superior.
