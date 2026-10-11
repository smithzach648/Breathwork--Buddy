# Open the Acoustic Laboratory

This is a separate local sound instrument. The public Breathwork Buddy app and your practice settings, routines, media and History are unchanged.

From PowerShell, in the repository:

```powershell
Set-Location -LiteralPath 'C:\Users\smith\.codex\.chatgpt-projects\g-p-6abe6f3da9708191b22e1a6ba1836e7a\Breathwork-Buddy'
pnpm exec vite --config lab/vite.config.mjs --configLoader native
```

Open **http://127.0.0.1:4187/** in Chrome. Keep the server window open; Ctrl+C shuts it down. `lab/Open-Acoustic-Lab.ps1` is also a local launcher and locates the bundled runtime if pnpm is absent from PATH. This is not a `/lab` route in the public app and not an installed PWA. The launch script does not bypass PowerShell execution policy; the direct command above is an alternative.

## First listening

1. Sit comfortably with stereo headphones and quiet device volume. Do not listen while driving, near machinery or in water. No rapid breathing or retention is required. Stop whenever uncomfortable.
2. Select **Reference** and press **Start stereo preview**. The default is a 30-second honest excerpt at 50% of a 30-minute session, where tones are fully present. Playback starts only from a button press. Use **Stop audio / cancel** at any time.
3. Try Threshold, Expansion, Timeless and Open Exploration. Each card identifies the actual sound design. Their names describe an exploratory intention, not a guaranteed mental state or commercial Focus-level recreation.
4. **Listen to** isolates Combined, Tones only, or Noise only. **Listen at** chooses 0%, 50% or 90% of session time. At 0% the original-style tone envelope is quieter. Open Exploration glides across the steady portion; a short excerpt samples that position and never silently speeds up 30 minutes.
5. To compare, select two recipes in **Compare two sounds**, keep the same mode/position/length, and press **Measure and match A/B**. Matching attenuates the louder stereo RMS, rather than increasing the quieter sound. Listen A/B swaps with fades and restarts the excerpt; the two graphs cannot overlap. Hidden labels randomize the assignment of your two selected recipes to A/B; Reveal labels shows it afterward. This reduces expectations but is not a scientific or EEG study.
6. **Manual / advanced generator** edits create a draft while leaving the built-in original intact. Change **left Hz + intended difference**; right Hz follows automatically. Relative gains are energy-normalized. Enable/solo pairs, add up to six, turn noise/movement off, adjust width/mix/depth/speed, or edit glide waypoint pitches. Full JSON supports 2–8 normalized waypoints and independent phase values. Numbers apply on leaving the field or pressing Enter.
7. **One-variable comparisons** provides published Septon tones-only, single 200/204, Expansion all-4-Hz, Timeless 3.75-Hz, fixed 160/164, static Warm, and movement-Off variants. Select the matching original first, then create its comparator. Movement Off freezes delays; static Warm or mix zero removes comb coloration too.
8. **Export recipe JSON** saves every synthesis parameter. **Import recipe JSON** validates the whole file without changing it. **Save As in lab** stores up to 20 custom variants under a lab-only localStorage key; Restore brings one back. Files are more portable than that browser-specific library.
9. **Export stereo WAV** creates stereo 16-bit PCM at 44.1 or 48 kHz, up to 120 seconds, plus a separate render report with the recipe, sample-aligned excerpt, sample metrics and spectra. The report is not a recipe import; import the separately exported recipe JSON. **Listen until session end** supports longer live audition without generating a huge WAV.
10. Optional notes record preparation, comfort, attention, chatter, spatial impression and distraction. Export saves those observations as local JSON; no journal/History record or external submission is made.

## Troubleshooting

No sound: press Start in the visible Chrome tab, inspect its status/error, verify stereo output/headphone routing and a modest device volume. Tone/noise/output levels or an Off/Off selection can legitimately be silent; never automatically increase device volume. Start preparation uses a worker and may take a few seconds. Stop cancels pending preparation/exports. Closing/navigating/hiding disposes audio. A browser interruption requires a fresh Start; old audio does not silently rejoin.

If port 4187 is busy, use the existing lab server or stop its prior terminal; strict-port behavior prevents accidentally claiming a different URL. Serve through localhost, not a double-clicked HTML file. AudioWorklet needs a secure context; localhost qualifies. Plain LAN HTTP on a phone usually does not. No public tunnel/hosting or Android lock-screen promise is part of this phase. Keep the tab visible for continuous listening; this lab intentionally stops on hide.

If pnpm is absent, use the launcher or add the bundled `dependencies/node/bin` and `dependencies/bin/fallback` paths reported by Codex to PATH. Do not change package manager/dependencies. An unavailable AudioWorklet produces a visible error; export remains a separate local worker operation, not a fake live playback fallback.

## Developer checks

```powershell
pnpm test
pnpm typecheck
pnpm exec tsc --noEmit -p lab/tsconfig.json
pnpm build
node scripts/check-pwa-build.mjs
node lab/check-isolation.mjs --live
pnpm exec vite build --config lab/vite.config.mjs --configLoader native
$env:NODE_PATH='C:\Users\smith\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node lab/verify-native.cjs
```

Native checks use disposable browser contexts, require the separate dev server running, and save screenshots, actual WAVs, recipes and machine-readable evidence in ignored `qa/acoustic-laboratory/`. The separate compiled lab lands in ignored `qa/acoustic-lab/`; no public media directory is copied. Existing app/PWA verification scripts remain unchanged. Research notes and future integration design are in `lab/docs/` and downloadable from the lab footer.
