# Executor Session Renewal

Circle CLI sessions expire after **7 days**. When the executor detects expiry,
it sets `executor_health.session_state = 'expired'` and stops processing batches.

## Check current state

```bash
sudo -u qevor-executor HOME=/var/lib/qevor-executor \
    circle wallet status --type agent --output json
```

## Renew the session

Step 1 — initiate login (returns a request ID):

```bash
sudo -u qevor-executor HOME=/var/lib/qevor-executor \
    circle wallet login <EXECUTOR_EMAIL> --testnet --init
```

Step 2 — check your email for the OTP code, then complete:

```bash
sudo -u qevor-executor HOME=/var/lib/qevor-executor \
    circle wallet login --request <request-id> --otp <code>
```

Note: request IDs expire after 10 minutes.

## Verify

```bash
sudo -u qevor-executor HOME=/var/lib/qevor-executor \
    circle wallet status --type agent --output json
```

The executor will detect the new session within 60 seconds. Check:

```sql
select session_state, last_heartbeat_at from executor_health where id = 'singleton';
```

## If login fails

- Ensure the email address matches the one used during initial setup
- Check that `@circle-fin/cli` is installed globally: `circle --version`
- Verify HOME is set correctly: `ls /var/lib/qevor-executor/.circle/`
- Try accepting terms again: `sudo -u qevor-executor HOME=/var/lib/qevor-executor circle terms accept`
