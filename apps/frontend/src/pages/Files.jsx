import { useEffect, useState } from 'react';
import { Button, Card, Link } from '@heroui/react';
import { api } from '../api';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Files({ onClose }) {
  const [cwd, setCwd] = useState('');
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');

  function load(path) {
    api
      .listFiles(path)
      .then((data) => {
        setEntries(data);
        setCwd(path);
        setError('');
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => load(''), []);

  const crumbs = cwd ? cwd.split('/').filter(Boolean) : [];

  return (
    <div className="max-w-xl mx-auto my-8 w-full px-4">
      <Card>
        <Card.Header><Card.Title>Your files</Card.Title></Card.Header>
        <Card.Content className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Everything here lives in your own persistent storage on the server — it&apos;s still there the next time
            you start a session, even if the sandbox was stopped in between.
          </p>

          <div className="text-sm">
            <Link onPress={() => load('')}>home</Link>
            {crumbs.map((part, i) => (
              <span key={i}>
                {' / '}
                <Link onPress={() => load(crumbs.slice(0, i + 1).join('/'))}>{part}</Link>
              </span>
            ))}
          </div>

          {error && <p className="text-danger text-sm">{error}</p>}

          <div className="flex flex-col gap-1.5">
            {entries.length === 0 && !error && <p className="text-sm text-muted">Empty directory.</p>}
            {entries.map((entry) => {
              const entryPath = cwd ? `${cwd}/${entry.name}` : entry.name;
              return (
                <div key={entry.name} className="flex items-center gap-3 px-3 py-2 bg-surface-secondary rounded-lg text-sm">
                  {entry.isDir
                    ? <Link onPress={() => load(entryPath)} className="flex-1 truncate">📁 {entry.name}</Link>
                    : <span className="flex-1 truncate">📄 {entry.name}</span>
                  }
                  <span className="text-muted text-xs">{entry.isDir ? '' : formatSize(entry.size)}</span>
                  {!entry.isDir && <Link href={api.downloadFileUrl(entryPath)}>Download</Link>}
                </div>
              );
            })}
          </div>

          <div>
            <Button variant="tertiary" onPress={onClose}>Back</Button>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
