create table if not exists recurring_payments (
  id uuid primary key default gen_random_uuid(),
  creator_wallet text not null,
  receiver_wallet text not null,
  amount numeric not null,
  chain_id integer not null,
  token_symbol text not null,
  frequency text not null default 'monthly',
  interval_count integer not null default 1,
  start_at timestamptz not null default now(),
  next_run_at timestamptz not null default now(),
  end_at timestamptz,
  max_runs integer,
  run_count integer not null default 0,
  status text not null default 'active',
  title text,
  memo text,
  execution_mode text not null default 'human',
  executor_agent_wallet_id uuid references agent_wallets(id),
  last_tx_hash text,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_payments_frequency_check check (frequency in ('daily', 'weekly', 'monthly')),
  constraint recurring_payments_status_check check (status in ('active', 'paused', 'cancelled', 'complete')),
  constraint recurring_payments_execution_mode_check check (execution_mode in ('human', 'agent')),
  constraint recurring_payments_amount_check check (amount > 0),
  constraint recurring_payments_interval_check check (interval_count > 0),
  constraint recurring_payments_max_runs_check check (max_runs is null or max_runs > 0)
);

create index if not exists idx_recurring_payments_creator_time
  on recurring_payments(creator_wallet, created_at desc);

create index if not exists idx_recurring_payments_receiver_time
  on recurring_payments(receiver_wallet, created_at desc);

create index if not exists idx_recurring_payments_due
  on recurring_payments(status, next_run_at)
  where status = 'active';

alter table recurring_payments enable row level security;

drop policy if exists "recurring payments are readable" on recurring_payments;
create policy "recurring payments are readable"
  on recurring_payments for select
  using (true);

drop policy if exists "recurring payments can be created by client" on recurring_payments;
create policy "recurring payments can be created by client"
  on recurring_payments for insert
  with check (true);

drop policy if exists "recurring payments can be updated by client" on recurring_payments;
create policy "recurring payments can be updated by client"
  on recurring_payments for update
  using (true)
  with check (true);
