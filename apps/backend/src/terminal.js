import { docker, containerNameForUser, startUserContainer, ensureEgressProxy } from './docker.js';
import { ensureAclFileForUser } from './squid.js';
import { touch } from './activity.js';

export async function handleTerminalConnection(ws, userId) {
  touch(userId);

  try {
    await ensureEgressProxy();
    await ensureAclFileForUser(userId);
    await startUserContainer(userId);
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: err.message }));
    ws.close();
    return;
  }

  const container = docker.getContainer(containerNameForUser(userId));
  const exec = await container.exec({
    Cmd: ['tmux', 'new-session', '-A', '-s', 'main', 'claude'],
    User: 'coder',
    WorkingDir: '/home/coder',
    Tty: true,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Env: ['TERM=xterm-256color'],
  });

  const stream = await exec.start({ hijack: true, stdin: true });

  stream.on('data', (chunk) => {
    touch(userId);
    if (ws.readyState === ws.OPEN) ws.send(chunk.toString('utf8'));
  });

  stream.on('end', () => {
    if (ws.readyState === ws.OPEN) ws.close();
  });

  ws.on('message', (raw) => {
    touch(userId);
    let msg;
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch {
      return;
    }

    if (msg.type === 'data') {
      stream.write(msg.data);
    } else if (msg.type === 'resize' && msg.cols && msg.rows) {
      exec.resize({ h: msg.rows, w: msg.cols }).catch(() => {});
    }
  });

  ws.on('close', () => {
    stream.end();
  });
}
