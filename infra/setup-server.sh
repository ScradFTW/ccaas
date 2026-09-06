#!/usr/bin/env bash
# One-time server setup for ccaas. Run as root on 172.105.26.140.
# Idempotent: safe to re-run.
set -euo pipefail

APP_DIR=/opt/ccaas
DATA_DIR=/srv/ccaas/data
ACL_DIR=/srv/ccaas/squid-acl

echo "== Installing Docker =="
if ! command -v docker >/dev/null; then
  apt-get update
  apt-get install -y docker.io
  systemctl enable --now docker
fi

echo "== Creating service user =="
if ! id ccaas >/dev/null 2>&1; then
  useradd -r -m -d /srv/ccaas -s /usr/sbin/nologin ccaas
fi
usermod -aG docker ccaas

echo "== Preparing data directories =="
mkdir -p "$DATA_DIR" "$ACL_DIR"
chown -R ccaas:ccaas /srv/ccaas

echo "== Building Docker images =="
docker build -t ccaas-sandbox:latest "$APP_DIR/docker/sandbox"
docker build -t ccaas-egress-proxy:latest "$APP_DIR/docker/proxy"

echo "== Installing backend dependencies =="
# /opt/ccaas is root-owned (deployed by root); install as root, the ccaas
# service user only needs read access to run it.
cd "$APP_DIR/apps/backend"
npm install --omit=dev

echo "== Installing systemd unit =="
cp "$APP_DIR/infra/ccaas-backend.service" /etc/systemd/system/ccaas-backend.service
systemctl daemon-reload
systemctl enable ccaas-backend

echo "== nginx =="
if ! grep -q "connection_upgrade" /etc/nginx/nginx.conf; then
  echo "NOTE: add this to the http {} block in /etc/nginx/nginx.conf, then reload nginx:"
  echo
  echo '  map $http_upgrade $connection_upgrade {'
  echo '      default upgrade;'
  echo "      '' close;"
  echo '  }'
  echo
fi

cp "$APP_DIR/infra/ccaas-nginx.conf" /etc/nginx/snippets/ccaas.conf
if ! grep -q "snippets/ccaas.conf" /etc/nginx/sites-available/default; then
  echo "NOTE: add 'include snippets/ccaas.conf;' inside the server { } block(s) in"
  echo "      /etc/nginx/sites-available/default, then run: nginx -t && systemctl reload nginx"
fi

cat <<'EOF'

== Manual steps remaining ==
1. Copy apps/backend/.env.example to apps/backend/.env and fill in real
   values (Google OAuth client id/secret, SESSION_SECRET, ALLOWED_EMAILS).
2. Add the nginx map + include lines noted above, then:
     nginx -t && systemctl reload nginx
3. Once DNS for bradjobe.dev points only at this server:
     certbot --nginx -d bradjobe.dev
4. Enable the firewall (do this LAST, after confirming nginx/SSH are fine):
     ufw allow 22/tcp
     ufw allow 80/tcp
     ufw allow 443/tcp
     ufw --force enable
5. Start the backend:
     systemctl start ccaas-backend
     journalctl -u ccaas-backend -f
EOF
