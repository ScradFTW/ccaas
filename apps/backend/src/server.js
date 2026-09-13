import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { apiRouter } from './routes/api.js';
import { getSessionFromRequest } from './session.js';
import { handleChatConnection } from './chatSocket.js';
import { startIdleSweep } from './idleSweep.js';
import { startCronScheduler } from './cronScheduler.js';
import { ensureEgressProxy } from './docker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');

const app = express();
app.set('trust proxy', true);

// Unauthenticated on purpose: the load balancer's health check hits this
// directly (see bradjobe-dev-infra's gce_ccaas.tf google_compute_health_check),
// same convention as the Python backends' /health routes.
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRouter);
app.use('/api', apiRouter);
app.use(express.static(FRONTEND_DIST));
app.get('*', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws/chat') {
    socket.destroy();
    return;
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    handleChatConnection(ws, session.uid).catch((err) => {
      console.error('chat connection failed', err);
      ws.close();
    });
  });
});

ensureEgressProxy()
  .catch((err) => console.error('failed to start egress proxy on boot', err))
  .finally(() => {
    startIdleSweep();
    startCronScheduler();
    server.listen(config.port, '127.0.0.1', () => {
      console.log(`ccaas-backend listening on 127.0.0.1:${config.port}`);
    });
  });
