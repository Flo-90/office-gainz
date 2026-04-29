create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  reps integer not null check (reps > 0),
  created_at timestamptz not null default now()
);

create index if not exists entries_user_id_idx on public.entries (user_id);
create index if not exists entries_exercise_id_idx on public.entries (exercise_id);
create index if not exists entries_created_at_idx on public.entries (created_at);

alter table public.users enable row level security;
alter table public.exercises enable row level security;
alter table public.entries enable row level security;

create policy "Users can view all profiles"
  on public.users
  for select
  to authenticated
  using (true);

create policy "Users can insert their profile"
  on public.users
  for insert
  to authenticated
  with check (id = auth.uid());

create policy "Users can update their profile"
  on public.users
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Exercises are readable by all authenticated"
  on public.exercises
  for select
  to authenticated
  using (true);

create policy "Users can add exercises"
  on public.exercises
  for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Entries are readable by all authenticated"
  on public.entries
  for select
  to authenticated
  using (true);

create policy "Users can add their entries"
  on public.entries
  for insert
  to authenticated
  with check (user_id = auth.uid());

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.users (id) on delete cascade,
  push_enabled boolean not null default false,
  daily_nudge_15h boolean not null default true,
  leaderboard_overtaken_today boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  expiration_time bigint,
  user_agent text,
  disabled_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

create index if not exists push_subscriptions_active_user_id_idx
  on public.push_subscriptions (user_id)
  where disabled_at is null;

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  notification_type text not null
    check (
      notification_type in ('daily_nudge_15h', 'leaderboard_overtaken_today')
    ),
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now()
);

create index if not exists notification_log_user_id_type_sent_at_idx
  on public.notification_log (user_id, notification_type, sent_at desc);

create table if not exists public.push_delivery_config (
  id boolean primary key default true check (id),
  project_url text not null,
  function_auth text not null,
  vapid_public_key text,
  vapid_private_key text,
  vapid_subject text not null default 'mailto:notifications@officegainz.local',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notification_preferences_set_updated_at
  on public.notification_preferences;

create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row
execute function public.set_updated_at();

drop trigger if exists push_subscriptions_set_updated_at
  on public.push_subscriptions;

create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row
execute function public.set_updated_at();

drop trigger if exists push_delivery_config_set_updated_at
  on public.push_delivery_config;

create trigger push_delivery_config_set_updated_at
before update on public.push_delivery_config
for each row
execute function public.set_updated_at();

create or replace function public.ensure_notification_preferences_for_user()
returns trigger
language plpgsql
as $$
begin
  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists users_create_notification_preferences
  on public.users;

create trigger users_create_notification_preferences
after insert on public.users
for each row
execute function public.ensure_notification_preferences_for_user();

insert into public.notification_preferences (user_id)
select public.users.id
from public.users
on conflict (user_id) do nothing;

alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log enable row level security;
alter table public.push_delivery_config enable row level security;

create policy "Users can view their notification preferences"
  on public.notification_preferences
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert their notification preferences"
  on public.notification_preferences
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update their notification preferences"
  on public.notification_preferences
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can view their push subscriptions"
  on public.push_subscriptions
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert their push subscriptions"
  on public.push_subscriptions
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update their push subscriptions"
  on public.push_subscriptions
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their push subscriptions"
  on public.push_subscriptions
  for delete
  to authenticated
  using (user_id = auth.uid());

create policy "Users can view their notification log"
  on public.notification_log
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.get_push_public_key()
returns text
language sql
security definer
set search_path = public
as $$
  select vapid_public_key
  from public.push_delivery_config
  where id = true;
$$;

revoke all on function public.get_push_public_key() from public;
grant execute on function public.get_push_public_key() to authenticated;

create or replace function public.configure_push_delivery(
  config_project_url text,
  config_function_auth text,
  config_vapid_subject text default 'mailto:notifications@officegainz.local'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_project_url text := trim(trailing '/' from config_project_url);
  job_command text;
begin
  insert into public.push_delivery_config (
    id,
    project_url,
    function_auth,
    vapid_subject
  )
  values (
    true,
    normalized_project_url,
    config_function_auth,
    config_vapid_subject
  )
  on conflict (id) do update
    set
      project_url = excluded.project_url,
      function_auth = excluded.function_auth,
      vapid_subject = excluded.vapid_subject,
      updated_at = now();

  job_command := format(
    $job$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type',
          'application/json',
          'Authorization',
          'Bearer ' || %L
        ),
        body := %L::jsonb,
        timeout_milliseconds := 10000
      );
    $job$,
    normalized_project_url || '/functions/v1/push-dispatch',
    config_function_auth,
    '{"type":"daily_nudge_scan"}'
  );

  perform cron.schedule(
    'officegainz-daily-nudge-hourly',
    '0 * * * *',
    job_command
  );
end;
$$;

create or replace function public.enqueue_push_dispatch_for_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  config_row public.push_delivery_config%rowtype;
  request_headers jsonb;
  auth_header text;
begin
  select *
  into config_row
  from public.push_delivery_config
  where id = true;

  if config_row.id is distinct from true then
    return new;
  end if;

  if current_setting('request.headers', true) is not null then
    request_headers := current_setting('request.headers', true)::jsonb;
    auth_header := coalesce(
      request_headers ->> 'authorization',
      request_headers ->> 'Authorization'
    );
  end if;

  if auth_header is null or auth_header = '' then
    auth_header := 'Bearer ' || config_row.function_auth;
  end if;

  perform net.http_post(
    url := config_row.project_url || '/functions/v1/push-dispatch',
    headers := jsonb_build_object(
      'Content-Type',
      'application/json',
      'Authorization',
      auth_header
    ),
    body := jsonb_build_object(
      'type',
      'entry_logged',
      'entryId',
      new.id
    ),
    timeout_milliseconds := 10000
  );

  return new;
end;
$$;

drop trigger if exists entries_enqueue_push_dispatch
  on public.entries;

create trigger entries_enqueue_push_dispatch
after insert on public.entries
for each row
execute function public.enqueue_push_dispatch_for_entry();
