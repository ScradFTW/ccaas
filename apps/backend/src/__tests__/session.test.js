import './setupEnv.js';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { createSessionCookieValue, verifySessionCookieValue } from '../session.js';
import { findOrCreateUser, bumpSessionVersion } from '../db.js';

let nextSub = 0;
function makeUser() {
  nextSub += 1;
  return findOrCreateUser({ sub: `test-sub-${nextSub}`, email: `user${nextSub}@example.com` });
}

test('createSessionCookieValue / verifySessionCookieValue round-trip', () => {
  const user = makeUser();
  const value = createSessionCookieValue({ uid: user.id, email: user.email });
  assert.equal(typeof value, 'string');
  assert.match(value, /^[^.]+\.[^.]+$/);

  const verified = verifySessionCookieValue(value);
  assert.ok(verified);
  assert.equal(verified.uid, user.id);
  assert.equal(verified.email, user.email);
  assert.equal(verified.sv, 0);
});

test('verifySessionCookieValue rejects a tampered signature', () => {
  const user = makeUser();
  const value = createSessionCookieValue({ uid: user.id });
  const [payload, sig] = value.split('.');

  // Flip the signature's first character (wrapping so it's guaranteed to
  // actually change) so it no longer matches the payload's real HMAC.
  const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
  const tampered = `${payload}.${flipped}`;

  assert.equal(verifySessionCookieValue(tampered), null);
});

test('verifySessionCookieValue rejects a tampered payload', () => {
  const user = makeUser();
  const value = createSessionCookieValue({ uid: user.id });
  const [payload, sig] = value.split('.');

  const tamperedPayload = Buffer.from(JSON.stringify({ uid: 99999999, sv: 0, iat: Date.now() })).toString(
    'base64url'
  );
  assert.equal(verifySessionCookieValue(`${tamperedPayload}.${sig}`), null);
});

// Regression test: a malformed/short signature used to crash the process
// (crypto.timingSafeEqual throws a RangeError when its two buffers have
// different lengths). verifySessionCookieValue must handle this by
// returning null, never by throwing.
test('verifySessionCookieValue handles malformed/short signatures without crashing', () => {
  const user = makeUser();
  const value = createSessionCookieValue({ uid: user.id });
  const [payload] = value.split('.');

  const malformedValues = [
    '',
    null,
    undefined,
    'no-dot-at-all',
    `${payload}.`,
    `.onlysig`,
    `${payload}.YQ`, // valid base64url, decodes to a 1-byte buffer (far shorter than a 32-byte HMAC-SHA256 digest)
    `${payload}.${'A'.repeat(500)}`, // implausibly long signature
    `${payload}.!!!not-base64!!!`,
  ];

  for (const bad of malformedValues) {
    assert.doesNotThrow(() => verifySessionCookieValue(bad), `should not throw for: ${JSON.stringify(bad)}`);
    assert.equal(verifySessionCookieValue(bad), null, `should reject: ${JSON.stringify(bad)}`);
  }
});

test('verifySessionCookieValue rejects an expired cookie', () => {
  const user = makeUser();
  const realNow = Date.now;
  const THIRTY_ONE_DAYS_AGO = realNow() - 31 * 24 * 60 * 60 * 1000;

  let value;
  Date.now = () => THIRTY_ONE_DAYS_AGO;
  try {
    value = createSessionCookieValue({ uid: user.id });
  } finally {
    Date.now = realNow;
  }

  assert.equal(verifySessionCookieValue(value), null);
});

test('verifySessionCookieValue rejects a cookie issued before a session_version bump (revocation)', () => {
  const user = makeUser();
  const value = createSessionCookieValue({ uid: user.id });

  // Sanity check: the cookie is valid before the bump.
  assert.ok(verifySessionCookieValue(value));

  bumpSessionVersion(user.id);

  assert.equal(verifySessionCookieValue(value), null);

  // A freshly-issued cookie after the bump should work again.
  const freshValue = createSessionCookieValue({ uid: user.id });
  const verified = verifySessionCookieValue(freshValue);
  assert.ok(verified);
  assert.equal(verified.sv, 1);
});

test('verifySessionCookieValue rejects garbage that is not even a real HMAC pair', () => {
  // A payload/sig pair that was never produced by sign() at all -- confirms
  // the signature check, not just JSON.parse, is what rejects this.
  const fakePayload = Buffer.from(JSON.stringify({ uid: 1, sv: 0, iat: Date.now() })).toString('base64url');
  const fakeSig = crypto.randomBytes(32).toString('base64url');
  assert.equal(verifySessionCookieValue(`${fakePayload}.${fakeSig}`), null);
});
