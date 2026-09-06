// Turns the raw claude stream-json event log into a flat list of display
// items. Recomputed from scratch each time (the event log is small and
// capped server-side), which avoids incremental-state bugs on reconnect.
export function deriveChatItems(events) {
  const items = [];
  const toolById = new Map();

  for (const event of events) {
    if (event.type === 'assistant') {
      for (const block of event.message?.content || []) {
        if (block.type === 'text' && block.text) {
          items.push({ id: `${event.uuid}-t${items.length}`, kind: 'assistant-text', text: block.text });
        } else if (block.type === 'tool_use') {
          const item = { id: block.id, kind: 'tool', name: block.name, input: block.input, result: null, isError: false };
          toolById.set(block.id, item);
          items.push(item);
        }
      }
    } else if (event.type === 'user') {
      for (const block of event.message?.content || []) {
        if (block.type === 'text' && block.text) {
          items.push({ id: `${event.uuid || Math.random()}-u${items.length}`, kind: 'user-text', text: block.text });
        } else if (block.type === 'tool_result') {
          const tool = toolById.get(block.tool_use_id);
          if (tool) {
            tool.result = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
            tool.isError = Boolean(block.is_error);
          }
        }
      }
    } else if (event.type === 'result' && event.is_error) {
      items.push({ id: `${event.uuid}-err`, kind: 'error', text: event.result });
    }
  }

  return items;
}

// Minimal rich-text rendering: preserves line breaks and turns fenced code
// blocks into monospace segments, without pulling in a full markdown lib.
export function splitCodeSegments(text) {
  const parts = text.split(/```(?:[a-zA-Z0-9]*\n)?/);
  return parts.map((part, i) => ({ code: i % 2 === 1, text: part }));
}
