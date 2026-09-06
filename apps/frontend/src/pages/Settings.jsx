import { useEffect, useState } from 'react';
import { api } from '../api';

export function Settings({ onClose }) {
  const [mode, setMode] = useState('allow');
  const [domainsText, setDomainsText] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    api.getEgress().then((s) => {
      setMode(s.mode);
      setDomainsText(s.domains.join('\n'));
    });
  }, []);

  async function save() {
    setStatus('Saving...');
    const domains = domainsText
      .split('\n')
      .map((d) => d.trim())
      .filter(Boolean);
    try {
      await api.setEgress(mode, domains);
      setStatus('Saved.');
    } catch (err) {
      setStatus(`Failed: ${err.message}`);
    }
  }

  return (
    <div className="card settings">
      <h2>Network access</h2>
      <p>
        Control which domains your Claude Code sandbox can reach. Changes apply
        immediately, no restart needed.
      </p>

      <div className="mode-toggle">
        <label>
          <input type="radio" checked={mode === 'allow'} onChange={() => setMode('allow')} />
          Allowlist (only these domains are reachable)
        </label>
        <label>
          <input type="radio" checked={mode === 'block'} onChange={() => setMode('block')} />
          Blocklist (everything except these domains)
        </label>
      </div>

      <textarea
        rows={12}
        value={domainsText}
        onChange={(e) => setDomainsText(e.target.value)}
        placeholder="one domain per line, e.g. github.com"
      />

      <div className="row">
        <button className="button" onClick={save}>
          Save
        </button>
        <button className="button secondary" onClick={onClose}>
          Back
        </button>
        <span>{status}</span>
      </div>
    </div>
  );
}
