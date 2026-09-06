#!/usr/bin/env bash
# Sync this repo to the server and restart the backend.
# Run from the repo root on your local machine: ./infra/deploy.sh
set -euo pipefail

HOST=root@172.105.26.140
REMOTE_DIR=/opt/ccaas

echo "== Building frontend =="
(cd apps/frontend && npm install && npm run build)

echo "== Syncing repo to $HOST:$REMOTE_DIR =="
rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude 'apps/backend/.env' \
  ./ "$HOST:$REMOTE_DIR/"

echo "== Installing backend deps + restarting service =="
# shellcheck disable=SC2029
ssh "$HOST" "cd $REMOTE_DIR/apps/backend && npm install --omit=dev && systemctl restart ccaas-backend"

echo "Done."
