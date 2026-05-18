# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server on `0.0.0.0:5173`.
- `npm run build` — Type-checks (`tsc -b`) then builds with Vite. Always run after non-trivial TS changes; there is no separate `typecheck` script.
- `npm run lint` — ESLint flat config (`eslint.config.js`) with `typescript-eslint`, `react-hooks`, `react-refresh`. Lints `**/*.{ts,tsx}`, ignores `dist`.
- `npm run preview` — Serve the production build locally.
- No test runner is configured in this repo.
- Node version is pinned via `.nvmrc`; package.json requires `>=20.19.0 <21 || >=22.13.0`.

## High-level architecture

OfficeGainz is a mobile-first React SPA backed by Supabase. Frontend lives in `src/`; backend (schema, RLS, RPCs, edge functions) lives in `supabase/`.

### Routing & auth shell

`src/App.tsx` defines two zones: `/login` (public) and everything else wrapped in `ProtectedRoute` + `AppLayout`. `AuthProvider` (`src/contexts/AuthProvider.tsx`) is the single source of truth for session/profile state:

- On mount, on `onAuthStateChange`, and on `visibilitychange`/`focus`/`online`/`pageshow` it calls `supabase.auth.getSession()` and re-syncs. The foreground refresh is throttled to once per 1.5s.
- `syncProfile` upserts the `users` row from Google OAuth metadata each time the session changes — there is no separate "create profile on signup" step.
- `isTransientAuthLoadError` swallows network blips when a session/profile is already loaded so the UI does not bounce to an error state.
- `signInWithGoogle` redirects to `window.location.origin`; Google must be enabled in Supabase Auth providers.

### Data layer (`src/lib/api.ts`)

There is a hand-rolled in-memory cache in front of every read. Treat it as the API surface — pages should not call `supabase` directly for reads.

- `CacheEntry<T>` tracks `{ value, hasValue, invalidated, promise }`. `resolveCachedValue` deduplicates concurrent requests via the in-flight `promise`, returns cached values when fresh, and refetches when `invalidated` is true or `force: true` is passed.
- Per-resource caches: `exercisesCache`, `userTotalsCache` (keyed by `userId:since`), `userStreakCache`, `leaderboardCache` (keyed by `timeframe:exerciseId`), `userExerciseBreakdownCache` (keyed by `userId:timeframe`).
- After any mutation (`logEntry`, `createExercise`), call `notifyEntriesChanged()` / `notifyExercisesChanged()`. These mark all relevant caches `invalidated` and emit a `DataUpdateEvent` to listeners registered via `subscribeToDataUpdates` — that is how pages know to refetch. `AppLayout` also pings these on visibility/focus to recover after the tab was backgrounded.
- `getXxxSnapshot()` returns the cached value synchronously without triggering a fetch — used to render instantly while a fresh fetch is in flight.
- Leaderboard, streak, and per-user exercise breakdown go through Supabase RPCs (`get_leaderboard_totals`, `get_streak_summaries`, `get_user_exercise_breakdown`), not raw table queries.

### Supabase schema (`supabase/schema.sql`)

Tables: `users`, `exercises`, `entries`, plus `notification_preferences`, `push_subscriptions`, `notification_log`, `push_delivery_config`. RLS is on for every table; clients can only mutate their own rows. Notification preferences are auto-created by an `after insert` trigger on `users`.

The RPC functions (`get_leaderboard_totals`, `get_user_exercise_breakdown`, `get_streak_summaries`) are the canonical aggregation paths — change them in lock-step with `src/lib/api.ts` and `src/lib/types.ts` if the row shape changes.

### Push notifications

- Frontend module: `src/lib/push.ts` POSTs `{ action: 'state' | 'subscribe' | 'update_preferences' | 'unsubscribe' }` to the `push-subscriptions` edge function with the user's session JWT.
- Edge functions: `supabase/functions/push-subscriptions` (CRUD for subscriptions/preferences) and `supabase/functions/push-dispatch` (cron-driven sender; only fires the `daily_nudge_15h` when local time in `Europe/Berlin` is 15:00). Shared helpers in `supabase/functions/_shared`.
- A SQL function `configure_push_delivery(project_url, jwt, vapid_subject)` writes the singleton `push_delivery_config` row, schedules the hourly cron, and lets DB triggers call edge functions. VAPID keys are generated lazily on first use.
- Service worker is `public/sw.js`; PWA manifest is `public/manifest.webmanifest`.

### App-update flow

`vite.config.ts` injects a build ID (from `VERCEL_GIT_COMMIT_SHA` / `GITHUB_SHA` / timestamp) into both `__APP_BUILD_ID__` and a `<meta name="officegainz-build">` tag. `src/lib/appUpdate.ts` periodically fetches `/?build-check=…`, compares the meta tag to `__APP_BUILD_ID__`, and triggers `AppUpdateBanner` + a service-worker update when they diverge. Hosting (Vercel) needs an SPA rewrite for direct deep links — already configured in `vercel.json`.

## Conventions worth knowing

- Env vars: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are required at startup — `supabaseClient.ts` throws if missing. There is no fallback.
- User-facing strings live centrally in `src/lib/copy.ts` (`appCopy`). Reuse keys instead of hardcoding strings in components.
- Time helpers (`startOfDay`, `startOfWeek`) live in `src/lib/time.ts` and are the inputs to `Timeframe`-based queries — keep timezone behavior consistent with the streak SQL (which uses `Europe/Berlin`).
- React 19 + react-router v7 are in use; treat any docs/snippets predating those versions with care.
