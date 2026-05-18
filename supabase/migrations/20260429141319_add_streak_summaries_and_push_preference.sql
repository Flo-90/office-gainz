alter table public.notification_preferences
  add column if not exists streak_at_risk_15h boolean not null default true;

alter table public.notification_log
  drop constraint if exists notification_log_notification_type_check;

alter table public.notification_log
  add constraint notification_log_notification_type_check
  check (
    notification_type in (
      'daily_nudge_15h',
      'leaderboard_overtaken_today',
      'streak_at_risk_15h'
    )
  );

create or replace function public.get_streak_summaries(
  filter_user_ids uuid[] default null
)
returns table (
  user_id uuid,
  current_streak integer,
  longest_streak integer,
  last_active_date date,
  active_today boolean,
  at_risk_today boolean
)
language sql
security invoker
set search_path = public
as $$
  with berlin_today as (
    select timezone('Europe/Berlin', now())::date as day
  ),
  activity_days as (
    select
      entries.user_id,
      timezone('Europe/Berlin', entries.created_at)::date as activity_day
    from public.entries as entries
    where filter_user_ids is null
      or entries.user_id = any(filter_user_ids)
    group by entries.user_id, timezone('Europe/Berlin', entries.created_at)::date
  ),
  ordered_days as (
    select
      activity_days.user_id,
      activity_days.activity_day,
      row_number() over (
        partition by activity_days.user_id
        order by activity_days.activity_day
      )::integer as day_index
    from activity_days
  ),
  streak_groups as (
    select
      ordered_days.user_id,
      ordered_days.activity_day,
      ordered_days.activity_day - ordered_days.day_index as streak_group
    from ordered_days
  ),
  streaks as (
    select
      streak_groups.user_id,
      min(streak_groups.activity_day) as start_day,
      max(streak_groups.activity_day) as end_day,
      count(*)::integer as streak_length
    from streak_groups
    group by streak_groups.user_id, streak_groups.streak_group
  ),
  latest_activity as (
    select
      activity_days.user_id,
      max(activity_days.activity_day) as last_active_date
    from activity_days
    group by activity_days.user_id
  )
  select
    latest_activity.user_id,
    coalesce(current_streak.streak_length, 0) as current_streak,
    coalesce(longest_streak.streak_length, 0) as longest_streak,
    latest_activity.last_active_date,
    latest_activity.last_active_date = berlin_today.day as active_today,
    latest_activity.last_active_date = berlin_today.day - 1
      and coalesce(current_streak.streak_length, 0) > 0 as at_risk_today
  from latest_activity
  cross join berlin_today
  left join lateral (
    select streaks.streak_length
    from streaks
    where streaks.user_id = latest_activity.user_id
      and streaks.end_day = latest_activity.last_active_date
      and latest_activity.last_active_date >= berlin_today.day - 1
    order by streaks.end_day desc
    limit 1
  ) as current_streak on true
  left join lateral (
    select max(streaks.streak_length) as streak_length
    from streaks
    where streaks.user_id = latest_activity.user_id
  ) as longest_streak on true
  order by
    coalesce(current_streak.streak_length, 0) desc,
    coalesce(longest_streak.streak_length, 0) desc,
    latest_activity.user_id;
$$;

revoke all on function public.get_streak_summaries(uuid[]) from public;
grant execute on function public.get_streak_summaries(uuid[]) to authenticated;
