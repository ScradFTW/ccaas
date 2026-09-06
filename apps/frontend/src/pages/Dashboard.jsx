import { useState } from 'react';
import { TerminalView } from '../components/Terminal';
import { Settings } from './Settings';
import { api } from '../api';

export function Dashboard({ email, onLogout }) {
  const [view, setView] = useState('terminal');
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    setStarting(true);
    setError('');
    try {
      await api.sessionStart();
      setStarted(true);
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
          <button className="link" onClick={() => setView('terminal')}>
            Terminal
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
        {view === 'settings' && <Settings onClose={() => setView('terminal')} />}

        {view === 'terminal' && !started && (
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

        {view === 'terminal' && started && <TerminalView />}
      </main>
    </div>
  );
}
