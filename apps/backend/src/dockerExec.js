import { PassThrough } from 'node:stream';
import { docker } from './docker.js';

// Runs a command inside a container over a plain (non-TTY) pipe. With
// Tty:false, Docker multiplexes stdout/stderr into one stream framed by an
// 8-byte header per chunk; demuxStream splits that back into two plain
// byte streams. Writing to `stream` still goes straight to the process's
// stdin, so this same duplex works for tools that read from stdin over
// time (e.g. Claude Code's --input-format stream-json).
export async function execInContainer(containerName, cmd, { user = 'coder', workingDir = '/home/coder' } = {}) {
  const container = docker.getContainer(containerName);
  const exec = await container.exec({
    Cmd: cmd,
    User: user,
    WorkingDir: workingDir,
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });

  const stream = await exec.start({ hijack: true, stdin: true });
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  docker.modem.demuxStream(stream, stdout, stderr);

  return { exec, stream, stdout, stderr };
}

// Buffers arbitrary chunks and invokes onLine for each complete line,
// carrying a partial trailing line over to the next chunk.
export function makeLineSplitter(onLine) {
  let buf = '';
  return (chunk) => {
    buf += chunk.toString('utf8');
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.trim()) onLine(line);
    }
  };
}

// Like collectUntilClose, but keeps stdout separate from stderr -- for
// commands whose stdout must be parsed as clean JSON, where stderr (e.g.
// warnings) must not get interleaved into that buffer.
export function collectStdoutUntilClose(stream, stdout, stderr, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(out);
    };
    stdout.on('data', (c) => (out += c.toString('utf8')));
    stderr.on('data', () => {}); // drained so it can't block the pipe; not logged here
    stream.on('end', finish);
    stream.on('close', finish);
    setTimeout(finish, timeoutMs);
  });
}

// Resolves with all buffered output once the underlying docker exec
// connection itself closes (the process exited), not once the demuxed
// PassThrough happens to emit 'close' -- that's not guaranteed to fire on
// its own. A timeout is a safety net in case the process hangs open.
export function collectUntilClose(stream, stdout, stderr, timeoutMs = 15000) {
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
