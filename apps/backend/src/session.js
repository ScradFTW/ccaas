import crypto from 'node:crypto';
import { config } from './config.js';
import { getSessionVersion } from './db.js';

const COOKIE_NAME = 'ccaas_session';
const STATE_COOKIE_NAME = 'ccaas_oauth_state';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadB64) {
  return crypto.createHmac('sha256', config.sessionSecret).update(payloadB64).digest('base64url');
}

export function createSessionCookieValue(data) {
  const sv = getSessionVersion(data.uid) ?? 0;
  const payload = b64url(JSON.stringify({ ...data, sv, iat: Date.now() }));
  return `${payload}.${sign(payload)}`;
}

export function verifySessionCookieValue(value) {
  if (!value) return null;
  const [payload, sig] = value.split('.');
  if (!payload || !sig) return null;
  let sigBuf, expectedBuf;
  try {
    sigBuf = Buffer.from(sig, 'base64url');
    expectedBuf = Buffer.from(sign(payload), 'base64url');
  } catch {
    return null;
  }
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (Date.now() - data.iat > MAX_AGE_MS) return null;
    if (data.sv !== getSessionVersion(data.uid)) return null;
    return data;
  } catch {
    return null;
  }
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function cookieAttrs({ maxAgeSeconds }) {
  return [
    `Path=${config.publicBasePath}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ].join('; ');
}

export function setSessionCookie(res, data) {
  const value = createSessionCookieValue(data);
  res.append('Set-Cookie', `${COOKIE_NAME}=${value}; ${cookieAttrs({ maxAgeSeconds: MAX_AGE_MS / 1000 })}`);
}

export function clearSessionCookie(res) {
  res.append('Set-Cookie', `${COOKIE_NAME}=; ${cookieAttrs({ maxAgeSeconds: 0 })}`);
}

export function setStateCookie(res, state) {
  res.append(
    'Set-Cookie',
    `${STATE_COOKIE_NAME}=${state}; Path=${config.publicBasePath}/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  );
}

export function readState(req) {
  return parseCookies(req.headers.cookie)[STATE_COOKIE_NAME];
}

export function clearStateCookie(res) {
  res.append(
    'Set-Cookie',
    `${STATE_COOKIE_NAME}=; Path=${config.publicBasePath}/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}

export function getSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  return verifySessionCookieValue(cookies[COOKIE_NAME]);
}

export function requireAuth(req, res, next) {
  const session = getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'not_authenticated' });
  req.user = session;
  next();
}
