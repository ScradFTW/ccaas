import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, InputGroup, Link, TextField } from '@heroui/react';
import { deriveChatItems, splitCodeSegments } from '../chatEvents';
import { api } from '../api';

function RichText({ text }) {
  const segments = splitCodeSegments(text);
  return (
    <>
      {segments.map((seg, i) =>
        seg.code ? (
          <pre key={i} className="bg-background border border-border rounded-md p-2 overflow-x-auto text-sm my-1">
            <code>{seg.text}</code>
          </pre>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}

function ChatItem({ item }) {
  if (item.kind === 'user-text') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] rounded-2xl px-4 py-2 whitespace-pre-wrap break-words bg-accent text-accent-foreground">
          <RichText text={item.text} />
        </div>
      </div>
    );
  }
  if (item.kind === 'assistant-text') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[70%] rounded-2xl px-4 py-2 whitespace-pre-wrap break-words bg-surface-secondary text-surface-secondary-foreground">
          <RichText text={item.text} />
        </div>
      </div>
    );
  }
  if (item.kind === 'tool') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[70%] bg-surface border border-border rounded-xl px-3 py-2 text-sm">
          <div className="font-semibold text-accent mb-1">🔧 {item.name}</div>
          <pre className="whitespace-pre-wrap break-words text-muted text-xs m-0">{JSON.stringify(item.input, null, 2)}</pre>
          {item.result != null && (
            <pre className={`whitespace-pre-wrap break-words text-xs mt-1 ${item.isError ? 'text-danger' : 'text-muted'}`}>
              {item.result.length > 800 ? `${item.result.slice(0, 800)}\n…` : item.result}
            </pre>
          )}
        </div>
      </div>
    );
  }
  if (item.kind === 'error') {
    return <div className="text-danger text-sm">{item.text}</div>;
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

  async function newChat() {
    if (!window.confirm('Start a new conversation? Your files are untouched, only chat history resets.')) return;
    await api.resetChat();
    setEvents([]);
    setBusy(false);
    setFatal('');
    wsRef.current?.close();
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex justify-end px-4 pt-2">
        <Link onPress={newChat} className="text-sm">+ New chat</Link>
      </div>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
        {items.map((item) => <ChatItem key={item.id} item={item} />)}
        {busy && (
          <div className="flex justify-start">
            <div className="max-w-[70%] rounded-2xl px-4 py-2 bg-surface-secondary text-muted italic">Thinking…</div>
          </div>
        )}
        {fatal && <div className="text-danger text-sm">{fatal}</div>}
      </div>
      <div className="flex gap-3 items-end px-4 py-3 bg-surface border-t border-separator">
        <TextField
          aria-label="Message your agent"
          value={input}
          onChange={setInput}
          isDisabled={!connected}
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        >
          <InputGroup>
            <InputGroup.TextArea rows={2} placeholder={connected ? 'Message your agent...' : 'Connecting…'}/>
          </InputGroup>
        </TextField>
        <Button onPress={send} isDisabled={!connected || busy || !input.trim()}>Send</Button>
      </div>
    </div>
  );
}
