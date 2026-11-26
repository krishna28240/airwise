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

test('clientIp prefers x-forwarded-for', () => {
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } }), '1.2.3.4');
  assert.equal(clientIp({ headers: {}, socket: { remoteAddress: '9.9.9.9' } }), '9.9.9.9');
});
