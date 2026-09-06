import { useEffect, useState } from 'react';
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
    <div className="card settings">
      <h2>Your files</h2>
      <p>
        Everything here lives in your own persistent storage on the server — it's still there
        the next time you start a session, even if the sandbox was stopped in between.
      </p>

      <div className="breadcrumbs">
        <button className="link" onClick={() => load('')}>
          home
        </button>
        {crumbs.map((part, i) => (
          <span key={i}>
            {' / '}
            <button className="link" onClick={() => load(crumbs.slice(0, i + 1).join('/'))}>
              {part}
            </button>
          </span>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="file-list">
        {entries.length === 0 && !error && <p>Empty directory.</p>}
        {entries.map((entry) => {
          const entryPath = cwd ? `${cwd}/${entry.name}` : entry.name;
          return (
            <div key={entry.name} className="file-row">
              {entry.isDir ? (
                <button className="link file-name" onClick={() => load(entryPath)}>
                  📁 {entry.name}
                </button>
              ) : (
                <span className="file-name">📄 {entry.name}</span>
              )}
              <span className="file-meta">{entry.isDir ? '' : formatSize(entry.size)}</span>
              {!entry.isDir && (
                <a className="link" href={api.downloadFileUrl(entryPath)}>
                  Download
                </a>
              )}
            </div>
          );
        })}
      </div>

      <div className="row">
        <button className="button secondary" onClick={onClose}>
          Back
        </button>
      </div>
    </div>
  );
}
