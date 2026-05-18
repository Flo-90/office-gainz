---
description: Ship local changes to prod (Supabase migrations, edge functions, Vercel)
---

# /deploy

You are about to ship the current branch to production. Production = Supabase project `ovjvmaetlcxyffbtmjno` + Vercel.

There are three concerns and they are **NOT all auto-deployed by Vercel**. Only the frontend is.

| What | How | Trigger |
|---|---|---|
| Frontend (`src/`, `public/`, `index.html`, `vite.config.ts`) | Vercel build | `git push origin main` |
| DB schema + RPCs | `supabase db push --linked` | Manual |
| Edge functions | `supabase functions deploy <slug>` per function | Manual |

## Required deploy order

DB first, then edge functions, then frontend. This way the frontend never calls an RPC that does not exist yet.

## Step-by-step

Run these in order, in the working tree of the project. Do not skip the dry-run or the backup.

### 1 — Pre-flight checks

```bash
git status
pnpm build
pnpm lint
```

- Working tree should contain the changes you want to ship and nothing else.
- Build and lint must be green. If not, fix before continuing.
- If new migrations exist under `supabase/migrations/`, apply them locally first (`supabase migration up`) and verify behavior in the browser at `localhost:1337` before pushing to prod.

### 2 — Identify what changed

```bash
git status --porcelain
git diff --stat origin/main..HEAD
```

Categorize the changes:

- **New migration files** in `supabase/migrations/` → DB push required.
- **Modified files** under `supabase/functions/<slug>/` → that function needs `supabase functions deploy <slug>`.
- **Frontend changes** (everything else, especially `src/`, `public/`, `index.html`, `vite.config.ts`, `package.json`, `pnpm-lock.yaml`) → Vercel handles via push.

### 3 — Backup prod

Schema-only is enough for rollback safety; migrations in this repo do not destroy data, but a backup is cheap insurance.

```bash
mkdir -p backups
supabase db dump --linked -f "backups/prod-$(date -u +%Y%m%d-%H%M%S).sql"
```

Verify the file is not empty and the size is reasonable (≥ 10 KB).

### 4 — Dry-run + apply DB migrations

Skip this section if no new migration files.

```bash
supabase db push --linked --dry-run
```

The list of migrations to push should match exactly what is new in `supabase/migrations/`. If the dry-run wants to push migrations that have already been applied on prod, stop and investigate (the migration history in `supabase_migrations.schema_migrations` is out of sync).

```bash
echo y | supabase db push --linked
```

Verify after:

```bash
# Via the Supabase MCP (read-only is fine for this):
# mcp__supabase__list_migrations
```

The new versions should appear in the response.

If any post-migration RPC change should be sanity-checked, use `mcp__supabase__execute_sql` with read-only SELECTs (e.g. `pg_get_function_result(...)`).

### 5 — Deploy changed edge functions

For each function in `supabase/functions/` whose `index.ts` (or shared file used by it) changed:

```bash
supabase functions deploy <slug>
```

Functions in this repo: `push-subscriptions`, `push-dispatch`. Shared code lives under `supabase/functions/_shared/`. If a `_shared/` file changed, **redeploy every function that imports it**.

Verify after:

```bash
# Via MCP: mcp__supabase__list_edge_functions
# Confirm the version number of the changed function increased.
```

### 6 — Commit + push

Split into logical commits if multiple concerns are bundled (e.g. a port change is not the same commit as a feature). Use the heredoc form so the body formats correctly:

```bash
git add <feature-files>
git commit -m "$(cat <<'EOF'
feat: <short summary>

<wrap to ~72 chars; explain why, not what>
EOF
)"

git push origin main
```

The `git push` triggers the Vercel build. The Vercel dashboard is the source of truth for build status.

### 7 — Post-deploy verification

Open the deployed site (officegainz.com or your Vercel preview) and exercise the changed UX:

- For new features: walk through the golden path.
- For schema changes: confirm reads return new fields.
- For edge functions: tail logs via `mcp__supabase__get_logs` (service: `edge-function`) to confirm the new code path fires.

## Safety rules

- **Never** run `db push --linked` without a dry-run first.
- **Never** push to main if `pnpm build` or `pnpm lint` is failing.
- **Never** commit `.env`, `.env.local`, or `supabase/.env` (already gitignored — double-check `git status` shows no env file before committing).
- If a migration includes a destructive op (`drop table`, `drop column` on a table with prod data, `truncate`, `alter column type`), pause and confirm with the user before applying.
- `--no-verify` and `--force` are not in this playbook. Stop if a hook fails — investigate, fix, recommit.

## What if something goes wrong

- **Bad migration**: restore schema from the most recent dump in `backups/`. Run `psql` against prod with the dump file; or recreate via Supabase Studio.
- **Bad edge function**: redeploy a previous version by `git checkout <prev-sha> -- supabase/functions/<slug>` then `supabase functions deploy <slug>`, then revert the checkout.
- **Bad frontend**: revert the commit and push again; Vercel rebuilds from `main`.
