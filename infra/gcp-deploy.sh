#!/usr/bin/env bash
# Runs ON the ccaas-vm (as root, via `gcloud compute ssh --tunnel-through-iap`
# from Cloud Build — see ../cloudbuild.yaml). Idempotent: does everything
# infra/setup-server.sh used to do by hand, every deploy, plus the actual
# code/image refresh infra/deploy.sh used to do. Both of those are removed
# by this same PR.
set -euo pipefail

APP_DIR=/opt/ccaas
REGISTRY="${1:?usage: gcp-deploy.sh <artifact-registry-path> <image-tag>}"
TAG="${2:?usage: gcp-deploy.sh <artifact-registry-path> <image-tag>}"

echo "== Pulling sandbox/egress-proxy images =="
docker pull "${REGISTRY}/ccaas-sandbox:${TAG}"
docker tag "${REGISTRY}/ccaas-sandbox:${TAG}" ccaas-sandbox:latest
docker pull "${REGISTRY}/ccaas-egress-proxy:${TAG}"
docker tag "${REGISTRY}/ccaas-egress-proxy:${TAG}" ccaas-egress-proxy:latest

echo "== Writing .env from Secret Manager =="
# Deliberately excluded from the deploy tarball (cloudbuild.yaml's
# package step) so secret material never passes through Cloud Build's
# workspace or a git repo — generated here instead, using the VM's own
# service account (already granted secretmanager.secretAccessor on each
# of these — see bradjobe-dev-infra's secrets.tf), every deploy.
ENV_FILE="$APP_DIR/apps/backend/.env"
{
  echo "PORT=8081"
  echo "ALLOWED_EMAILS=$(gcloud secrets versions access latest --secret=ccaas-allowed-emails 2>/dev/null || true)"
  echo "GOOGLE_CLIENT_ID=$(gcloud secrets versions access latest --secret=ccaas-google-oauth-client-id 2>/dev/null || true)"
  echo "GOOGLE_CLIENT_SECRET=$(gcloud secrets versions access latest --secret=ccaas-google-oauth-client-secret 2>/dev/null || true)"
  echo "GOOGLE_REDIRECT_URI=https://bradjobe.dev/ccaas/auth/google/callback"
  echo "SESSION_SECRET=$(gcloud secrets versions access latest --secret=ccaas-session-secret)"
  echo "ADMIN_USERNAME=admin"
  echo "ADMIN_PASSWORD=$(gcloud secrets versions access latest --secret=ccaas-admin-password)"
  echo "PUBLIC_BASE_PATH=/ccaas"
  echo "DATA_DIR=/srv/ccaas/data"
  echo "SQUID_ACL_DIR=/srv/ccaas/squid-acl"
  echo "MAX_CONCURRENT_CONTAINERS=2"
  echo "IDLE_TIMEOUT_MINUTES=20"
} > "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "== Installing backend dependencies =="
cd "$APP_DIR/apps/backend"
npm install --omit=dev

echo "== nginx =="
cp "$APP_DIR/infra/ccaas-nginx.conf" /etc/nginx/snippets/ccaas.conf
if ! grep -rq "connection_upgrade" /etc/nginx/nginx.conf /etc/nginx/conf.d/*.conf 2>/dev/null; then
  echo "NOTE: add the \$http_upgrade -> \$connection_upgrade map to the http {} block"
  echo "      in /etc/nginx/nginx.conf by hand once — see infra/ccaas-nginx.conf's header."
fi
if ! grep -rq "snippets/ccaas.conf" /etc/nginx/sites-available/default 2>/dev/null; then
  echo "NOTE: add 'include snippets/ccaas.conf;' and 'include /etc/nginx/ccaas-sites/*.conf;'"
  echo "      inside the server {} block in /etc/nginx/sites-available/default."
fi
mkdir -p /etc/nginx/ccaas-sites
chown ccaas:ccaas /etc/nginx/ccaas-sites
cp "$APP_DIR/infra/ccaas-nginx-reload.sudoers" /etc/sudoers.d/ccaas-nginx-reload
chmod 440 /etc/sudoers.d/ccaas-nginx-reload
visudo -c
nginx -t && systemctl reload nginx

echo "== systemd =="
cp "$APP_DIR/infra/ccaas-backend.service" /etc/systemd/system/ccaas-backend.service
systemctl daemon-reload
systemctl enable --now ccaas-backend
systemctl restart ccaas-backend

echo "Deploy complete."
