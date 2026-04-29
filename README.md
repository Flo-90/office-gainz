# OfficeGainz

OfficeGainz is a fun, mobile-first fitness tracker for small remote teams. Log
reps fast, climb the leaderboard, and keep the energy up.

## Tech Stack
- React + Vite + TypeScript
- Tailwind CSS
- Supabase (Auth, Database, Realtime)
- Vercel (Hosting)

## Local Setup
0. Use Node.js `22.13.0` or newer on Node 22, or `20.19.0` on Node 20.
1. Create a Supabase project and enable Google OAuth.
2. Run the SQL in `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env` and fill in the values:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

Then:
```bash
nvm use
npm install
npm run dev
```

## Supabase Auth Notes
- Google OAuth must be enabled in your Supabase project.
- Add your local dev URL (e.g. `http://localhost:5173`) to the redirect URLs.
- In Google Cloud, create a Web application OAuth client.
- Add your Supabase callback URL `https://<your-project-ref>.supabase.co/auth/v1/callback` to the Google OAuth client's redirect URIs.
- Paste the Google client ID and client secret into Supabase under Authentication > Providers > Google, then enable the provider.
- If you see `Unsupported provider: provider is not enabled`, the Google provider is disabled in Supabase or your `.env` is pointing at a different Supabase project than the one you configured.

## Deployment
On Vercel, add the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
environment variables for the production environment.

For Google OAuth in production:
- Add your Vercel URL to Google OAuth `Authorized JavaScript origins`.
- Add your Vercel URL to Supabase `Authentication > URL Configuration > Redirect URLs`.
- If you use a custom domain later, add that domain in both places as well.

For direct links like `/leaderboard` and `/exercises`, Vercel needs an SPA rewrite to `index.html`. This repo includes that in `vercel.json`.

## Push Notifications
OfficeGainz now includes a challenge-focused web-push MVP with two notification types:
- `daily_nudge_15h`
- `leaderboard_overtaken_today`

Supabase pieces in this repo:
- database tables and hooks in `supabase/schema.sql`
- edge functions in `supabase/functions/push-subscriptions` and `supabase/functions/push-dispatch`

For a fresh Supabase project, deploy the edge functions and then run:

```sql
select public.configure_push_delivery(
   '<your-supabase-project-url>',
   '<your-legacy-anon-jwt>',
   'mailto:notifications@example.com'
);
```

Notes:
- `configure_push_delivery()` stores the project URL, wires the hourly cron job, and gives DB-triggered edge-function calls a JWT they can use.
- The dispatch function itself only sends the daily nudge when the current time is 15:00 in `Europe/Berlin`.
- VAPID keys are generated lazily on first function use and stored in `push_delivery_config`.
- Browser push registration needs the deployed app with an active service worker and a browser that supports the Push API.
