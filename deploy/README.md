# Qevor VPS Deployment

## Prerequisites

- Ubuntu 22.04 or 24.04 LTS VPS (2 vCPU / 4 GB RAM minimum)
- A domain purchased from Namecheap (or any registrar)
- Root or sudo access on the VPS

## DNS Setup (Namecheap)

1. Log in to Namecheap > Domain List > Manage > Advanced DNS.
2. Delete the default parking-page records (CNAME for `www` pointing to
   `parkingpage.namecheap.com`, URL Redirect for `@`).
3. Add **A record**: `Host: @`, `Value: <VPS_PUBLIC_IPV4>`, `TTL: Automatic`.
4. (Optional) **CNAME**: `Host: www`, `Value: <your-domain>.`
5. (Optional, if VPS has IPv6) **AAAA record** for `@`.
6. Wait for propagation: `dig @1.1.1.1 <domain> +short` should return the
   VPS IP (5-30 min on Namecheap).

## Bootstrap

```bash
sudo ./deploy/bootstrap.sh \
  --domain=<your-domain> \
  --email=<you@example.com> \
  --executor-email=<treasury@yourdomain.com>
```

The script will halt on the first run to let you fill in env files at
`/etc/qevor/qevor-api.env` and `/etc/qevor/qevor-executor.env`.
Fill them in, then re-run the script.

## Executor Authentication

After bootstrap, authenticate the executor's Circle CLI session:

```bash
sudo -u qevor-executor HOME=/var/lib/qevor-executor \
    circle terms accept
sudo -u qevor-executor HOME=/var/lib/qevor-executor \
    circle wallet login <EXECUTOR_EMAIL> --testnet --init
# Copy the request-id, check email for OTP
sudo -u qevor-executor HOME=/var/lib/qevor-executor \
    circle wallet login --request <request-id> --otp <code>
# Verify
sudo -u qevor-executor HOME=/var/lib/qevor-executor \
    circle wallet status --type agent --output json
```

Sessions expire after 7 days. See `deploy/runbooks/executor-session-renewal.md`.

## Updates

```bash
sudo ./deploy/update.sh [git-ref]
```

Run Supabase migrations **before** running update.sh.

## Monitoring

```bash
journalctl -u qevor-api -f
journalctl -u qevor-executor -f
sudo -u qevor-executor HOME=/var/lib/qevor-executor circle wallet status --output json
```

## Security

- `qevor` and `qevor-executor` run as separate system users
- The executor's CLI session is in `/var/lib/qevor-executor/.circle` (mode 700)
- UFW: only ports 22, 80, 443 open
- Unattended upgrades enabled
- Recommended: install fail2ban (`apt install fail2ban`)

## Troubleshooting

| Issue | Fix |
|-------|-----|
| NXDOMAIN | DNS not propagated. `dig @1.1.1.1 <domain> +short` |
| 502 from Nginx | `journalctl -u qevor-api -f` |
| Executor `session_expired` | See `deploy/runbooks/executor-session-renewal.md` |
| certbot rate-limit | Use `--staging` first for testing |
| Namecheap parking records | Delete them, wait for TTL |
