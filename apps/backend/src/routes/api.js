import express from 'express';
import { requireAuth } from '../session.js';
import {
  getEgressSettings,
  setEgressSettings,
  listCronJobs,
  createCronJob,
  deleteCronJob,
  setCronJobEnabled,
  getPublishedSite,
  findSiteBySlug,
  upsertPublishedSite,
  deletePublishedSite,
} from '../db.js';
import { writeUserAclFile, reconfigureSquid, sanitizeDomains, ensureAclFileForUser } from '../squid.js';
import { touch } from '../activity.js';
import {
  startUserContainer,
  stopUserContainer,
  getUserContainerInfo,
  ServerAtCapacityError,
  ensureEgressProxy,
} from '../docker.js';
import { getAuthStatus, startLogin, submitLoginCode } from '../claudeAuth.js';
import { nextRunAtIso } from '../cronScheduler.js';
import { resetChatSession } from '../claudeChat.js';
import { listDir, downloadFile } from '../files.js';
import { validateSlug, validateSourceDir, writeSiteConfig, removeSiteConfig, reloadNginx } from '../sites.js';

export const apiRouter = express.Router();
apiRouter.use(requireAuth);

apiRouter.get('/me', (req, res) => {
  res.json({ email: req.user.email });
});

apiRouter.get('/session/status', async (req, res) => {
  const info = await getUserContainerInfo(req.user.uid);
  res.json({ running: info ? info.State === 'running' : false });
});

apiRouter.post('/session/start', async (req, res) => {
  try {
    touch(req.user.uid);
    await ensureEgressProxy();
    await ensureAclFileForUser(req.user.uid);
    await startUserContainer(req.user.uid);
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ServerAtCapacityError) {
      return res.status(503).json({ error: err.message });
    }
    console.error('failed to start container', err);
    res.status(500).json({ error: 'failed_to_start' });
  }
});

apiRouter.post('/session/stop', async (req, res) => {
  await stopUserContainer(req.user.uid);
  res.json({ ok: true });
});

apiRouter.get('/claude-auth/status', async (req, res) => {
  try {
    res.json(await getAuthStatus(req.user.uid));
  } catch (err) {
    console.error('claude auth status failed', err);
    res.status(500).json({ error: 'status_failed' });
  }
});

apiRouter.post('/claude-auth/login/start', express.json(), async (req, res) => {
  try {
    const url = await startLogin(req.user.uid, { useConsole: Boolean(req.body?.useConsole) });
    res.json({ url });
  } catch (err) {
    console.error('claude auth login start failed', err);
    res.status(500).json({ error: err.message || 'login_start_failed' });
  }
});

apiRouter.post('/claude-auth/login/code', express.json(), async (req, res) => {
  const code = String(req.body?.code || '').trim();
  if (!code) return res.status(400).json({ error: 'code_required' });
  try {
    res.json(await submitLoginCode(req.user.uid, code));
  } catch (err) {
    console.error('claude auth login code failed', err);
    res.status(500).json({ error: err.message || 'login_code_failed' });
  }
});

apiRouter.post('/chat/reset', (req, res) => {
  resetChatSession(req.user.uid);
  res.json({ ok: true });
});

apiRouter.get('/cron', (req, res) => {
  res.json(listCronJobs(req.user.uid));
});

apiRouter.post('/cron', express.json(), (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  const cronExpr = String(req.body?.cronExpr || '').trim();
  if (!prompt) return res.status(400).json({ error: 'prompt_required' });

  let nextRunAt;
  try {
    nextRunAt = nextRunAtIso(cronExpr);
  } catch {
    return res.status(400).json({ error: 'invalid_cron_expression' });
  }

  const job = createCronJob({ userId: req.user.uid, prompt, cronExpr, nextRunAt });
  res.json(job);
});

apiRouter.post('/cron/:id/enabled', express.json(), (req, res) => {
  setCronJobEnabled(req.user.uid, Number(req.params.id), Boolean(req.body?.enabled));
  res.json({ ok: true });
});

apiRouter.delete('/cron/:id', (req, res) => {
  deleteCronJob(req.user.uid, Number(req.params.id));
  res.json({ ok: true });
});

apiRouter.get('/files', async (req, res) => {
  try {
    res.json(await listDir(req.user.uid, req.query.path || ''));
  } catch (err) {
    if (err.message === 'invalid_path') return res.status(400).json({ error: 'invalid_path' });
    console.error('list files failed', err);
    res.status(500).json({ error: 'list_failed' });
  }
});

apiRouter.get('/files/download', async (req, res) => {
  try {
    const { buffer, filename } = await downloadFile(req.user.uid, req.query.path || '');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(buffer);
  } catch (err) {
    if (err.message === 'invalid_path') return res.status(400).json({ error: 'invalid_path' });
    console.error('download file failed', err);
    res.status(500).json({ error: 'download_failed' });
  }
});

apiRouter.get('/sites', (req, res) => {
  res.json(getPublishedSite(req.user.uid));
});

apiRouter.post('/sites', express.json(), async (req, res) => {
  let slug, sourceDir;
  try {
    slug = validateSlug(String(req.body?.slug || '').trim().toLowerCase());
    sourceDir = validateSourceDir(req.body?.sourceDir);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const existing = findSiteBySlug(slug);
  if (existing && existing.user_id !== req.user.uid) {
    return res.status(409).json({ error: 'slug_taken' });
  }

  try {
    const previous = getPublishedSite(req.user.uid);
    if (previous && previous.slug !== slug) removeSiteConfig(previous.slug);

    await writeSiteConfig(req.user.uid, slug, sourceDir);
    await reloadNginx();
    upsertPublishedSite(req.user.uid, { slug, sourceDir });
    res.json({ ok: true, slug, sourceDir, url: `https://bradjobe.dev/sites/${slug}/` });
  } catch (err) {
    console.error('publish site failed', err);
    res.status(500).json({ error: 'publish_failed' });
  }
});

apiRouter.delete('/sites', async (req, res) => {
  const existing = getPublishedSite(req.user.uid);
  if (!existing) return res.json({ ok: true });

  try {
    removeSiteConfig(existing.slug);
    await reloadNginx();
    deletePublishedSite(req.user.uid);
    res.json({ ok: true });
  } catch (err) {
    console.error('unpublish site failed', err);
    res.status(500).json({ error: 'unpublish_failed' });
  }
});

apiRouter.get('/settings/egress', (req, res) => {
  res.json(getEgressSettings(req.user.uid));
});

apiRouter.post('/settings/egress', express.json(), async (req, res) => {
  const mode = req.body.mode === 'block' ? 'block' : 'allow';
  const domains = sanitizeDomains(req.body.domains);

  setEgressSettings(req.user.uid, { mode, domains });
  writeUserAclFile(req.user.uid, { mode, domains });
  try {
    await reconfigureSquid();
  } catch (err) {
    console.error('squid reconfigure failed', err);
  }

  res.json({ ok: true, mode, domains });
});
