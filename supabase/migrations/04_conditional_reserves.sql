-- Conditional reserve funding for NOTARY witness-to-pay cases.
--
-- A NOTARY case is not actionable until the payer's Qevor agent has moved
-- USDC into its escrow wallet. This migration adds explicit reserve fields so
-- the executor can distinguish pre-work reserve funding from post-verdict
-- payout execution.

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'batch_requests' and column_name = 'notary_case_id') then
    alter table batch_requests add column notary_case_id text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'batch_requests' and column_name = 'reserve_wallet') then
    alter table batch_requests add column reserve_wallet text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'batch_requests' and column_name = 'reserve_source_wallet') then
    alter table batch_requests add column reserve_source_wallet text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'batch_requests' and column_name = 'reserve_amount_usdc') then
    alter table batch_requests add column reserve_amount_usdc numeric(20,6);
  end if;
end $$;

create index if not exists idx_batch_requests_executor_reserve
  on batch_requests(executor_state, executor_agent_wallet_id)
  where executor_state in ('pending_reserve', 'reserve_in_progress');

create index if not exists idx_batch_requests_notary_case
  on batch_requests(notary_case_id)
  where notary_case_id is not null;
