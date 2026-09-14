import './setupEnv.js';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateSlug, validateSourceDir } from '../sites.js';

test('validateSlug accepts valid slugs', () => {
  for (const slug of ['my-site', 'portfolio', 'abc123', 'a1-b2-c3', 'x-y']) {
    assert.equal(validateSlug(slug), slug);
  }
});

test('validateSlug rejects reserved slugs', () => {
  for (const slug of ['ccaas', 'api', 'auth', 'ws', 'sites', 'assets', 'status']) {
    assert.throws(() => validateSlug(slug), /reserved_slug/);
  }
});

test('validateSlug rejects invalid characters / shapes', () => {
  const invalid = [
    'a', // too short (regex requires at least 2 chars)
    'Abc-Def', // uppercase not allowed
    'foo_bar', // underscore not allowed
    'foo.bar', // dot not allowed
    '-abc', // must start with alnum, not '-'
    'abc def', // space not allowed
    '', // empty
    'a'.repeat(32), // too long (max 31 chars)
  ];
  for (const slug of invalid) {
    assert.throws(() => validateSlug(slug), /invalid_slug/, `expected "${slug}" to be rejected`);
  }
});

test('validateSourceDir accepts valid relative paths', () => {
  assert.equal(validateSourceDir('foo'), 'foo');
  assert.equal(validateSourceDir('foo/bar'), 'foo/bar');
  assert.equal(validateSourceDir('foo/bar/baz.txt'), 'foo/bar/baz.txt');
  assert.equal(validateSourceDir('my_dir-1/sub.dir'), 'my_dir-1/sub.dir');
});

test('validateSourceDir strips leading/trailing slashes', () => {
  assert.equal(validateSourceDir('/foo/bar/'), 'foo/bar');
  assert.equal(validateSourceDir('///foo///'), 'foo');
});

// Regression test for a real path-traversal bug: SAFE_PATH_RE alone allows
// "." as a character, so a segment of exactly ".." still matches the
// overall regex. validateSourceDir must reject "." / ".." segments
// individually, not just rely on the regex.
test('validateSourceDir rejects path traversal attempts', () => {
  const traversalAttempts = [
    '..',
    '../',
    '../../etc',
    '../../etc/passwd',
    'foo/../../bar',
    'foo/..',
    './foo',
    'foo/./bar',
    '../',
  ];
  for (const attempt of traversalAttempts) {
    assert.throws(
      () => validateSourceDir(attempt),
      /invalid_source_dir/,
      `expected "${attempt}" to be rejected as traversal`
    );
  }
});

test('validateSourceDir rejects empty / unsafe-character paths', () => {
  const invalid = ['', '/', 'foo bar', 'foo;rm -rf', 'foo\nbar', 'foo$(bar)'];
  for (const attempt of invalid) {
    assert.throws(() => validateSourceDir(attempt), /invalid_source_dir/, `expected "${JSON.stringify(attempt)}" to be rejected`);
  }
});
