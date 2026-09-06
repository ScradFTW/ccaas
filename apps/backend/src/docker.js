import Dockerode from 'dockerode';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

export const PROXY_PORT = 3128;
export const PROXY_CONTAINER_NAME = 'ccaas-egress-proxy';
export const SANDBOX_IMAGE = 'ccaas-sandbox:latest';
export const PROXY_IMAGE = 'ccaas-egress-proxy:latest';
const USER_NETWORK_PREFIX = 'ccaas-net-user-';

// Each user gets their own /24 bridge network (10.77.<userId>.0/24), fully
// isolated from every other user's network. The only thing attached to more
// than one of these is the egress-proxy container, which gets a dedicated
// IP on each one it joins — that's the sole path in or out for a user
// container, and it's how one user's container can never reach another's.
function assertUserIdInRange(userId) {
  if (userId < 1 || userId > 250) throw new Error('user id out of range for the 10.77.x.0/24 scheme');
}

export function networkNameForUser(userId) {
  return `${USER_NETWORK_PREFIX}${userId}`;
}

export function subnetForUser(userId) {
  assertUserIdInRange(userId);
  return `10.77.${userId}.0/24`;
}

export function gatewayForUser(userId) {
  return `10.77.${userId}.1`;
}

export function proxyIpForUser(userId) {
  return `10.77.${userId}.2`;
}

export function userIpForUser(userId) {
  return `10.77.${userId}.10`;
}

export function containerNameForUser(userId) {
  return `ccaas-user-${userId}`;
}

export function volumeNameForUser(userId) {
  return `ccaas-vol-${userId}`;
}

async function networkExists(name) {
  const networks = await docker.listNetworks({ filters: JSON.stringify({ name: [name] }) });
  return networks.some((n) => n.Name === name);
}

async function containerExists(name) {
  const containers = await docker.listContainers({ all: true, filters: JSON.stringify({ name: [name] }) });
  return containers.find((c) => c.Names.some((n) => n === `/${name}`));
}

async function ensureUserNetwork(userId) {
  const name = networkNameForUser(userId);
  if (await networkExists(name)) return name;
  await docker.createNetwork({
    Name: name,
    Driver: 'bridge',
    Internal: true,
    IPAM: { Config: [{ Subnet: subnetForUser(userId), Gateway: gatewayForUser(userId) }] },
  });
  return name;
}

async function isProxyConnectedTo(networkName) {
  const net = docker.getNetwork(networkName);
  const info = await net.inspect();
  return Boolean(info.Containers && Object.values(info.Containers).some((c) => c.Name === PROXY_CONTAINER_NAME));
}

async function connectProxyToUserNetwork(userId) {
  const networkName = networkNameForUser(userId);
  if (await isProxyConnectedTo(networkName)) return;
  await docker.getNetwork(networkName).connect({
    Container: PROXY_CONTAINER_NAME,
    EndpointConfig: { IPAMConfig: { IPv4Address: proxyIpForUser(userId) } },
  });
}

function ensurePlaceholderAclFile() {
  // Squid's `include acl.d/*.conf` is fatal if the glob matches nothing,
  // so the directory can never be truly empty.
  const hasConfFile = fs.readdirSync(config.squidAclDir).some((f) => f.endsWith('.conf'));
  if (!hasConfFile) {
    fs.writeFileSync(path.join(config.squidAclDir, '_placeholder.conf'), '# intentionally empty\n');
  }
}

