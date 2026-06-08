alter table payment_links
  add column if not exists chain_id integer not null default 5042002,
  add column if not exists token_symbol text not null default 'USDC';

alter table receipts
  add column if not exists chain_id integer not null default 5042002,
  add column if not exists token_symbol text not null default 'USDC';

alter table batch_requests
  add column if not exists chain_id integer not null default 5042002,
  add column if not exists token_symbol text not null default 'USDC';

alter table batch_payments
  add column if not exists chain_id integer not null default 5042002,
  add column if not exists token_symbol text not null default 'USDC';
