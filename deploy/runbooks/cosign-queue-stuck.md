# Cosign Queue Stuck

## Symptoms

- Items in `agent_cosign_queue` with `status = 'pending'` that haven't been
  acted on, and the user says they approved/rejected them.

## Check the queue

```sql
select id, recipient_address, amount_usdc, reason, status, expires_at, created_at
from agent_cosign_queue
where status = 'pending'
order by created_at;
```

## Manually expire stuck rows

```sql
update agent_cosign_queue
set status = 'expired'
where status = 'pending' and expires_at < now();
```

## Force-approve a stuck item

Only do this if the user has confirmed approval out-of-band:

```sql
update agent_cosign_queue
set status = 'approved', approved_at = now()
where id = '<cosign_queue_id>';
```

The executor will pick up approved items on the next poll cycle (15 seconds).

## Check executor is running

```bash
systemctl status qevor-executor
journalctl -u qevor-executor --since "5 minutes ago" | grep cosign
```

If the executor is not processing approved items, check `executor_health.session_state`.
