#!/usr/bin/env bash
set -euo pipefail

# Parse arguments
DOMAIN=""
EMAIL=""
EXECUTOR_EMAIL=""
GIT_REF="main"

for arg in "$@"; do
  case "$arg" in
    --domain=*) DOMAIN="${arg#*=}" ;;
    --email=*) EMAIL="${arg#*=}" ;;
    --executor-email=*) EXECUTOR_EMAIL="${arg#*=}" ;;
    --git-ref=*) GIT_REF="${arg#*=}" ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage: $0 --domain=<domain> --email=<email> [--executor-email=<email>] [--git-ref=<ref>]"
  exit 1
fi
EXECUTOR_EMAIL="${EXECUTOR_EMAIL:-$EMAIL}"

echo "=== Qevor Bootstrap ==="
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"
echo "Executor email: $EXECUTOR_EMAIL"
echo "Git ref: $GIT_REF"

# 1. System packages
echo ">>> Installing system packages..."
apt-get update -qq
apt-get install -y -qq curl ca-certificates git nginx ufw python3-certbot-nginx rsync acl

# 2. Node 22 via NodeSource
if ! command -v node &>/dev/null || [[ "$(node -v)" != v22* ]]; then
  echo ">>> Installing Node 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
echo "Node version: $(node -v)"

# 3. Circle CLI
echo ">>> Installing Circle CLI..."
npm install -g @circle-fin/cli

# 4. Create users
echo ">>> Creating users..."
id -u qevor &>/dev/null || useradd -r -m -s /bin/bash qevor
id -u qevor-executor &>/dev/null || useradd -r -s /usr/sbin/nologin -m -d /var/lib/qevor-executor qevor-executor

# 5. Create directories
echo ">>> Creating directories..."
mkdir -p /opt/qevor /var/www/qevor/dist /var/log/qevor /etc/qevor
chmod 755 /opt/qevor /var/www/qevor /var/www/qevor/dist
chown qevor:www-data /var/www/qevor/dist
chown qevor:qevor /var/log/qevor
chmod 755 /var/log/qevor
# Grant executor write access to log dir
setfacl -m u:qevor-executor:rwx /var/log/qevor 2>/dev/null || chmod 777 /var/log/qevor
chmod 750 /etc/qevor
chown root:qevor /etc/qevor
chown qevor-executor:qevor-executor /var/lib/qevor-executor
chmod 700 /var/lib/qevor-executor

# 6. Clone/update repo
echo ">>> Cloning repo..."
if [[ -d /opt/qevor/repo/.git ]]; then
  cd /opt/qevor/repo && git fetch && git checkout "$GIT_REF" && git pull
else
  git clone https://github.com/Qevor/Qevor.git /opt/qevor/repo
  cd /opt/qevor/repo && git checkout "$GIT_REF"
fi

# 7. Env files
ENV_HALT=0
if [[ ! -f /etc/qevor/qevor-web.env ]]; then
  cp /opt/qevor/repo/deploy/env/qevor-web.env.example /etc/qevor/qevor-web.env
  sed -i "s|https://qevor.xyz|https://$DOMAIN|g" /etc/qevor/qevor-web.env
  sed -i "s|https://api.qevor.xyz|https://api.$DOMAIN|g" /etc/qevor/qevor-web.env
  chown root:qevor /etc/qevor/qevor-web.env
  chmod 640 /etc/qevor/qevor-web.env
  ENV_HALT=1
fi
if [[ ! -f /etc/qevor/qevor-api.env ]]; then
  cp /opt/qevor/repo/deploy/env/qevor-api.env.example /etc/qevor/qevor-api.env
  sed -i "s|https://qevor.xyz|https://$DOMAIN|g" /etc/qevor/qevor-api.env
  chown root:qevor /etc/qevor/qevor-api.env
  chmod 640 /etc/qevor/qevor-api.env
  ENV_HALT=1
fi
if [[ ! -f /etc/qevor/qevor-executor.env ]]; then
  cp /opt/qevor/repo/deploy/env/qevor-executor.env.example /etc/qevor/qevor-executor.env
  chown root:qevor-executor /etc/qevor/qevor-executor.env
  chmod 640 /etc/qevor/qevor-executor.env
  ENV_HALT=1
