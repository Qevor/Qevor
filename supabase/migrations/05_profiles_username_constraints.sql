-- Qevor user profiles
-- One wallet profile per connected account and one globally unique username.

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  wallet text not null,
  username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles add column if not exists id uuid default gen_random_uuid();
alter table profiles add column if not exists wallet text;
alter table profiles add column if not exists username text;
alter table profiles add column if not exists created_at timestamptz not null default now();
alter table profiles add column if not exists updated_at timestamptz not null default now();

update profiles set wallet = lower(trim(wallet)) where wallet is not null;
update profiles set username = lower(trim(username)) where username is not null;

create unique index if not exists profiles_wallet_unique_idx
  on profiles (lower(wallet));

create unique index if not exists profiles_username_unique_idx
  on profiles (lower(username))
  where username is not null;

alter table profiles enable row level security;

drop policy if exists "profiles are readable" on profiles;
create policy "profiles are readable"
  on profiles for select
  using (true);

drop policy if exists "profiles can be claimed by client" on profiles;
create policy "profiles can be claimed by client"
  on profiles for insert
  with check (true);

drop policy if exists "profiles can set username once" on profiles;
create policy "profiles can set username once"
  on profiles for update
  using (username is null)
  with check (username is not null);
