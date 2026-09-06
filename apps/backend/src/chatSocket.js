import { getOrCreateChatSession, sendChatMessage } from './claudeChat.js';
import { touch } from './activity.js';
import { startUserContainer } from './docker.js';

// Only one browser tab "owns" a user's chat socket at a time; a new
// connection takes over and the previous one is closed. The underlying
// claude process is independent of any single WebSocket, so this is just
// about who's listening, not the conversation itself.
const activeSockets = new Map(); // userId -> ws

export async function handleChatConnection(ws, userId) {
  touch(userId);

  const previous = activeSockets.get(userId);
  if (previous && previous !== ws && previous.readyState === previous.OPEN) {
    previous.close();
  }
  activeSockets.set(userId, ws);

  // Attach the message listener immediately -- container start and process
  // spawn below are async and can take a moment, and a message that
  // arrives before a listener exists is lost for good (EventEmitters
  // don't buffer past events). Queue anything that arrives before we have
  // a session to hand it to.
  let session = null;
  const queued = [];
  ws.on('message', (raw) => {
    touch(userId);
    let msg;
    try {
      msg = JSON.parse(raw.toString('utf8'));
    } catch {
      return;
    }
    if (msg.type !== 'send' || typeof msg.text !== 'string' || !msg.text.trim()) return;
    if (session) sendChatMessage(session, msg.text);
    else queued.push(msg.text);
  });

  try {
    await startUserContainer(userId);
    session = await getOrCreateChatSession(userId);
  } catch (err) {
    ws.send(JSON.stringify({ type: 'fatal', message: err.message }));
    ws.close();
    return;
  }

  ws.send(JSON.stringify({ type: 'history', events: session.history, busy: session.busy }));
  for (const text of queued) sendChatMessage(session, text);

  const onEvent = (event) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'event', data: event }));
  };
  const onEnded = () => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'ended' }));
  };
  session.emitter.on('event', onEvent);
  session.emitter.on('ended', onEnded);

  ws.on('close', () => {
    session.emitter.off('event', onEvent);
    session.emitter.off('ended', onEnded);
    if (activeSockets.get(userId) === ws) activeSockets.delete(userId);
  });
}
