import { useEffect, useState } from 'react';
import { Button, Card, InputGroup, Link, TextField } from '@heroui/react';
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
    <div className="max-w-xl mx-auto my-8 w-full px-4">
      <Card>
        <Card.Header><Card.Title>Publish a website</Card.Title></Card.Header>
        <Card.Content className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Point this at a directory in your sandbox (e.g. a static site&apos;s build output) and your agent&apos;s
            work goes live at a public URL, on this domain.
          </p>

          {site && (
            <p className="text-sm">
              Currently live at{' '}
              <Link href={`https://bradjobe.dev/sites/${site.slug}/`} target="_blank" rel="noopener noreferrer">
                bradjobe.dev/sites/{site.slug}/
              </Link>{' '}
              serving <code className="bg-surface-secondary px-1 rounded">{site.source_dir}</code>
            </p>
          )}

          <TextField aria-label="URL slug" value={slug} onChange={setSlug}>
            <label className="text-sm text-muted block mb-1">URL slug</label>
            <InputGroup><InputGroup.Input placeholder="my-project"/></InputGroup>
          </TextField>
          <TextField aria-label="Source directory" value={sourceDir} onChange={setSourceDir}>
            <label className="text-sm text-muted block mb-1">Directory in your sandbox (relative to your home folder)</label>
            <InputGroup><InputGroup.Input placeholder="my-site/dist"/></InputGroup>
          </TextField>

          <div className="flex items-center gap-3">
            <Button onPress={publish} isDisabled={busy || !slug.trim() || !sourceDir.trim()}>
              {site ? 'Update' : 'Publish'}
            </Button>
            {site && <Button variant="tertiary" onPress={unpublish} isDisabled={busy}>Unpublish</Button>}
            <Button variant="tertiary" onPress={onClose}>Back</Button>
          </div>
          {status && <p className="text-sm">{status}</p>}
          {error && <p className="text-danger text-sm">{error}</p>}
        </Card.Content>
      </Card>
    </div>
  );
}
