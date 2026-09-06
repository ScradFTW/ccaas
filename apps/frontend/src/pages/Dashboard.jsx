import { useEffect, useState } from 'react';
import { Chat } from '../components/Chat';
import { ClaudeLogin } from '../components/ClaudeLogin';
import { Settings } from './Settings';
import { Scheduled } from './Scheduled';
import { Files } from './Files';
import { api } from '../api';

export function Dashboard({ email, onLogout }) {
  const [view, setView] = useState('chat');
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(true);
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

  // Get people going with zero clicks: the sandbox spins up automatically
  // as soon as the dashboard loads, instead of waiting on a button press.
  useEffect(() => {
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="dashboard">
      <header>
        <span>{email}</span>
        <nav>
          <button className="link" onClick={() => setView('chat')}>
            Chat
          </button>
          <button className="link" onClick={() => setView('scheduled')}>
            Scheduled
          </button>
          <button className="link" onClick={() => setView('files')}>
            Files
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
        {view === 'scheduled' && <Scheduled onClose={() => setView('chat')} />}
        {view === 'files' && <Files onClose={() => setView('chat')} />}

        {view === 'chat' && starting && (
          <div className="centered">
            <div className="card">
              <p>Setting up your sandbox…</p>
            </div>
          </div>
        )}

        {view === 'chat' && !starting && !started && (
          <div className="centered">
            <div className="card">
              <p>Something went wrong starting your sandbox.</p>
              <button className="button" onClick={start}>
                Try again
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
