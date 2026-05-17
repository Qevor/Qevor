# Executor Crash Recovery

## Automatic recovery

The executor is configured with `Restart=on-failure` in systemd. After a crash,
it restarts within 10 seconds.

**Idempotency:** All transfers use deterministic keys (derived from
`batch_payment.id`). Re-running the same batch after a crash will not
double-send. The executor checks `agent_audit_log` for existing
`outcome='executed'` rows before re-executing.

## Check status

```bash
systemctl status qevor-executor
journalctl -u qevor-executor --since "10 minutes ago" --no-pager
```

## In-flight batches

If the executor crashed mid-batch, the `batch_request.executor_state` will be
`'in_progress'`. On restart, the executor will re-acquire the batch and continue.
Already-executed lines (those with `agent_audit_log` entries) will be skipped.

Check which batches are in-flight:

```sql
select id, executor_state, created_at
from batch_requests
where executor_state = 'in_progress';
```

## Corrupted CLI session

If the Circle CLI session files are corrupted (e.g., disk error), the executor
will report `session_state = 'expired'`. Fix:

```bash
sudo -u qevor-executor rm -rf /var/lib/qevor-executor/.circle
```

Then follow the session renewal runbook to re-authenticate.

## Manual intervention required

- If `agent_audit_log` shows `outcome='failed'` with CLI errors, investigate
  the Circle CLI output in the journal logs.
- If a batch is stuck in `executor_state = 'in_progress'` for over 10 minutes,
  check whether the executor process is alive and the CLI session is valid.
