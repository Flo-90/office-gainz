-- Forward-only semantics for recurring rest days.
-- Adding weekday W on date D causes W to count as rest day for dates >= D only.
-- Past dates remain unaffected.

create table if not exists public.recurring_rest_days (
  user_id uuid not null references public.users (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  effective_from date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, weekday)
);

create index if not exists recurring_rest_days_user_idx
  on public.recurring_rest_days (user_id);

alter table public.recurring_rest_days enable row level security;

create policy "Users can view their recurring rest days"
  on public.recurring_rest_days
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert their recurring rest days"
  on public.recurring_rest_days
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can delete their recurring rest days"
  on public.recurring_rest_days
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Backfill from the deprecated users.recurring_rest_weekdays column.
-- effective_from = today so retroactive counting stops with this migration.
insert into public.recurring_rest_days (user_id, weekday, effective_from)
select
  u.id,
  unnest(u.recurring_rest_weekdays),
  timezone('Europe/Berlin', now())::date
from public.users u
where coalesce(array_length(u.recurring_rest_weekdays, 1), 0) > 0
on conflict (user_id, weekday) do nothing;

alter table public.users drop column if exists recurring_rest_weekdays;

drop function if exists public.get_streak_summaries(uuid[]);

create function public.get_streak_summaries(
  filter_user_ids uuid[] default null
)
returns table (
  user_id uuid,
  current_streak integer,
  longest_streak integer,
  last_active_date date,
  active_today boolean,
  at_risk_today boolean,
  today_is_rest_day boolean,
  today_rest_day_source text,
  rest_days_used_this_week integer,
  rest_days_quota integer,
  recurring_rest_weekdays smallint[]
)
language sql
security invoker
set search_path = public
as $$
  with berlin_today as (
    select timezone('Europe/Berlin', now())::date as day
  ),
  iso_week as (
    select
      date_trunc('week', (select day from berlin_today))::date as week_start,
      (date_trunc('week', (select day from berlin_today)) + interval '7 days')::date as week_end
  ),
  target_users as (
    select u.id
    from public.users u
    where filter_user_ids is null or u.id = any(filter_user_ids)
  ),
  user_recurring as (
    select
      tu.id as user_id,
      coalesce(
        array_agg(rrd.weekday order by rrd.weekday)
          filter (where rrd.weekday is not null),
        '{}'::smallint[]
      ) as weekdays
    from target_users tu
    left join public.recurring_rest_days rrd on rrd.user_id = tu.id
    group by tu.id
  ),
  activity_days as (
    select
      e.user_id,
      timezone('Europe/Berlin', e.created_at)::date as day
    from public.entries e
    where e.user_id in (select id from target_users)
    group by e.user_id, timezone('Europe/Berlin', e.created_at)::date
  ),
  manual_rest_days as (
    select rd.user_id, rd.rest_date as day
    from public.rest_days rd
    where rd.user_id in (select id from target_users)
  ),
  recurring_rest_day_dates as (
    -- Only generate dates D where the recurring config was effective for D.
    select rrd.user_id, d::date as day
    from public.recurring_rest_days rrd
    join target_users tu on tu.id = rrd.user_id
    cross join lateral generate_series(
      rrd.effective_from::timestamp,
      (select day from berlin_today)::timestamp,
      interval '1 day'
    ) as d
    where extract(isodow from d)::smallint = rrd.weekday
      and d::date >= (select day from berlin_today) - interval '730 days'
  ),
  valid_days as (
    select user_id, day from activity_days
    union
    select user_id, day from manual_rest_days
    union
    select user_id, day from recurring_rest_day_dates
  ),
  ordered_days as (
    select
      user_id,
      day,
      row_number() over (
        partition by user_id
        order by day
      )::integer as day_index
    from valid_days
  ),
  streak_groups as (
    select user_id, day, (day - day_index) as streak_group
    from ordered_days
  ),
  streaks as (
    select
      user_id,
      max(day) as end_day,
      count(*)::integer as streak_length
    from streak_groups
    group by user_id, streak_group
  ),
  last_valid_day as (
    select user_id, max(day) as day
    from valid_days
    group by user_id
  ),
  last_active as (
    select user_id, max(day) as day
    from activity_days
    group by user_id
  ),
  today_active as (
    select user_id
    from activity_days
    where day = (select day from berlin_today)
  ),
  today_manual_rest as (
    select user_id
    from manual_rest_days
    where day = (select day from berlin_today)
  ),
  today_recurring_rest as (
    -- Today is a recurring rest day only if effective_from <= today.
    select rrd.user_id
    from public.recurring_rest_days rrd
    cross join berlin_today bt
    where rrd.weekday = extract(isodow from bt.day)::smallint
      and rrd.effective_from <= bt.day
  ),
  manual_rest_this_week as (
    select mrd.user_id, count(*)::integer as cnt
    from manual_rest_days mrd
    cross join iso_week
    where mrd.day >= iso_week.week_start
      and mrd.day < iso_week.week_end
    group by mrd.user_id
  ),
  recurring_rest_this_week as (
    -- Count recurring weekday slots that are committed within the current ISO week.
    -- "Committed" means the date_in_current_week corresponding to the weekday
    -- is on or after the configured effective_from.
    select rrd.user_id, count(*)::integer as cnt
    from public.recurring_rest_days rrd
    cross join iso_week
    where (iso_week.week_start + (rrd.weekday - 1)) >= rrd.effective_from
    group by rrd.user_id
  )
  select
    tu.id as user_id,
    coalesce(cs.streak_length, 0) as current_streak,
    coalesce(longest.length, 0) as longest_streak,
    la.day as last_active_date,
    (ta.user_id is not null) as active_today,
    (
      coalesce(cs.streak_length, 0) > 0
      and ta.user_id is null
      and tmr.user_id is null
      and trr.user_id is null
    ) as at_risk_today,
    (tmr.user_id is not null or trr.user_id is not null) as today_is_rest_day,
    case
      when tmr.user_id is not null then 'manual'
      when trr.user_id is not null then 'recurring'
      else null
    end as today_rest_day_source,
    (coalesce(mw.cnt, 0) + coalesce(rw.cnt, 0))::integer as rest_days_used_this_week,
    3 as rest_days_quota,
    ur.weekdays as recurring_rest_weekdays
  from target_users tu
  left join user_recurring ur on ur.user_id = tu.id
  left join last_valid_day lvd on lvd.user_id = tu.id
  left join last_active la on la.user_id = tu.id
  left join today_active ta on ta.user_id = tu.id
  left join today_manual_rest tmr on tmr.user_id = tu.id
  left join today_recurring_rest trr on trr.user_id = tu.id
  left join manual_rest_this_week mw on mw.user_id = tu.id
  left join recurring_rest_this_week rw on rw.user_id = tu.id
  left join lateral (
    select s.streak_length
    from streaks s
    where s.user_id = tu.id
      and s.end_day = lvd.day
      and lvd.day >= (select day from berlin_today) - 1
    order by s.end_day desc
    limit 1
  ) cs on true
  left join lateral (
    select max(s.streak_length) as length
    from streaks s
    where s.user_id = tu.id
  ) longest on true
  order by
    coalesce(cs.streak_length, 0) desc,
    coalesce(longest.length, 0) desc,
    tu.id;
