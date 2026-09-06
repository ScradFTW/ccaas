import { EventEmitter } from 'node:events';
import { execInContainer, makeLineSplitter } from './dockerExec.js';
import { containerNameForUser } from './docker.js';
import { getClaudeSessionId, setClaudeSessionId, clearClaudeSessionId } from './db.js';
import { touch } from './activity.js';

// One persistent `claude -p --input-format stream-json` process per user,
// kept alive across turns (confirmed live: it processes multiple stdin
// lines sequentially without exiting) and across browser reconnects, as
// long as this backend process itself stays up. Each user's history is
// replayed to a freshly-connecting client so a reconnect doesn't lose the
// transcript.
const sessions = new Map(); // userId -> session

const MAX_HISTORY = 500;

async function spawnChatProcess(userId) {
  const resumeId = getClaudeSessionId(userId);
  const cmd = [
    'claude',
    '-p',
    '--output-format=stream-json',
    '--input-format=stream-json',
    '--replay-user-messages',
    '--verbose',
    '--dangerously-skip-permissions',
  ];
  if (resumeId) cmd.push('--resume', resumeId);

  const { stream, stdout, stderr } = await execInContainer(containerNameForUser(userId), cmd);

  const session = {
    stream,
    history: [],
    busy: false,
    ended: false,
    emitter: new EventEmitter(),
  };
  sessions.set(userId, session);

  const onLine = makeLineSplitter((line) => {
    let event;
    try {
      event = JSON.parse(line);
    } catch (err) {
      console.error(`claude chat: failed to parse line for user ${userId}:`, line);
      return;
    }

    touch(userId);
    session.history.push(event);
    if (session.history.length > MAX_HISTORY) session.history.shift();

    if (event.type === 'result') {
      session.busy = false;
      if (event.session_id) setClaudeSessionId(userId, event.session_id);
    }

    session.emitter.emit('event', event);
  });

  stdout.on('data', onLine);
  stderr.on('data', (chunk) => {
    console.error(`claude chat stderr (user ${userId}):`, chunk.toString('utf8'));
  });

  stream.on('close', () => {
    session.ended = true;
    session.busy = false;
    session.emitter.emit('ended');
    if (sessions.get(userId) === session) sessions.delete(userId);
  });

  return session;
}

export async function getOrCreateChatSession(userId) {
  const existing = sessions.get(userId);
  if (existing && !existing.ended) return existing;
  return spawnChatProcess(userId);
}

// Ends the live process (if any) and forgets the stored session id, so the
// next connection starts a genuinely fresh conversation.
export function resetChatSession(userId) {
  const existing = sessions.get(userId);
  if (existing) {
    existing.stream.destroy();
    sessions.delete(userId);
  }
  clearClaudeSessionId(userId);
}

export function sendChatMessage(session, text) {
  session.busy = true;
  const line = JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text }] },
  });
  session.stream.write(line + '\n');
}
