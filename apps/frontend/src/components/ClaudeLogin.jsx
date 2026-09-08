import { useState } from 'react';
import { Button, Card, InputGroup, Link, TextField } from '@heroui/react';
import { api } from '../api';

export function ClaudeLogin({ onLoggedIn }) {
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    setBusy(true);
    setError('');
    try {
      const res = await api.claudeLoginStart(false);
      setUrl(res.url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    setBusy(true);
    setError('');
    try {
      const status = await api.claudeLoginCode(code);
      if (status.loggedIn) {
        onLoggedIn();
      } else {
        setError('That code did not work, please try again.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full flex items-center justify-center">
      <Card className="max-w-lg w-full">
        <Card.Header><Card.Title>Connect your account</Card.Title></Card.Header>
        <Card.Content className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Your sandbox runs your coding agent under your own account, separate from your website login.
          </p>

          {!url && (
            <div>
              <Button onPress={start} isDisabled={busy}>{busy ? 'Starting…' : 'Sign in'}</Button>
            </div>
          )}

          {url && (
            <>
              <p className="text-sm">
                1. Open this link and finish signing in:
                <br/>
                <Link href={url} target="_blank" rel="noopener noreferrer">{url}</Link>
              </p>
              <p className="text-sm">2. Paste the code it gives you back here:</p>
              <div className="flex items-center gap-3">
                <TextField aria-label="Login code" value={code} onChange={setCode} className="flex-1">
                  <InputGroup><InputGroup.Input placeholder="paste code"/></InputGroup>
                </TextField>
                <Button onPress={submitCode} isDisabled={busy || !code.trim()}>{busy ? 'Checking…' : 'Submit'}</Button>
              </div>
            </>
          )}

          {error && <p className="text-danger text-sm">{error}</p>}
        </Card.Content>
      </Card>
    </div>
  );
}
