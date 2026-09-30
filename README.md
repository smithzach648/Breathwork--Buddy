# Breathwork Buddy 2.0

A calm, personal space for daily breathwork. Audio guidance, concise text, and reflection are the product direction; no breath animation, gamification, accounts, or cloud dependency.

## Current status

Phase 1 foundation: five navigable screens, local theme preferences, optional audio catalog, versioned IndexedDB, and an offline application shell. Practice, Journal, and History are honest previews. Session execution is not implemented.

Legacy reference: `main` at `ea409acd59ecb440530d9c4938139720b7aecada`. The modernization branch is `breathwork-buddy-2`. Git history preserves the original implementation and its four MP3s. Do not merge over or alter the reference branch during this phased build.

## Development

Use Node.js 22.12+ (or a supported newer LTS) and pnpm 11. The lockfile records exact versions. `pnpm-workspace.yaml` explicitly allows only esbuild's dependency build script.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

The stack is React, TypeScript, Vite, local CSS, Dexie, Vitest, and vite-plugin-pwa/Workbox. No shell assets, fonts, APIs, or libraries load from external domains at runtime. The production service worker is not enabled in the development server.

## Architecture

- `src/app`: shell, startup, themes, update prompt, navigation state.
- `src/components` and `src/features`: shared accessible controls and five screen components.
- `src/session`: engine and observable-state contracts only. React observes future engine state; it must never own timing.
- `src/types`, `src/routines`, `src/journal`, `src/history`: domain definitions, including readonly Start-time session configuration and results for all practice types.
- `src/audio`: optional asset catalog and Master/Voice/Breath/Ambience/Signals bus contract. No playback, mixer, or scheduling.
- `src/settings`: defaults and preference validation.
- `src/storage`: Dexie database, preference services, typed table repositories, legacy detection/migration boundary.
- `src/styles`: calm light/dark design tokens, system fonts, mobile touch targets, focus and reduced-motion rules.
- `src/test`: behavioral tests with jsdom and fake-indexeddb.

Database `breathwork-buddy-v2`, schema version 1: `preferences` (id), `routines` (id, updatedAt), `journal` (id, createdAt, sessionId), `history` (id, startedAt, routineId), and `migrations` (id). Only preferences are written by the shell. Storage failures are visible; the app can still navigate.

## Offline and installation

The generated manifest uses standalone display and local 192/512 PNG icons, including a maskable icon. Vite base, manifest start URL/scope/identity, and service-worker scope are `/Breathwork--Buddy/`. Workbox explicitly precaches built HTML, JS, CSS, PNGs, and the manifest. Navigation falls back to cached `/Breathwork--Buddy/index.html`. No nonexistent audio is fetched or precached. Old precaches are cleaned up. New workers wait for the user to choose **Update app**; Phase 2 must additionally gate updates while sessions run.

To verify offline operation:

1. Build and serve with `pnpm build` then `pnpm preview`.
2. Open the preview URL at `/Breathwork--Buddy/`, allow the worker to finish installing, then reload once so it controls the page. Confirm an active worker and precache in browser developer tools.
3. Install where supported. Deployment requires HTTPS; localhost is permitted for development.
4. Disable ordinary HTTP caching and set the browser to offline, or enable airplane mode on a phone.
5. Reload and close/reopen the installed app. Navigate all five screens and change theme.
6. Confirm no failed required shell requests and that the app starts without the server/network.

Automated production verification passed in headless Chrome at 390×844: offline reload, fresh offline tab, all navigation, persisted theme, no horizontal overflow, no external requests, no page errors. The server sent `Cache-Control: no-store` and HTTP cache was disabled. Physical phone installation/relaunch is still a manual check.

## Optional audio conventions

`public/audio/{voice,breath,ambience,signals}/` contains `.gitkeep` only. All 19 catalog entries are unavailable. Paths describe future MP3 files; other formats can be selected when real assets arrive. Components must use catalog IDs rather than hard-coded URLs. Resolve paths relative to `import.meta.env.BASE_URL` when playback is implemented. Add real assets and availability/source/license/duration metadata together; do not fetch unavailable entries. Adopt an explicit size/offline caching policy for real audio later.

## GitHub Pages deployment

`.github/workflows/pages.yml` builds and deploys only pushes to `breathwork-buddy-2`. It installs the lockfile, runs type checking and tests, builds the production PWA, validates project-path assets with `scripts/check-pwa-build.mjs`, uploads `dist`, and deploys through the `github-pages` environment. It never writes or merges `main`.

Repository Settings → Pages must use **GitHub Actions** as its publishing source. The `github-pages` environment must allow deployments from `breathwork-buddy-2`. Do not change the default branch. The project site is `https://smithzach648.github.io/Breathwork--Buddy/`. GitHub Pages publishes one site per repository, so this workflow supplies the live site while `main` remains the legacy source reference.

## Legacy data

Phase 1 checks only presence of `localStorage["breathwork_data"]`. It never parses, imports, rewrites, or deletes that record. Storage is origin-specific: a local preview cannot see data on the old hosted origin. Migration must validate journal, saved patterns, retention history, dark mode, and orientation, and account for the legacy `unshift()` / `slice(-100)` journal retention bug. Plan a user-reviewed backup/preview and idempotent migration before writing data.

## Next boundary

No session timers, audio playback/mixing, AI, routine builder, journal editor, advanced history, haptics, notifications, accounts, backend, sync, or native packaging exist. Phase 2 should start with an independently tested deterministic engine, immutable runtime snapshots, explicit transitions/cancellation, a few presets, and results for every practice type. Runtime snapshot cloning/freezing is future work; readonly types alone do not enforce runtime immutability.

Physical phone checks: Safari/iOS and Chrome/Android installation, airplane-mode cold relaunch, device-theme changes, portrait/landscape, large text, screen-reader focus, safe-area navigation, storage restrictions, and update behavior.
