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

echo "== Installing backend dependencies =="
cd "$APP_DIR/apps/backend"
npm install --omit=dev

echo "== nginx =="
cp "$APP_DIR/infra/ccaas-nginx.conf" /etc/nginx/snippets/ccaas.conf
if ! grep -q "connection_upgrade" /etc/nginx/nginx.conf; then
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
