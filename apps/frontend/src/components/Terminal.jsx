import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export function TerminalView() {
  const containerRef = useRef(null);

  useEffect(() => {
    const term = new XTerm({ cursorBlink: true, fontSize: 14 });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ccaas/ws/terminal`);

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    });

    ws.addEventListener('message', (event) => {
      term.write(event.data);
    });

    ws.addEventListener('close', () => {
      term.write('\r\n\r\n[disconnected]\r\n');
    });

    const dataDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data }));
      }
    });

    const onResize = () => {
      fit.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      dataDisposable.dispose();
      ws.close();
      term.dispose();
    };
  }, []);

  return <div ref={containerRef} className="terminal" />;
}