export async function ensureEgressProxy() {
  fs.mkdirSync(config.squidAclDir, { recursive: true });
  ensurePlaceholderAclFile();

  const existing = await containerExists(PROXY_CONTAINER_NAME);
  if (existing) {
    if (existing.State !== 'running') await docker.getContainer(existing.Id).start();
    return;
  }

  // No explicit network here: it lands on the default `bridge` network,
  // which already has NAT to the real internet. Per-user networks are
  // attached afterwards, one per user, as those users come online.
  const container = await docker.createContainer({
    name: PROXY_CONTAINER_NAME,
    Image: PROXY_IMAGE,
    Hostname: 'egress-proxy',
    HostConfig: {
      Binds: [`${config.squidAclDir}:/etc/squid/acl.d`],
      RestartPolicy: { Name: 'unless-stopped' },
      Memory: 128 * 1024 * 1024,
    },
  });
  await container.start();

  // If the proxy container itself was recreated, re-join every per-user
  // network that already existed so those users aren't cut off.
  const networks = await docker.listNetworks({ filters: JSON.stringify({ name: [USER_NETWORK_PREFIX] }) });
  for (const n of networks) {
    if (!n.Name.startsWith(USER_NETWORK_PREFIX)) continue;
    const userId = Number(n.Name.slice(USER_NETWORK_PREFIX.length));
    await connectProxyToUserNetwork(userId);
  }
}

export async function countRunningUserContainers() {
  const containers = await docker.listContainers({
    filters: JSON.stringify({ label: ['ccaas.managed=true'], status: ['running'] }),
  });
  return containers.length;
}

export async function ensureUserVolume(userId) {
  const name = volumeNameForUser(userId);
  try {
    await docker.getVolume(name).inspect();
  } catch {
    await docker.createVolume({ Name: name });
  }
}

export async function getUserContainerInfo(userId) {
  return containerExists(containerNameForUser(userId));
}

export async function startUserContainer(userId) {
  await ensureEgressProxy();
  await ensureUserVolume(userId);
  await ensureUserNetwork(userId);
  await connectProxyToUserNetwork(userId);

  const name = containerNameForUser(userId);
  const existing = await containerExists(name);

  if (existing) {
    if (existing.State !== 'running') {
      const running = await countRunningUserContainers();
      if (running >= config.maxConcurrentContainers) {
        throw new ServerAtCapacityError();
      }
      await docker.getContainer(existing.Id).start();
    }
    return;
  }

  const running = await countRunningUserContainers();
  if (running >= config.maxConcurrentContainers) {
    throw new ServerAtCapacityError();
  }

  const container = await docker.createContainer({
    name,
    Image: SANDBOX_IMAGE,
    Hostname: `user-${userId}`,
    Labels: { 'ccaas.managed': 'true', 'ccaas.user_id': String(userId) },
    Env: [
      // Both cases: curl/libcurl (and anything built on it, e.g. git) only
      // honors lowercase https_proxy by design (httpoxy CVE mitigation),
      // while some other tools only check the uppercase form.
      `HTTP_PROXY=http://${proxyIpForUser(userId)}:${PROXY_PORT}`,
      `http_proxy=http://${proxyIpForUser(userId)}:${PROXY_PORT}`,
      `HTTPS_PROXY=http://${proxyIpForUser(userId)}:${PROXY_PORT}`,
      `https_proxy=http://${proxyIpForUser(userId)}:${PROXY_PORT}`,
      'NO_PROXY=localhost,127.0.0.1',
      'no_proxy=localhost,127.0.0.1',
      'TERM=xterm-256color',
    ],
    HostConfig: {
      Binds: [`${volumeNameForUser(userId)}:/home/coder`],
      Memory: 640 * 1024 * 1024,
      NanoCpus: 500_000_000,
      RestartPolicy: { Name: 'unless-stopped' },
    },
    NetworkingConfig: {
      EndpointsConfig: {
        [networkNameForUser(userId)]: { IPAMConfig: { IPv4Address: userIpForUser(userId) } },
      },
    },
  });
  await container.start();
}

export async function stopUserContainer(userId) {
  const existing = await containerExists(containerNameForUser(userId));
  if (existing && existing.State === 'running') {
    await docker.getContainer(existing.Id).stop({ t: 10 });
  }
}

export class ServerAtCapacityError extends Error {
  constructor() {
    super('Server is at capacity, try again shortly');
  }
}

export async function listRunningUserIds() {
  const containers = await docker.listContainers({
    filters: JSON.stringify({ label: ['ccaas.managed=true'], status: ['running'] }),
  });
  return containers.map((c) => Number(c.Labels['ccaas.user_id']));
}
