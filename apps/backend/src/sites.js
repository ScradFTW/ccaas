import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { docker, volumeNameForUser } from './docker.js';

const execFileAsync = promisify(execFile);

const SITES_DIR = '/etc/nginx/ccaas-sites';
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;
const SAFE_PATH_RE = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;

// Anything that would collide with a route this app (or a sibling app on
// the same nginx host) already owns.
const RESERVED_SLUGS = new Set([
  'ccaas',
  'api',
  'auth',
  'ws',
  'sites',
  'assets',
  'llm-testing',
  'genre-classifier',
  'ai',
  'agent-demo',
  'status',
  'image-classifier',
]);

export function validateSlug(slug) {
  if (!SLUG_RE.test(slug)) throw new Error('invalid_slug');
  if (RESERVED_SLUGS.has(slug)) throw new Error('reserved_slug');
  return slug;
}

// Deliberately narrow: letters/digits/._- per path segment, no characters
// that could break out of the generated nginx config (this string ends up
// inside a config file we then ask nginx to load). SAFE_PATH_RE alone is
// NOT enough: "." is an allowed character, so a segment of exactly ".."
// still matches the regex -- each segment must be checked individually to
// actually reject "..".
export function validateSourceDir(sourceDir) {
  const clean = String(sourceDir || '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!clean || !SAFE_PATH_RE.test(clean)) throw new Error('invalid_source_dir');
  const segments = clean.split('/');
  if (segments.some((seg) => seg === '.' || seg === '..')) throw new Error('invalid_source_dir');
  return clean;
}

async function getVolumeMountpoint(userId) {
  const info = await docker.getVolume(volumeNameForUser(userId)).inspect();
  return info.Mountpoint;
}

// /var/lib/docker is drwx--x--- (Docker's own hardening: zero access for
// "other"), so nginx (www-data) can't traverse into any volume's directory
// by default. A default ACL on /var/lib/docker/volumes grants this to new
// volumes automatically, but its inherited mask gets recomputed per
// directory and isn't reliably non-empty -- so grant it explicitly and
// idempotently here instead of trusting inheritance alone.
export async function grantNginxAccessToVolume(userId) {
  await execFileAsync('sudo', ['/usr/local/sbin/ccaas-grant-nginx-access.sh', String(userId)]);
}

// Reverses grantNginxAccessToVolume once a user's site is unpublished --
// without this, nginx keeps traversal access to every volume it was ever
// granted access to, forever, regardless of whether that user still
// publishes anything.
export async function revokeNginxAccessToVolume(userId) {
  await execFileAsync('sudo', ['/usr/local/sbin/ccaas-revoke-nginx-access.sh', String(userId)]);
}

function siteConfigPath(slug) {
  return path.join(SITES_DIR, `${slug}.conf`);
}

export async function writeSiteConfig(userId, slug, sourceDir) {
  await grantNginxAccessToVolume(userId);
  const mountpoint = await getVolumeMountpoint(userId);
  const joined = path.posix.join(mountpoint, sourceDir);

  // Defense in depth beyond validateSourceDir's segment check: a symlink
  // planted inside the volume could still resolve outside of it, so
  // confirm containment against the REAL (symlink-resolved) mountpoint
  // path, not just the string we joined.
  const realMountpoint = fs.realpathSync(mountpoint);
  let realDir;
  try {
    realDir = fs.realpathSync(joined);
  } catch {
    throw new Error('invalid_source_dir');
  }
  if (realDir !== realMountpoint && !realDir.startsWith(`${realMountpoint}/`)) {
    throw new Error('invalid_source_dir');
  }

  const fullDir = `${realDir}/`;
  const content = `location /sites/${slug}/ {\n    alias ${fullDir};\n    try_files $uri $uri/ =404;\n}\n`;
  fs.mkdirSync(SITES_DIR, { recursive: true });
  fs.writeFileSync(siteConfigPath(slug), content);
}

export function removeSiteConfig(slug) {
  const p = siteConfigPath(slug);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

// Reload is scoped via sudoers to exactly these two commands (see
// infra/setup-server.sh) -- the ccaas service user otherwise has no
// permission to touch nginx (it can't even read the TLS private key
// nginx -t needs, hence running that through sudo too).
export async function reloadNginx() {
  await execFileAsync('sudo', ['nginx', '-t']);
  await execFileAsync('sudo', ['systemctl', 'reload', 'nginx']);
}
