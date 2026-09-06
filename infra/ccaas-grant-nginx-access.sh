#!/usr/bin/env bash
# Grants nginx (www-data) traversal-only access to one user's Docker volume
# directory, so it can serve a published site out of it. Run via sudo by
# the ccaas service user (see /etc/sudoers.d/ccaas-nginx-reload) -- takes a
# bare numeric user id and validates it itself, rather than trusting a
# shell-expanded argument in the sudoers rule (modern sudo disallows
# wildcards in sudoers command arguments anyway).
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

setfacl -m u:www-data:x "$dir"
