alter table if exists payment_links
  add column if not exists creator_wallet text;

update payment_links
set creator_wallet = receiver_wallet
where creator_wallet is null;
