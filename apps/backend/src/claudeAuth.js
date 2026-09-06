import { execInContainer } from './dockerExec.js';
import { containerNameForUser } from './docker.js';

const pendingLogins = new Map(); // userId -> { stream, stdout, stderr }

// Resolves once the underlying docker exec connection itself closes (the
// process exited), not once the demuxed PassThrough happens to emit
// 'close' -- that's not guaranteed to fire on its own. A timeout is a
// safety net in case the process hangs open for some reason.
function collectUntilClose(stream, stdout, stderr, timeoutMs = 10000) {
  return new Promise((resolve) => {
    let buf = '';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(buf);
    };
    stdout.on('data', (c) => (buf += c.toString('utf8')));
    stderr.on('data', (c) => (buf += c.toString('utf8')));
    stream.on('end', finish);
    stream.on('close', finish);
    setTimeout(finish, timeoutMs);
  });
}

export async function getAuthStatus(userId) {
  const { stream, stdout, stderr } = await execInContainer(containerNameForUser(userId), [
    'claude',
    'auth',
    'status',
  ]);
  const output = await collectUntilClose(stream, stdout, stderr);
  try {
    return JSON.parse(output);
  } catch {
    return { loggedIn: false, authMethod: 'none', raw: output };
  }
}

// Starts `claude auth login`, waits for it to print the OAuth URL (it does
// this over a plain stdin/stdout pipe, no TTY required), and returns that
// URL. The process is kept open, waiting on stdin for the pasted code --
// see submitLoginCode.
export async function startLogin(userId, { useConsole = false } = {}) {
  const cmd = ['claude', 'auth', 'login', useConsole ? '--console' : '--claudeai'];
  const { stream, stdout, stderr } = await execInContainer(containerNameForUser(userId), cmd);

  let buf = '';
  const urlPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for a login URL')), 15000);
    const onChunk = (chunk) => {
      buf += chunk.toString('utf8');
      const match = buf.match(/https?:\/\/\S+/);
      if (match) {
        clearTimeout(timer);
        stdout.off('data', onChunk);
        resolve(match[0]);
      }
    };
    stdout.on('data', onChunk);
    stderr.on('data', onChunk);
  });

  const url = await urlPromise;
  pendingLogins.set(userId, { stream, stdout, stderr });
  return url;
}

export async function submitLoginCode(userId, code) {
  const pending = pendingLogins.get(userId);
  if (!pending) throw new Error('No login in progress for this user, start over.');
  pendingLogins.delete(userId);

  const { stream, stdout, stderr } = pending;
  const donePromise = collectUntilClose(stream, stdout, stderr, 15000);

  stream.write(`${code.trim()}\n`);
  await donePromise;

  return getAuthStatus(userId);
}
