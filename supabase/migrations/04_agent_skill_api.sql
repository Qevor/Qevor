alter table batch_requests
  add column if not exists agent_request_id text;

create unique index if not exists idx_batch_requests_agent_request_id
  on batch_requests(agent_request_id)
  where agent_request_id is not null;
