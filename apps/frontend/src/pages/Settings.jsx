import { useEffect, useState } from 'react';
import { Button, Card, InputGroup, TextField } from '@heroui/react';
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
    <div className="max-w-xl mx-auto my-8 w-full px-4">
      <Card>
        <Card.Header><Card.Title>Network access</Card.Title></Card.Header>
        <Card.Content className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Control which domains your sandbox can reach. Changes apply immediately, no restart needed.
          </p>

          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" style={{accentColor: 'var(--accent)'}} checked={mode === 'allow'} onChange={() => setMode('allow')} />
              Allowlist (only these domains are reachable)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" style={{accentColor: 'var(--accent)'}} checked={mode === 'block'} onChange={() => setMode('block')} />
              Blocklist (everything except these domains)
            </label>
          </div>

          <TextField aria-label="Domains" value={domainsText} onChange={setDomainsText}>
            <InputGroup>
              <InputGroup.TextArea rows={10} placeholder="one domain per line, e.g. github.com"/>
            </InputGroup>
          </TextField>

          <div className="flex items-center gap-3">
            <Button onPress={save}>Save</Button>
            <Button variant="tertiary" onPress={onClose}>Back</Button>
            <span className="text-sm text-muted">{status}</span>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
