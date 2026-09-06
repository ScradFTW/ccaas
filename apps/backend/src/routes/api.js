import express from 'express';
import { requireAuth } from '../session.js';
import { getEgressSettings, setEgressSettings } from '../db.js';
import { writeUserAclFile, reconfigureSquid, sanitizeDomains, ensureAclFileForUser } from '../squid.js';
import {
  startUserContainer,
  stopUserContainer,
  getUserContainerInfo,
  ServerAtCapacityError,
  ensureEgressProxy,
} from '../docker.js';

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
