import { useEffect, useState } from 'react';
import { Button, Card, Link, Spinner } from '@heroui/react';
import { Chat } from '../components/Chat';
import { ClaudeLogin } from '../components/ClaudeLogin';
import { Settings } from './Settings';
import { Scheduled } from './Scheduled';
import { Files } from './Files';
import { Publish } from './Publish';
import { api } from '../api';

const NAV = [
  {view: 'chat', label: 'Chat'},
  {view: 'scheduled', label: 'Scheduled'},
  {view: 'files', label: 'Files'},
  {view: 'publish', label: 'Publish'},
  {view: 'settings', label: 'Settings'}
];

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
    <div className="h-full flex flex-col bg-background text-foreground">
      <header className="flex justify-between items-center px-6 py-3 bg-surface border-b border-separator">
        <span className="text-sm text-muted">{email}</span>
        <nav className="flex gap-4">
          {NAV.map((item) => (
            <Link key={item.view} onPress={() => setView(item.view)} className="text-sm">
              {item.label}
            </Link>
          ))}
          <Link onPress={onLogout} className="text-sm">Sign out</Link>
        </nav>
      </header>

      <main className="flex-1 min-h-0 flex flex-col">
        {view === 'settings' && <Settings onClose={() => setView('chat')} />}
        {view === 'scheduled' && <Scheduled onClose={() => setView('chat')} />}
        {view === 'files' && <Files onClose={() => setView('chat')} />}
        {view === 'publish' && <Publish onClose={() => setView('chat')} />}

        {view === 'chat' && starting && (
          <div className="h-full flex items-center justify-center">
            <Card><Card.Content className="flex items-center gap-3"><Spinner/> Setting up your sandbox…</Card.Content></Card>
          </div>
        )}

        {view === 'chat' && !starting && !started && (
          <div className="h-full flex items-center justify-center">
            <Card><Card.Content className="flex flex-col items-center gap-3">
              <p>Something went wrong starting your sandbox.</p>
              <Button onPress={start}>Try again</Button>
              {error && <p className="text-danger text-sm">{error}</p>}
            </Card.Content></Card>
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
