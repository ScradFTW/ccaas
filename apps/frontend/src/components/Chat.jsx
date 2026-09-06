import { useEffect, useMemo, useRef, useState } from 'react';
import { deriveChatItems, splitCodeSegments } from '../chatEvents';
import { api } from '../api';

function RichText({ text }) {
  const segments = splitCodeSegments(text);
  return (
    <>
      {segments.map((seg, i) =>
        seg.code ? (
          <pre key={i} className="chat-code">
            <code>{seg.text}</code>
          </pre>
        ) : (
          <span key={i} className="chat-text">
            {seg.text}
          </span>
        )
      )}
    </>
  );
}

function ChatItem({ item }) {
  if (item.kind === 'user-text') {
    return (
      <div className="chat-row chat-row-user">
        <div className="chat-bubble chat-bubble-user">
          <RichText text={item.text} />
        </div>
      </div>
    );
  }
  if (item.kind === 'assistant-text') {
    return (
      <div className="chat-row chat-row-assistant">
        <div className="chat-bubble chat-bubble-assistant">
          <RichText text={item.text} />
        </div>
      </div>
    );
  }
  if (item.kind === 'tool') {
    return (
      <div className="chat-row chat-row-assistant">
        <div className="chat-tool-card">
          <div className="chat-tool-name">🔧 {item.name}</div>
          <pre className="chat-tool-input">{JSON.stringify(item.input, null, 2)}</pre>
          {item.result != null && (
            <pre className={`chat-tool-result ${item.isError ? 'chat-tool-error' : ''}`}>
              {item.result.length > 800 ? `${item.result.slice(0, 800)}\n…` : item.result}
            </pre>
          )}
        </div>
      </div>
    );
  }
  if (item.kind === 'error') {
    return (
      <div className="chat-row">
        <div className="chat-error">{item.text}</div>
      </div>
    );
  }
  return null;
}

export function Chat() {
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [fatal, setFatal] = useState('');
  const [input, setInput] = useState('');
  const wsRef = useRef(null);
  const scrollRef = useRef(null);
  const shouldReconnect = useRef(true);

  useEffect(() => {
    shouldReconnect.current = true;
    connect();
    return () => {
      shouldReconnect.current = false;
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ccaas/ws/chat`);
    wsRef.current = ws;

    ws.addEventListener('open', () => setConnected(true));

    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'history') {
        setEvents(msg.events);
        setBusy(msg.busy);
      } else if (msg.type === 'event') {
        setEvents((prev) => [...prev, msg.data]);
        if (msg.data.type === 'result') setBusy(false);
      } else if (msg.type === 'fatal') {
        setFatal(msg.message);
      } else if (msg.type === 'ended') {
        setFatal('Session ended unexpectedly.');
      }
    });

    ws.addEventListener('close', () => {
      setConnected(false);
      if (shouldReconnect.current) setTimeout(connect, 2000);
    });
  }

  const items = useMemo(() => deriveChatItems(events), [events]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [items, busy]);

  function send() {
    const text = input.trim();
    if (!text || busy || !connected) return;
    wsRef.current.send(JSON.stringify({ type: 'send', text }));
    setInput('');
    setBusy(true);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function newChat() {
    if (!window.confirm('Start a new conversation? Your files are untouched, only chat history resets.')) return;
    await api.resetChat();
    setEvents([]);
    setBusy(false);
    setFatal('');
    wsRef.current?.close();
  }

  return (
    <div className="chat">
      <div className="chat-toolbar">
        <button className="link" onClick={newChat}>
          + New chat
        </button>
      </div>
      <div className="chat-scroll" ref={scrollRef}>
        {items.map((item) => (
          <ChatItem key={item.id} item={item} />
        ))}
        {busy && (
          <div className="chat-row chat-row-assistant">
            <div className="chat-bubble chat-bubble-assistant chat-thinking">Thinking…</div>
          </div>
        )}
        {fatal && (
          <div className="chat-row">
            <div className="chat-error">{fatal}</div>
          </div>
        )}
      </div>
      <div className="chat-input-row">
        <textarea
          rows={2}
          placeholder={connected ? 'Message Claude Code...' : 'Connecting…'}
          value={input}
          disabled={!connected}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button className="button" onClick={send} disabled={!connected || busy || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
