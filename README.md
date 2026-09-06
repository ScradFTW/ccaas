# ccaas — Claude Code as a Service

Runs Claude Code in a per-user, network-isolated Docker container, controlled
through a browser terminal. Google login gates access; each user's own
Claude account (via `claude login` inside their container) handles Claude
Code auth/billing. See `.claude/plans/prancy-jumping-blossom.md` in the
Claude Code session that built this for the full design rationale.

## Layout

- `apps/backend` — Express + WebSocket server, Google OAuth, Docker
  orchestration (via `dockerode`), Squid ACL management. Runs on the host as
  a systemd service (needs the Docker socket).
- `apps/frontend` — React + Vite SPA (login, terminal via xterm.js, egress
  settings). Built to static files served by the backend.
- `docker/sandbox` — image containing the Claude Code CLI; one container per
  user, non-root, data persisted in a named Docker volume.
- `docker/proxy` — Squid forward proxy image enforcing each user's
  allow/blocklist. User containers sit on an `internal: true` Docker network
  with no other route out, so this is fail-closed by construction.
- `infra` — nginx snippet, systemd unit, one-time server setup script, and a
  deploy script.

## First-time server setup

1. `rsync` or `git clone` this repo to `/opt/ccaas` on the server.
2. Run `infra/setup-server.sh` as root on the server.
3. Follow the manual steps it prints (`.env`, nginx include, certbot, ufw).

## Deploys after that

From your local machine: `./infra/deploy.sh` (builds the frontend, rsyncs to
the server, reinstalls backend deps, restarts the service).

## Local development

```
cd apps/backend && npm install && npm run start   # needs a real .env + Docker
cd apps/frontend && npm install && npm run dev    # http://localhost:5173/ccaas/
```
