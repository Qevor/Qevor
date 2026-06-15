-- Agent Stack: wallets, policies, audit log, cosign queue, executor health
-- Migration is idempotent (create if not exists, add column if not exists)

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  wallet text not null,
  username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 0. Ensure profiles.wallet is unique so it can be referenced by FK.
-- Safe to re-run: if a unique/PK constraint on wallet already exists,
-- the duplicate-object exception is swallowed.
do $$
begin
  alter table profiles add constraint profiles_wallet_unique unique (wallet);
exception
  when duplicate_object then null;
  when duplicate_table then null;
end $$;

-- 1. Agent wallets linked to a Qevor profile
create table if not exists agent_wallets (
  id uuid primary key default gen_random_uuid(),
  profile_wallet text not null references profiles(wallet) on delete cascade,
  wallet_address text not null,
  chain text not null,                           -- 'ARC-TESTNET' | 'BASE' | etc.
  label text,
  status text not null default 'active',         -- 'active' | 'paused' | 'revoked'
  executor_mode text default null,               -- null | 'escrow' | 'delegate' (future)
  escrow_address text,
  created_at timestamptz not null default now(),
  unique (profile_wallet, wallet_address, chain)
);

-- 2. Spending / behavior policies attached to an agent wallet
create table if not exists agent_policies (
  id uuid primary key default gen_random_uuid(),
  agent_wallet_id uuid not null references agent_wallets(id) on delete cascade,
  -- Circle-native fields (mirrorable via `circle wallet limit set`)
  max_per_tx_usdc numeric(20,6),
  daily_cap_usdc numeric(20,6),
  weekly_cap_usdc numeric(20,6),
  monthly_cap_usdc numeric(20,6),
  allowlist_addresses text[] default '{}',
  blocklist_addresses text[] default '{}',
  -- Qevor-only fields (executor enforces)
  allowlist_usernames text[] default '{}',
  blocklist_usernames text[] default '{}',
  allowed_hours_utc int4range,                   -- e.g. [9,18)
  cosign_threshold_usdc numeric(20,6),
  -- Provenance
  mirrored_to_circle_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Immutable audit log
create table if not exists agent_audit_log (
  id uuid primary key default gen_random_uuid(),
  agent_wallet_id uuid not null references agent_wallets(id) on delete cascade,
  policy_id uuid references agent_policies(id),
  batch_request_id uuid,
  batch_payment_id uuid,
  action text not null,                          -- 'transfer' | 'batch_execute' | 'policy_check' | ...
  recipient_username text,
  recipient_address text,
  amount_usdc numeric(20,6),
  outcome text not null,                         -- 'executed' | 'blocked' | 'cosign_required' | 'failed'
  reason text,
  tx_hash text,
  circle_tx_id text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 4. Cosign queue: lines that exceeded threshold and need human approval
create table if not exists agent_cosign_queue (
  id uuid primary key default gen_random_uuid(),
  agent_wallet_id uuid not null references agent_wallets(id) on delete cascade,
  batch_payment_id uuid not null,
  recipient_username text,
  recipient_address text not null,
  amount_usdc numeric(20,6) not null,
  reason text not null,
  status text not null default 'pending',        -- 'pending' | 'approved' | 'rejected' | 'expired'
  approved_by text references profiles(wallet),
  approved_at timestamptz,
  expires_at timestamptz not null default (now() + interval '72 hours'),
  created_at timestamptz not null default now()
);

-- 5. Executor health & session state (singleton row)
create table if not exists executor_health (
  id text primary key default 'singleton',
  last_heartbeat_at timestamptz not null,
  session_state text not null default 'unknown', -- 'authenticated' | 'expired' | 'unknown'
  session_expires_at timestamptz,
  last_polled_at timestamptz,
  last_error text,
  last_error_at timestamptz
);

-- Indexes
create index if not exists idx_audit_wallet_time
  on agent_audit_log(agent_wallet_id, created_at desc);
create index if not exists idx_cosign_status
  on agent_cosign_queue(status, agent_wallet_id);
create index if not exists idx_cosign_expiry
  on agent_cosign_queue(expires_at) where status = 'pending';

-- Extend existing tables (add column if not exists)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'batch_requests' and column_name = 'executor_agent_wallet_id'
  ) then
    alter table batch_requests
      add column executor_agent_wallet_id uuid references agent_wallets(id);
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'batch_requests' and column_name = 'executor_state'
  ) then
    alter table batch_requests
      add column executor_state text default 'manual';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_name = 'receipts' and column_name = 'initiator_type'
  ) then
    alter table receipts
      add column initiator_type text not null default 'human';
  end if;
end $$;

-- RLS policies (following existing pattern — existing tables have no RLS,
-- so we enable it on new tables but keep policies permissive for now)
-- TODO: Tighten RLS once auth model is confirmed. Current Supabase client
-- uses anon key without auth, so RLS enforcement depends on future auth setup.

alter table agent_wallets enable row level security;
alter table agent_policies enable row level security;
alter table agent_audit_log enable row level security;
alter table agent_cosign_queue enable row level security;
alter table executor_health enable row level security;

-- Service role can do everything (executor uses service role key).
-- CREATE POLICY doesn't support IF NOT EXISTS, so we guard each one.
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'agent_wallets' and policyname = 'service_role_all_agent_wallets') then
    create policy "service_role_all_agent_wallets" on agent_wallets for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'agent_policies' and policyname = 'service_role_all_agent_policies') then
    create policy "service_role_all_agent_policies" on agent_policies for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'agent_audit_log' and policyname = 'service_role_all_agent_audit_log') then
    create policy "service_role_all_agent_audit_log" on agent_audit_log for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'agent_cosign_queue' and policyname = 'service_role_all_agent_cosign_queue') then
    create policy "service_role_all_agent_cosign_queue" on agent_cosign_queue for all using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'executor_health' and policyname = 'service_role_all_executor_health') then
    create policy "service_role_all_executor_health" on executor_health for all using (true) with check (true);
  end if;
end $$;
