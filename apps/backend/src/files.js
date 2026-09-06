import path from 'node:path';
import { execInContainer, makeLineSplitter } from './dockerExec.js';
import { containerNameForUser } from './docker.js';

const HOME = '/home/coder';

// Only ever allow paths inside the user's own home dir; reject any ".."
// segment outright rather than trying to resolve-and-compare, since path
// resolution happens inside the container, not here.
export function resolveSafePath(relPath) {
  const clean = String(relPath || '').replace(/^\/+/, '');
  if (clean.split('/').includes('..')) throw new Error('invalid_path');
  return path.posix.join(HOME, clean);
}

export async function listDir(userId, relPath) {
  const dir = resolveSafePath(relPath);
  const { stream, stdout, stderr } = await execInContainer(containerNameForUser(userId), [
    'find',
    dir,
    '-mindepth',
    '1',
    '-maxdepth',
    '1',
    '-printf',
    '%y\t%s\t%T@\t%f\n',
  ]);
  stream.end();

  const entries = [];
  stderr.on('data', () => {}); // e.g. "No such file or directory" -- surfaced as an empty listing
  const onLine = makeLineSplitter((line) => {
    const [type, size, mtime, ...nameParts] = line.split('\t');
    const name = nameParts.join('\t');
    if (!name) return;
    entries.push({
      name,
      isDir: type === 'd',
      size: Number(size) || 0,
      mtime: Number(parseFloat(mtime) * 1000) || 0,
    });
  });
  stdout.on('data', onLine);

  await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    stream.on('end', finish);
    stream.on('close', finish);
    setTimeout(finish, 10000);
  });

  entries.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
  return entries;
}

// Buffers the whole file server-side rather than live-piping: attaching a
// pipe() after the `await execInContainer(...)` call is one more async hop
// than a fast/small command needs to finish and emit 'end' on its own --
// pipe() attached after a stream has already ended never fires the
// destination's end, and the response hangs forever. Buffering (like
// listDir does) sidesteps that race entirely. Fine for a sandbox file
// browser; not meant for huge files.
export async function downloadFile(userId, relPath) {
  const filePath = resolveSafePath(relPath);
  const { stream, stdout, stderr } = await execInContainer(containerNameForUser(userId), ['cat', filePath]);
  stream.end();

  const chunks = [];
  stdout.on('data', (c) => chunks.push(c));
  stderr.on('data', () => {});

  await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    stream.on('end', finish);
    stream.on('close', finish);
    setTimeout(finish, 30000);
  });

  return { buffer: Buffer.concat(chunks), filename: path.posix.basename(filePath) };
}