fi
if [[ $ENV_HALT -eq 1 ]]; then
  echo ""
  echo "============================================"
  echo "  ENV FILES NEED CONFIGURATION"
  echo "============================================"
  echo "Fill in the values in:"
  echo "  /etc/qevor/qevor-web.env"
  echo "  /etc/qevor/qevor-api.env"
  echo "  /etc/qevor/qevor-executor.env"
  echo ""
  echo "Then re-run this script."
  echo "============================================"
  exit 0
fi

# 8. Build SPA
echo ">>> Building SPA..."
cd /opt/qevor/repo
set -a
source /etc/qevor/qevor-web.env
set +a
npm ci --ignore-scripts
npm run build
rsync -a --delete dist/ /var/www/qevor/dist/

# 9. Build server
echo ">>> Building server..."
cd /opt/qevor/repo/server
npm ci
npm run build
mkdir -p /opt/qevor/server/dist
rsync -a --delete dist/ /opt/qevor/server/dist/
rsync -a node_modules/ /opt/qevor/server/node_modules/
cp package.json /opt/qevor/server/

# 10. Systemd units
echo ">>> Installing systemd units..."
cp /opt/qevor/repo/deploy/systemd/qevor-api.service /etc/systemd/system/
cp /opt/qevor/repo/deploy/systemd/qevor-executor.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable qevor-api qevor-executor
systemctl restart qevor-api qevor-executor

# 11. Temporary HTTP-only Nginx for Let's Encrypt validation
echo ">>> Configuring temporary nginx..."
NGINX_CONF="/etc/nginx/sites-available/qevor.conf"
cat > "$NGINX_CONF" <<NGINX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN api.$DOMAIN;
    root /var/www/qevor/dist;
    index index.html;

    location / {
        try_files \$uri /index.html;
    }

    location /.well-known/ {
        root /var/www/qevor/dist;
    }
}
NGINX
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/qevor.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# 12. UFW
echo ">>> Configuring firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 13. Certbot
echo ">>> Obtaining TLS certificate..."
certbot certonly --webroot -w /var/www/qevor/dist -d "$DOMAIN" -d "www.$DOMAIN" -d "api.$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"
cp /opt/qevor/repo/deploy/certbot/renew-hook.sh /etc/letsencrypt/renewal-hooks/deploy/qevor-reload.sh
chmod +x /etc/letsencrypt/renewal-hooks/deploy/qevor-reload.sh

# 14. Final HTTPS Nginx
echo ">>> Enabling HTTPS nginx..."
cp /opt/qevor/repo/deploy/nginx/qevor.conf "$NGINX_CONF"
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" "$NGINX_CONF"
nginx -t
systemctl reload nginx

# 15. Unattended upgrades
apt-get install -y -qq unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades 2>/dev/null || true

echo ""
echo "============================================"
echo "  Bootstrap complete."
echo "============================================"
echo ""
echo "The executor is running but NOT yet authenticated with Circle."
echo ""
echo "Run the following on this VPS to authenticate the executor wallet:"
echo ""
echo "    sudo -u qevor-executor HOME=/var/lib/qevor-executor \\"
echo "        circle terms accept"
echo "    sudo -u qevor-executor HOME=/var/lib/qevor-executor \\"
echo "        circle wallet login $EXECUTOR_EMAIL --testnet --init"
echo ""
echo "Copy the request-id printed. Check your email for the OTP, then:"
echo ""
echo "    sudo -u qevor-executor HOME=/var/lib/qevor-executor \\"
echo "        circle wallet login --request <request-id> --otp <code>"
echo ""
echo "Verify with:"
echo ""
echo "    sudo -u qevor-executor HOME=/var/lib/qevor-executor \\"
echo "        circle wallet status --type agent --output json"
echo ""
echo "The executor will pick up the session within 60 seconds and"
echo "executor_health.session_state will flip to 'authenticated'."
echo "============================================"
