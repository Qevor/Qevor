-- NOTARY attestation gating for batch payments.
--
-- Adds the data plane Qevor's executor needs to independently confirm — with
-- Arc — that a batch was authorized by a signed NOTARY verdict before it pays.
-- Enforcement is per agent_wallet so existing direct-from-app batch flows
-- continue to work unchanged (attestation_mode defaults to 'off').
--
-- This migration is idempotent. Safe to re-run.

-- 1. Attestation material recorded by NOTARY on each batch_requests insert.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'batch_requests' and column_name = 'attestation_id') then
    alter table batch_requests add column attestation_id text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'batch_requests' and column_name = 'notary_id') then
    alter table batch_requests add column notary_id text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'batch_requests' and column_name = 'obligation_id') then
    alter table batch_requests add column obligation_id text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'batch_requests' and column_name = 'verdict_hash') then
    alter table batch_requests add column verdict_hash text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'batch_requests' and column_name = 'evidence_hash') then
    alter table batch_requests add column evidence_hash text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'batch_requests' and column_name = 'reasoning_trace_hash') then
    alter table batch_requests add column reasoning_trace_hash text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'batch_requests' and column_name = 'confidence_bps') then
    alter table batch_requests add column confidence_bps integer;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'batch_requests' and column_name = 'verdict_signature') then
    alter table batch_requests add column verdict_signature text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'batch_requests' and column_name = 'attestation_contract') then
    alter table batch_requests add column attestation_contract text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'batch_requests' and column_name = 'attestation_chain_id') then
    alter table batch_requests add column attestation_chain_id integer;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'batch_requests' and column_name = 'notary_identity_registry') then
    alter table batch_requests add column notary_identity_registry text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'batch_requests' and column_name = 'attestation_domain_name') then
    alter table batch_requests add column attestation_domain_name text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'batch_requests' and column_name = 'attestation_domain_version') then
    alter table batch_requests add column attestation_domain_version text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'batch_requests' and column_name = 'attestation_created_at') then
    -- Unix seconds at which NOTARY recorded the attestation; used in EIP-712 payload.
    alter table batch_requests add column attestation_created_at bigint;
  end if;
end $$;

-- 2. Replay protection: one attestation_id can only authorize one batch.
create unique index if not exists ux_batch_requests_attestation_id
  on batch_requests(attestation_id)
  where attestation_id is not null;

-- 3. Per-agent-wallet enforcement mode.
--    'off'      — never verify (existing behavior, default for existing rows)
--    'optional' — verify when attestation_id is present; allow when absent
--    'required' — verification mandatory; block when absent or invalid
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'agent_wallets' and column_name = 'attestation_mode') then
    alter table agent_wallets add column attestation_mode text not null default 'off';
  end if;
end $$;

do $$
begin
  alter table agent_wallets
    add constraint agent_wallets_attestation_mode_check
    check (attestation_mode in ('off', 'optional', 'required'));
exception
  when duplicate_object then null;
end $$;

-- 4. Per-attempt audit trail. One row per verification attempt; on RPC failure,
--    earlier attempts remain so investigators can see the full history.
create table if not exists notary_verifications (
  id uuid primary key default gen_random_uuid(),
  batch_request_id uuid not null references batch_requests(id) on delete cascade,
  attestation_id text not null,
  notary_id text,
  signer_recovered text,
  signer_onchain text,
  notary_agent_wallet text,
  notary_status smallint,
  attestation_status smallint,
  confidence_bps_onchain integer,
  outcome text not null check (outcome in ('verified', 'rejected', 'rpc_unavailable')),
  reason text,
  attempt smallint not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_notary_verifications_attestation
  on notary_verifications(attestation_id);
create index if not exists idx_notary_verifications_batch
  on notary_verifications(batch_request_id, created_at desc);

-- 5. Settlement webhook delivery state on each batch_payment.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'batch_payments' and column_name = 'notary_webhook_state') then
    -- null when batch is not NOTARY-originated; otherwise 'pending' | 'delivered' | 'failed'
    alter table batch_payments add column notary_webhook_state text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'batch_payments' and column_name = 'notary_webhook_attempts') then
    alter table batch_payments add column notary_webhook_attempts integer not null default 0;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'batch_payments' and column_name = 'notary_webhook_last_error') then
    alter table batch_payments add column notary_webhook_last_error text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'batch_payments' and column_name = 'notary_webhook_last_attempt_at') then
    alter table batch_payments add column notary_webhook_last_attempt_at timestamptz;
  end if;
end $$;

-- 6. RLS — service role only (matches the pattern from 02_agent_stack.sql).
alter table notary_verifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'notary_verifications'
    and policyname = 'service_role_all_notary_verifications'
  ) then
    create policy "service_role_all_notary_verifications"
      on notary_verifications for all using (true) with check (true);
  end if;
end $$;
