'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TTLCache } = require('../src/cache');
const { RateLimiter, clientIp } = require('../src/security');

test('TTLCache stores, expires and evicts', async () => {
  const c = new TTLCache({ ttlMs: 20, max: 2 });
  c.set('a', 1); c.set('b', 2); c.set('c', 3);
  assert.equal(c.get('a'), undefined, 'oldest evicted');
  assert.equal(c.get('c'), 3);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(c.get('c'), undefined, 'expired');
});

test('RateLimiter blocks after max within window and resets', () => {
  const rl = new RateLimiter({ windowMs: 1000, max: 2 });
  assert.ok(rl.allow('ip', 0));
  assert.ok(rl.allow('ip', 10));
  assert.ok(!rl.allow('ip', 20));
  assert.ok(rl.allow('ip', 1500));
});

test('clientIp ignores x-forwarded-for unless a proxy is trusted', () => {
  const req = { headers: { 'x-forwarded-for': '6.6.6.6, 5.6.7.8' }, socket: { remoteAddress: '9.9.9.9' } };
  assert.equal(clientIp(req, false), '9.9.9.9', 'spoofable header must not be trusted by default');
});

test('clientIp uses the proxy-appended (right-most) hop when trusted', () => {
  const req = { headers: { 'x-forwarded-for': '6.6.6.6, 5.6.7.8' }, socket: { remoteAddress: '10.0.0.1' } };
  assert.equal(clientIp(req, true), '5.6.7.8', 'client-supplied left-most value is ignored');
  assert.equal(clientIp({ headers: {}, socket: { remoteAddress: '9.9.9.9' } }, true), '9.9.9.9');
});
