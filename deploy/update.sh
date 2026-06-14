#!/usr/bin/env bash
set -euo pipefail

cd /opt/qevor/repo
git fetch && git checkout "${1:-main}" && git pull

# Build SPA
set -a
source /etc/qevor/qevor-web.env
set +a
npm ci --ignore-scripts
npm run build
rsync -a --delete dist/ /var/www/qevor/dist/

# Build server
cd server
npm ci
npm run build
rsync -a --delete dist/ /opt/qevor/server/dist/
rsync -a node_modules/ /opt/qevor/server/node_modules/
cp package.json /opt/qevor/server/

# Restart services
systemctl restart qevor-api qevor-executor
systemctl reload nginx

sleep 3
curl -fsS "${VITE_QEVOR_API_URL:-https://api.qevor.xyz}/healthz" >/dev/null && echo "API OK" || echo "API FAILED"

# Check executor session (requires psql access to Supabase — skip if not available)
echo "Check executor_health manually: select session_state from executor_health where id='singleton';"
