-- Open read access on rest_days and recurring_rest_days to all authenticated users,
-- mirroring the existing pattern on public.entries ("Entries are readable by all
-- authenticated"). Without this, the security-invoker get_streak_summaries RPC
-- hides another user's rest days behind RLS when viewed from the leaderboard
-- modal, leading to incorrect (lower) streak counts for cross-user views.
-- Insert/delete remain self-only.

drop policy if exists "Users can view their rest days" on public.rest_days;

create policy "Rest days are readable by all authenticated"
  on public.rest_days
  for select
  to authenticated
  using (true);

drop policy if exists "Users can view their recurring rest days" on public.recurring_rest_days;

create policy "Recurring rest days are readable by all authenticated"
  on public.recurring_rest_days
  for select
  to authenticated
  using (true);
