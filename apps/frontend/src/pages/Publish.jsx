import { useEffect, useState } from 'react';
import { api } from '../api';

export function Publish({ onClose }) {
  const [site, setSite] = useState(null);
  const [slug, setSlug] = useState('');
  const [sourceDir, setSourceDir] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    api.getSite().then((s) => {
      if (s) {
        setSite(s);
        setSlug(s.slug);
        setSourceDir(s.source_dir);
      }
    });
  }, []);

  async function publish() {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const result = await api.publishSite(slug.trim(), sourceDir.trim());
      setSite({ slug: result.slug, source_dir: result.sourceDir });
      setStatus(`Live at ${result.url}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    setBusy(true);
    setError('');
    try {
      await api.unpublishSite();
      setSite(null);
      setStatus('Unpublished.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card settings">
      <h2>Publish a website</h2>
      <p>
        Point this at a directory in your sandbox (e.g. a static site's build output) and
        Claude Code's work goes live at a public URL, on this domain.
      </p>

      {site && (
        <p>
          Currently live at{' '}
          <a href={`https://bradjobe.dev/sites/${site.slug}/`} target="_blank" rel="noopener noreferrer">
            bradjobe.dev/sites/{site.slug}/
          </a>{' '}
          serving <code>{site.source_dir}</code>
        </p>
      )}

      <div className="mode-toggle">
        <label>URL slug</label>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="my-project"
        />
        <label>Directory in your sandbox (relative to your home folder)</label>
        <input
          value={sourceDir}
          onChange={(e) => setSourceDir(e.target.value)}
          placeholder="my-site/dist"
        />
      </div>

      <div className="row">
        <button className="button" onClick={publish} disabled={busy || !slug.trim() || !sourceDir.trim()}>
          {site ? 'Update' : 'Publish'}
        </button>
        {site && (
          <button className="button secondary" onClick={unpublish} disabled={busy}>
            Unpublish
          </button>
        )}
        <button className="button secondary" onClick={onClose}>
          Back
        </button>
      </div>
      {status && <p>{status}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
