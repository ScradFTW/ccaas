import './setupEnv.js';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeDomains } from '../squid.js';

test('sanitizeDomains keeps valid hostnames', () => {
  const input = ['example.com', 'api.anthropic.com', 'sub.sub.example.co.uk'];
  assert.deepEqual(sanitizeDomains(input), input);
});

test('sanitizeDomains lowercases and trims valid hostnames', () => {
  assert.deepEqual(sanitizeDomains(['  Example.COM  ', 'GitHub.com']), ['example.com', 'github.com']);
});

test('sanitizeDomains drops wildcard patterns', () => {
  assert.deepEqual(sanitizeDomains(['*.example.com', '*.evil.com']), []);
});

test('sanitizeDomains drops empty / whitespace-only strings', () => {
  assert.deepEqual(sanitizeDomains(['', '   ', 'example.com']), ['example.com']);
});

test('sanitizeDomains drops single-label names (no dot)', () => {
  // The hostname regex requires at least one "." group -- a bare word like
  // "localhost" doesn't match, so it's filtered out.
  assert.deepEqual(sanitizeDomains(['localhost', 'example.com']), ['example.com']);
});

test('sanitizeDomains drops strings with disallowed characters', () => {
  const bad = ['exa mple.com', 'example.com/', 'exa_mple.com', 'http://example.com', 'example.com;rm -rf'];
  assert.deepEqual(sanitizeDomains(bad), []);
});

// IPv6 literals contain ':' which the hostname regex does not allow, so
// these are correctly rejected.
test('sanitizeDomains drops IPv6 literals', () => {
  assert.deepEqual(sanitizeDomains(['::1', '2001:db8::1']), []);
});

// Documents real, possibly-surprising behavior: the hostname regex only
// checks DNS label *shape* (alnum/hyphen labels joined by dots) and has no
// concept of "this looks like an IPv4 address" -- a dotted-quad string is
// syntactically indistinguishable from a hostname made of numeric labels,
// so it passes through. Egress ACLs use squid's dstdomain match, which
// would not match traffic to that literal IP anyway, but sanitizeDomains
// itself does not filter it out.
test('sanitizeDomains does not treat dotted-quad IPv4 text as invalid', () => {
  assert.deepEqual(sanitizeDomains(['1.2.3.4', '999.999.999.999']), ['1.2.3.4', '999.999.999.999']);
});

test('sanitizeDomains returns [] for non-array input', () => {
  assert.deepEqual(sanitizeDomains(null), []);
  assert.deepEqual(sanitizeDomains(undefined), []);
  assert.deepEqual(sanitizeDomains('example.com'), []);
  assert.deepEqual(sanitizeDomains(42), []);
});

test('sanitizeDomains returns [] for an empty array', () => {
  assert.deepEqual(sanitizeDomains([]), []);
});
