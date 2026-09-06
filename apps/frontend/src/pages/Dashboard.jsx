import { useState } from 'react';
import { Chat } from '../components/Chat';
import { ClaudeLogin } from '../components/ClaudeLogin';
import { Settings } from './Settings';
import { api } from '../api';

export function Dashboard({ email, onLogout }) {
  const [view, setView] = useState('chat');
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [claudeLoggedIn, setClaudeLoggedIn] = useState(null);

  async function start() {
    setStarting(true);
    setError('');
    try {
      await api.sessionStart();
      setStarted(true);
      const status = await api.claudeAuthStatus();
      setClaudeLoggedIn(Boolean(status.loggedIn));
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="dashboard">
      <header>
        <span>{email}</span>
        <nav>
          <button className="link" onClick={() => setView('chat')}>
            Chat
          </button>
          <button className="link" onClick={() => setView('settings')}>
            Settings
          </button>
          <button className="link" onClick={onLogout}>
            Sign out
          </button>
        </nav>
      </header>

      <main>
        {view === 'settings' && <Settings onClose={() => setView('chat')} />}

        {view === 'chat' && !started && (
          <div className="centered">
            <div className="card">
              <p>Start your Claude Code sandbox to begin.</p>
              <button className="button" onClick={start} disabled={starting}>
                {starting ? 'Starting...' : 'Start session'}
              </button>
              {error && <p className="error">{error}</p>}
            </div>
          </div>
        )}

        {view === 'chat' && started && claudeLoggedIn === false && (
          <ClaudeLogin onLoggedIn={() => setClaudeLoggedIn(true)} />
        )}

        {view === 'chat' && started && claudeLoggedIn === true && <Chat />}
      </main>
    </div>
  );
}
