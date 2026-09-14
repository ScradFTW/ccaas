#!/usr/bin/env bash
# Reverses ccaas-grant-nginx-access.sh: removes nginx's (www-data)
# traversal-only ACL entry from one user's Docker volume directory once
# that user's site is unpublished. Without this, every user who ever
# published a site keeps nginx access to their volume forever, even after
# unpublishing -- least-privilege should track the site's lifetime, not
# just grow monotonically. Same invocation shape as the grant script: run
# via sudo by the ccaas service user, takes a bare numeric user id and
# validates it itself.
set -euo pipefail

id="${1:-}"
if ! [[ "$id" =~ ^[0-9]+$ ]]; then
  echo "usage: $0 <numeric-user-id>" >&2
  exit 1
fi

dir="/var/lib/docker/volumes/ccaas-vol-${id}"
if [ ! -d "$dir" ]; then
  echo "no such volume directory: $dir" >&2
  exit 1
fi

setfacl -x u:www-data "$dir" 2>/dev/null || true
