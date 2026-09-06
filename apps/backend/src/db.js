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
`);

const DEFAULT_ALLOWLIST = [
  'api.anthropic.com',
  'console.anthropic.com',
  'claude.ai',
  'statsig.anthropic.com',
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
