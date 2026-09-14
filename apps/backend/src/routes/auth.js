import crypto from 'node:crypto';
import express from 'express';
import { config } from '../config.js';
import { buildGoogleAuthUrl, exchangeCodeForToken, fetchGoogleUserinfo } from '../googleAuth.js';
import { findOrCreateUser, bumpSessionVersion } from '../db.js';
import { setSessionCookie, clearSessionCookie, setStateCookie, readState, clearStateCookie, getSessionFromRequest } from '../session.js';

export const authRouter = express.Router();

// In-memory sliding-window lockout, keyed by IP -- this is a single
// personal-use instance, not a fleet, so a per-process map is enough (a
// restart just resets the count, same as any other in-memory limiter here).
const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map();

function isLoginRateLimited(key) {
  const now = Date.now();
  const attempts = (loginAttempts.get(key) || []).filter((t) => now - t < LOGIN_ATTEMPT_WINDOW_MS);
  loginAttempts.set(key, attempts);
  return attempts.length >= LOGIN_ATTEMPT_LIMIT;
}

function recordLoginAttempt(key) {
  const attempts = loginAttempts.get(key) || [];
  attempts.push(Date.now());
  loginAttempts.set(key, attempts);
}

// Temporary single-admin login for testing, ahead of wiring up Google
// sign-in for real. Swap the frontend back to the /auth/google flow below
// once GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI and ALLOWED_EMAILS are set.
authRouter.post('/login', express.json(), (req, res) => {
  const { username, password } = req.body || {};

  if (!config.admin.username || !config.admin.password) {
    return res.status(500).json({ error: 'admin_login_not_configured' });
  }

  if (isLoginRateLimited(req.ip)) {
    return res.status(429).json({ error: 'too_many_attempts' });
  }
  recordLoginAttempt(req.ip);

  const usernameOk =
    Buffer.byteLength(String(username || '')) === Buffer.byteLength(config.admin.username) &&
    crypto.timingSafeEqual(Buffer.from(String(username || '')), Buffer.from(config.admin.username));
  const passwordOk =
    Buffer.byteLength(String(password || '')) === Buffer.byteLength(config.admin.password) &&
    crypto.timingSafeEqual(Buffer.from(String(password || '')), Buffer.from(config.admin.password));

  if (!usernameOk || !passwordOk) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  const user = findOrCreateUser({ sub: 'local-admin', email: config.admin.username });
  setSessionCookie(res, { uid: user.id, email: user.email });
  res.json({ ok: true });
});

authRouter.get('/google', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  setStateCookie(res, state);
  res.redirect(buildGoogleAuthUrl(state));
});

authRouter.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;

  if (error) return res.status(400).send(`Google sign-in failed: ${error}`);

  const expectedState = readState(req);
  clearStateCookie(res);
  if (!state || state !== expectedState) {
    return res.status(400).send('Invalid OAuth state, please try signing in again.');
  }

  try {
    const tokens = await exchangeCodeForToken(code);
    const userinfo = await fetchGoogleUserinfo(tokens.access_token);
    const email = (userinfo.email || '').toLowerCase();

    if (!userinfo.email_verified || !config.allowedEmails.includes(email)) {
      return res.status(403).send('This account is not authorized to use this app.');
    }

    const user = findOrCreateUser({ sub: userinfo.sub, email });
    setSessionCookie(res, { uid: user.id, email: user.email });
    res.redirect(`${config.publicBasePath}/`);
  } catch (err) {
    console.error('OAuth callback failed', err);
    res.status(500).send('Sign-in failed, please try again.');
  }
});

authRouter.post('/logout', (req, res) => {
  const session = getSessionFromRequest(req);
  if (session) bumpSessionVersion(session.uid);
  clearSessionCookie(res);
  res.json({ ok: true });
});
