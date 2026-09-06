import Dockerode from 'dockerode';
import fs from 'node:fs';
import { config } from './config.js';

export const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

export const NETWORK_NAME = 'ccaas-internal';
export const NETWORK_SUBNET = '10.77.0.0/24';
export const NETWORK_GATEWAY = '10.77.0.1';
export const PROXY_IP = '10.77.0.2';
export const PROXY_PORT = 3128;
export const PROXY_CONTAINER_NAME = 'ccaas-egress-proxy';
export const SANDBOX_IMAGE = 'ccaas-sandbox:latest';
export const PROXY_IMAGE = 'ccaas-egress-proxy:latest';

export function ipForUser(userId) {
  const host = 10 + Number(userId);
  if (host > 250) throw new Error('user id out of range for the /24 subnet');
  return `10.77.0.${host}`;
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

export async function ensureNetwork() {
  if (await networkExists(NETWORK_NAME)) return;
  await docker.createNetwork({
    Name: NETWORK_NAME,
    Driver: 'bridge',
    Internal: true,
    IPAM: { Config: [{ Subnet: NETWORK_SUBNET, Gateway: NETWORK_GATEWAY }] },
    Options: { 'com.docker.network.bridge.enable_icc': 'false' },
  });
}

async function containerExists(name) {
  const containers = await docker.listContainers({ all: true, filters: JSON.stringify({ name: [name] }) });
  return containers.find((c) => c.Names.some((n) => n === `/${name}`));
}

export async function ensureEgressProxy() {
  fs.mkdirSync(config.squidAclDir, { recursive: true });
  await ensureNetwork();

  const existing = await containerExists(PROXY_CONTAINER_NAME);
  if (existing) {
    if (existing.State !== 'running') await docker.getContainer(existing.Id).start();
    return;
  }

  const container = await docker.createContainer({
    name: PROXY_CONTAINER_NAME,
    Image: PROXY_IMAGE,
    Hostname: 'egress-proxy',
    HostConfig: {
      Binds: [`${config.squidAclDir}:/etc/squid/acl.d`],
      RestartPolicy: { Name: 'unless-stopped' },
      Memory: 128 * 1024 * 1024,
    },
    NetworkingConfig: {
      EndpointsConfig: {
        [NETWORK_NAME]: { IPAMConfig: { IPv4Address: PROXY_IP } },
      },
    },
  });
  await container.start();
  // Second interface with real internet access, so it can actually forward allowed traffic.
  await docker.getNetwork('bridge').connect({ Container: container.id });
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
      `HTTP_PROXY=http://${PROXY_IP}:${PROXY_PORT}`,
      `HTTPS_PROXY=http://${PROXY_IP}:${PROXY_PORT}`,
      'NO_PROXY=localhost,127.0.0.1',
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
        [NETWORK_NAME]: { IPAMConfig: { IPv4Address: ipForUser(userId) } },
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
