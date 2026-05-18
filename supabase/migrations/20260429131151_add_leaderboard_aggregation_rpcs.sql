create or replace function public.get_leaderboard_totals(
  filter_since timestamptz default null,
  filter_exercise_id uuid default null
)
returns table (
  user_id uuid,
  name text,
  avatar_url text,
  total_reps bigint
)
language sql
security invoker
set search_path = public
as $$
  select
    entries.user_id,
    coalesce(users.name, 'Mystery Lifter') as name,
    users.avatar_url,
    sum(entries.reps)::bigint as total_reps
  from public.entries as entries
  join public.users as users
    on users.id = entries.user_id
  where (filter_since is null or entries.created_at >= filter_since)
    and (
      filter_exercise_id is null
      or entries.exercise_id = filter_exercise_id
    )
  group by entries.user_id, users.name, users.avatar_url
  order by sum(entries.reps) desc, coalesce(users.name, 'Mystery Lifter') asc;
$$;

revoke all on function public.get_leaderboard_totals(timestamptz, uuid) from public;
grant execute on function public.get_leaderboard_totals(timestamptz, uuid) to authenticated;

create or replace function public.get_user_exercise_breakdown(
  filter_user_id uuid,
  filter_since timestamptz default null
)
returns table (
  exercise_id uuid,
  exercise_name text,
  total_reps bigint
)
language sql
security invoker
set search_path = public
as $$
  select
    exercises.id as exercise_id,
    exercises.name as exercise_name,
    sum(entries.reps)::bigint as total_reps
  from public.entries as entries
  join public.exercises as exercises
    on exercises.id = entries.exercise_id
  where entries.user_id = filter_user_id
    and (filter_since is null or entries.created_at >= filter_since)
  group by exercises.id, exercises.name
  order by sum(entries.reps) desc, exercises.name asc;
$$;

revoke all on function public.get_user_exercise_breakdown(uuid, timestamptz) from public;
grant execute on function public.get_user_exercise_breakdown(uuid, timestamptz) to authenticated;
