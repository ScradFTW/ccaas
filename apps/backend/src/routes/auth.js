import crypto from 'node:crypto';
import express from 'express';
import { config } from '../config.js';
import { buildGoogleAuthUrl, exchangeCodeForToken, fetchGoogleUserinfo } from '../googleAuth.js';
import { findOrCreateUser } from '../db.js';
import { setSessionCookie, clearSessionCookie, setStateCookie, readState, clearStateCookie } from '../session.js';

export const authRouter = express.Router();

// Temporary single-admin login for testing, ahead of wiring up Google
// sign-in for real. Swap the frontend back to the /auth/google flow below
// once GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI and ALLOWED_EMAILS are set.
authRouter.post('/login', express.json(), (req, res) => {
  const { username, password } = req.body || {};

  if (!config.admin.username || !config.admin.password) {
    return res.status(500).json({ error: 'admin_login_not_configured' });
  }

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
  clearSessionCookie(res);
  res.json({ ok: true });
});
