-- Payment links table
create table if not exists payment_links (
  id uuid primary key default gen_random_uuid(),
  creator_wallet text,
  receiver_wallet text not null,
  amount numeric not null,
  expires_at timestamptz,
  max_uses integer,
  current_uses integer default 0,
  group_id uuid,
  created_at timestamptz default now()
);

-- Receipts table
create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  sender text not null,
  receiver text not null,
  amount numeric not null,
  tx_hash text not null,
  status text not null default 'paid',
  memo text,
  created_at timestamptz default now()
);

-- Batch payment requests table
create table if not exists batch_requests (
  id uuid primary key default gen_random_uuid(),
  creator_wallet text not null,
  title text,
  description text,
  recipients jsonb not null,  -- array of {wallet, amount, label}
  total_amount numeric not null,
  status text default 'pending', -- pending | partial | complete
  expires_at timestamptz,
  created_at timestamptz default now()
);

-- Batch payments tracking
create table if not exists batch_payments (
  id uuid primary key default gen_random_uuid(),
  batch_request_id uuid references batch_requests(id),
  payer_wallet text not null,
  recipient_wallet text not null,
  amount numeric not null,
  tx_hash text not null,
  status text default 'paid',
  created_at timestamptz default now()
);
