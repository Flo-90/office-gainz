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
