import { useState } from 'react';
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
    <div className="centered">
      <div className="card settings">
        <h2>Connect your Claude account</h2>
        <p>
          Your sandbox runs Claude Code under your own Claude account, separate from your
          website login.
        </p>

        {!url && (
          <button className="button" onClick={start} disabled={busy}>
            {busy ? 'Starting…' : 'Sign in with Claude'}
          </button>
        )}

        {url && (
          <>
            <p>
              1. Open this link and finish signing in:
              <br />
              <a href={url} target="_blank" rel="noopener noreferrer">
                {url}
              </a>
            </p>
            <p>2. Paste the code it gives you back here:</p>
            <div className="row">
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="paste code" />
              <button className="button" onClick={submitCode} disabled={busy || !code.trim()}>
                {busy ? 'Checking…' : 'Submit'}
              </button>
            </div>
          </>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
