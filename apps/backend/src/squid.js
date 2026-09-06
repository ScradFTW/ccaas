import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { docker, ipForUser, PROXY_CONTAINER_NAME } from './docker.js';
import { getEgressSettings } from './db.js';

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function sanitizeDomains(domains) {
  if (!Array.isArray(domains)) return [];
  return domains
    .map((d) => String(d).trim().toLowerCase())
    .filter((d) => HOSTNAME_RE.test(d));
}

function aclFilePath(userId) {
  return path.join(config.squidAclDir, `user-${userId}.conf`);
}

export function writeUserAclFile(userId, { mode, domains }) {
  fs.mkdirSync(config.squidAclDir, { recursive: true });
  const src = `user_${userId}_src`;
  const ip = ipForUser(userId);
  const domainList = sanitizeDomains(domains).join(' ');

  let content = `acl ${src} src ${ip}/32\n`;
  if (mode === 'block') {
    content += `acl user_${userId}_blocked dstdomain ${domainList || 'localhost.invalid'}\n`;
    content += `http_access deny ${src} user_${userId}_blocked\n`;
    content += `http_access allow ${src}\n`;
  } else {
    content += `acl user_${userId}_allowed dstdomain ${domainList || 'localhost.invalid'}\n`;
    content += `http_access allow ${src} user_${userId}_allowed\n`;
    content += `http_access deny ${src}\n`;
  }

  fs.writeFileSync(aclFilePath(userId), content);
}

export async function ensureAclFileForUser(userId) {
  if (fs.existsSync(aclFilePath(userId))) return;
  writeUserAclFile(userId, getEgressSettings(userId));
  await reconfigureSquid();
}

export async function reconfigureSquid() {
  const container = docker.getContainer(PROXY_CONTAINER_NAME);
  const exec = await container.exec({
    Cmd: ['squid', '-k', 'reconfigure'],
    AttachStdout: true,
    AttachStderr: true,
  });
  await exec.start({});
}