$$;

revoke all on function public.get_streak_summaries(uuid[]) from public;
grant execute on function public.get_streak_summaries(uuid[]) to authenticated;

create or replace function public.mark_rest_day_today()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := timezone('Europe/Berlin', now())::date;
  v_weekday smallint := extract(isodow from timezone('Europe/Berlin', now()))::smallint;
  v_manual_count integer;
  v_recurring_count integer;
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.entries
    where user_id = v_user_id
      and timezone('Europe/Berlin', created_at)::date = v_today
  ) then
    raise exception 'restday_conflict_entry_exists' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.rest_days
    where user_id = v_user_id and rest_date = v_today
  ) then
    raise exception 'restday_already_set' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.recurring_rest_days
    where user_id = v_user_id
      and weekday = v_weekday
      and effective_from <= v_today
  ) then
    raise exception 'restday_already_recurring' using errcode = 'P0001';
  end if;

  select count(*)::integer
    into v_manual_count
  from public.rest_days
  where user_id = v_user_id
    and rest_date >= date_trunc('week', v_today)::date
    and rest_date <  (date_trunc('week', v_today) + interval '7 days')::date;

  select count(*)::integer
    into v_recurring_count
  from public.recurring_rest_days rrd
  where rrd.user_id = v_user_id
    and (date_trunc('week', v_today)::date + (rrd.weekday - 1)) >= rrd.effective_from;

  if v_manual_count + v_recurring_count >= 3 then
    raise exception 'restday_quota_exceeded' using errcode = 'P0001';
  end if;

  insert into public.rest_days (user_id, rest_date)
  values (v_user_id, v_today);
end;
$$;

create or replace function public.set_recurring_rest_weekdays(
  weekdays smallint[]
)
returns smallint[]
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := timezone('Europe/Berlin', now())::date;
  v_normalized smallint[];
  v_result smallint[];
begin
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if weekdays is null then
    v_normalized := '{}'::smallint[];
  else
    select coalesce(array_agg(distinct x order by x), '{}'::smallint[])
      into v_normalized
    from unnest(weekdays) as x;
  end if;

  if coalesce(array_length(v_normalized, 1), 0) > 3 then
    raise exception 'restday_recurring_too_many' using errcode = 'P0001';
  end if;

  if not (v_normalized <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]) then
    raise exception 'restday_recurring_invalid_value' using errcode = 'P0001';
  end if;

  -- Insert weekdays that are newly added. Keep effective_from for unchanged ones.
  insert into public.recurring_rest_days (user_id, weekday, effective_from)
  select v_user_id, w, v_today
  from unnest(v_normalized) as w
  on conflict (user_id, weekday) do nothing;

  -- Remove weekdays that are no longer in the new set.
  delete from public.recurring_rest_days
  where user_id = v_user_id
    and weekday <> all(v_normalized);

  select coalesce(array_agg(weekday order by weekday), '{}'::smallint[])
    into v_result
  from public.recurring_rest_days
  where user_id = v_user_id;

  return v_result;
end;
$$;
