import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });

export const db = new Database(path.join(config.dataDir, 'ccaas.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_sub TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS egress_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    mode TEXT NOT NULL CHECK (mode IN ('allow', 'block')),
    domains TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS claude_sessions (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    session_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cron_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    prompt TEXT NOT NULL,
    cron_expr TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    session_id TEXT,
    next_run_at TEXT NOT NULL,
    last_run_at TEXT,
    last_result TEXT,
    last_is_error INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS published_sites (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    slug TEXT UNIQUE NOT NULL,
    source_dir TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const DEFAULT_ALLOWLIST = [
  'api.anthropic.com',
  'console.anthropic.com',
  'platform.claude.com',
  'claude.ai',
  'statsig.anthropic.com',
  'sentry.io',
  'github.com',
  'raw.githubusercontent.com',
  'registry.npmjs.org',
  'pypi.org',
  'files.pythonhosted.org',
];

export function findOrCreateUser({ sub, email }) {
  const existing = db.prepare('SELECT * FROM users WHERE google_sub = ?').get(sub);
  if (existing) return existing;

  const info = db
    .prepare('INSERT INTO users (google_sub, email) VALUES (?, ?)')
    .run(sub, email);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);

  db.prepare('INSERT INTO egress_settings (user_id, mode, domains) VALUES (?, ?, ?)').run(
    user.id,
    'allow',
    JSON.stringify(DEFAULT_ALLOWLIST)
  );

  return user;
}

export function getEgressSettings(userId) {
  const row = db.prepare('SELECT * FROM egress_settings WHERE user_id = ?').get(userId);
  if (!row) return { mode: 'allow', domains: DEFAULT_ALLOWLIST };
  return { mode: row.mode, domains: JSON.parse(row.domains) };
}

export function setEgressSettings(userId, { mode, domains }) {
  db.prepare(
    `INSERT INTO egress_settings (user_id, mode, domains) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET mode = excluded.mode, domains = excluded.domains`
  ).run(userId, mode, JSON.stringify(domains));
}

export function getClaudeSessionId(userId) {
  const row = db.prepare('SELECT session_id FROM claude_sessions WHERE user_id = ?').get(userId);
  return row ? row.session_id : null;
}

export function clearClaudeSessionId(userId) {
  db.prepare('DELETE FROM claude_sessions WHERE user_id = ?').run(userId);
}

export function setClaudeSessionId(userId, sessionId) {
  db.prepare(
    `INSERT INTO claude_sessions (user_id, session_id) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET session_id = excluded.session_id`
  ).run(userId, sessionId);
}

export function listCronJobs(userId) {
  return db.prepare('SELECT * FROM cron_jobs WHERE user_id = ? ORDER BY id').all(userId);
}

export function createCronJob({ userId, prompt, cronExpr, nextRunAt }) {
  const info = db
    .prepare(
      `INSERT INTO cron_jobs (user_id, prompt, cron_expr, next_run_at) VALUES (?, ?, ?, ?)`
    )
    .run(userId, prompt, cronExpr, nextRunAt);
  return db.prepare('SELECT * FROM cron_jobs WHERE id = ?').get(info.lastInsertRowid);
}

export function deleteCronJob(userId, id) {
  db.prepare('DELETE FROM cron_jobs WHERE id = ? AND user_id = ?').run(id, userId);
}

export function setCronJobEnabled(userId, id, enabled) {
  db.prepare('UPDATE cron_jobs SET enabled = ? WHERE id = ? AND user_id = ?').run(
    enabled ? 1 : 0,
    id,
    userId
  );
}

export function getDueCronJobs(nowIso) {
  return db.prepare('SELECT * FROM cron_jobs WHERE enabled = 1 AND next_run_at <= ?').all(nowIso);
}

export function recordCronRun(id, { sessionId, nextRunAt, lastResult, lastIsError }) {
  db.prepare(
    `UPDATE cron_jobs
     SET session_id = ?, next_run_at = ?, last_run_at = datetime('now'), last_result = ?, last_is_error = ?
     WHERE id = ?`
  ).run(sessionId, nextRunAt, lastResult, lastIsError ? 1 : 0, id);
}

export function getPublishedSite(userId) {
  return db.prepare('SELECT * FROM published_sites WHERE user_id = ?').get(userId) || null;
}

export function findSiteBySlug(slug) {
  return db.prepare('SELECT * FROM published_sites WHERE slug = ?').get(slug) || null;
}

export function upsertPublishedSite(userId, { slug, sourceDir }) {
  db.prepare(
    `INSERT INTO published_sites (user_id, slug, source_dir, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET slug = excluded.slug, source_dir = excluded.source_dir, updated_at = excluded.updated_at`
  ).run(userId, slug, sourceDir);
}

export function deletePublishedSite(userId) {
  db.prepare('DELETE FROM published_sites WHERE user_id = ?').run(userId);
}
