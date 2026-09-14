import './setupEnv.js';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  subnetForUser,
  gatewayForUser,
  proxyIpForUser,
  userIpForUser,
  containerNameForUser,
  volumeNameForUser,
  networkNameForUser,
} from '../docker.js';

test('subnetForUser addresses each user their own /24', () => {
  assert.equal(subnetForUser(1), '10.77.1.0/24');
  assert.equal(subnetForUser(250), '10.77.250.0/24');
  assert.equal(subnetForUser(42), '10.77.42.0/24');
});

test('gatewayForUser / proxyIpForUser / userIpForUser use distinct fixed host bits within a user\'s /24', () => {
  const userId = 17;
  assert.equal(gatewayForUser(userId), '10.77.17.1');
  assert.equal(proxyIpForUser(userId), '10.77.17.2');
  assert.equal(userIpForUser(userId), '10.77.17.10');

  // Every address must fall inside that user's own subnet.
  const subnet = subnetForUser(userId);
  const subnetPrefix = subnet.split('/')[0].replace(/\.0$/, '');
  for (const addr of [gatewayForUser(userId), proxyIpForUser(userId), userIpForUser(userId)]) {
    assert.ok(addr.startsWith(`${subnetPrefix}.`), `${addr} should be inside ${subnet}`);
  }
});

test('addresses for two different users never collide', () => {
  const a = 5;
  const b = 6;
  assert.notEqual(subnetForUser(a), subnetForUser(b));
  assert.notEqual(gatewayForUser(a), gatewayForUser(b));
  assert.notEqual(proxyIpForUser(a), proxyIpForUser(b));
  assert.notEqual(userIpForUser(a), userIpForUser(b));
  assert.notEqual(containerNameForUser(a), containerNameForUser(b));
  assert.notEqual(volumeNameForUser(a), volumeNameForUser(b));
  assert.notEqual(networkNameForUser(a), networkNameForUser(b));
});

test('containerNameForUser / volumeNameForUser / networkNameForUser naming', () => {
  assert.equal(containerNameForUser(3), 'ccaas-user-3');
  assert.equal(volumeNameForUser(3), 'ccaas-vol-3');
  assert.equal(networkNameForUser(3), 'ccaas-net-user-3');
});

// assertUserIdInRange isn't exported directly, but subnetForUser calls it
// as its first line, so it's exercised through that public entry point.
test('subnetForUser (via assertUserIdInRange) rejects out-of-range user ids', () => {
  for (const bad of [0, 251, -1, -100, 1000]) {
    assert.throws(() => subnetForUser(bad), /out of range/, `expected userId=${bad} to be rejected`);
  }
});

test('subnetForUser (via assertUserIdInRange) accepts the boundary values 1 and 250', () => {
  assert.doesNotThrow(() => subnetForUser(1));
  assert.doesNotThrow(() => subnetForUser(250));
});
