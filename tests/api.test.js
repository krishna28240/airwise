'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../src/app');
const { RateLimiter } = require('../src/security');

const fakeAir = async (city) => ({
  place: `${city}, India`, aqi: 260, pm25: 180, pm10: 300, source: 'test',
  hourly: [270, 250, 140, 130, 240].map((aqi, i) => ({ time: `2026-11-24T1${i}:00`, aqi })),
});

function start(overrides = {}) {
  const server = createServer({
    getAirQuality: fakeAir,
    briefing: async () => 'AI briefing text',
    answer: async (q) => ({ text: `Answer to: ${q}`, ai: true }),
    aiEnabled: () => true,
    ...overrides,
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

const post = (base, path, body, headers = { 'Content-Type': 'application/json' }) =>
  fetch(base + path, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('API end-to-end', async (t) => {
  const { server, base } = await start();
  t.after(() => server.close());

  await t.test('health reports AI status and sets security headers', async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    const h = await res.json(); assert.equal(h.status, 'ok'); assert.equal(h.ai, true);
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });

  await t.test('plan with live city data', async () => {
    const res = await post(base, '/api/plan', { city: 'Delhi', children: 1, conditions: ['asthma'] });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.place, 'Delhi, India');
    assert.equal(data.plan.category.key, 'very_unhealthy');
    assert.equal(data.plan.cleanestWindow.start, '2026-11-24T12:00');
    assert.equal(data.briefing, 'AI briefing text');
    assert.ok(data.plan.sections.length >= 4);
  });

  await t.test('plan with manual AQI skips network lookup', async () => {
    const res = await post(base, '/api/plan', { aqi: 40 });
    const data = await res.json();
    assert.match(data.source, /Manual entry/);
    assert.equal(data.hourly.length, 24);
    assert.ok(data.plan.forecastEstimated);
    assert.equal(data.plan.category.key, 'good');
  });

  await t.test('rejects bad input with 400/413/415', async () => {
    assert.equal((await post(base, '/api/plan', { city: 'X', commute: 'jet' })).status, 400);
    assert.equal((await post(base, '/api/plan', '{bad json')).status, 400);
    assert.equal((await post(base, '/api/plan', { city: 'x' }, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await post(base, '/api/plan', { city: 'a'.repeat(20000) })).status, 413);
  });

  await t.test('chat answers grounded questions', async () => {
    const res = await post(base, '/api/chat', { question: 'When to open windows?', profile: { city: 'Delhi' } });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).text, 'Answer to: When to open windows?');
  });

  await t.test('serves static files and blocks path traversal', async () => {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /AirWise/);
    assert.equal((await fetch(`${base}/..%2fpackage.json`)).status, 403);
    assert.equal((await fetch(`${base}/nope.txt`)).status, 404);
    assert.equal((await fetch(`${base}/api/unknown`)).status, 404);
  });
});

test('upstream failure returns friendly 500', async (t) => {
  const { server, base } = await start({ getAirQuality: async () => { throw new Error('boom'); } });
  t.after(() => server.close());
  const res = await post(base, '/api/plan', { city: 'Delhi' });
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /manually/);
});

test('rate limiting returns 429', async (t) => {
  const { server, base } = await start({ limiter: new RateLimiter({ windowMs: 60000, max: 1 }) });
  t.after(() => server.close());
  const plan = () => post(base, '/api/plan', { city: 'Delhi', adults: 1 });
  assert.equal((await plan()).status, 200);
  assert.equal((await plan()).status, 429);
  // cheap local reads stay available while limited
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/history`)).status, 200);
});

test('geolocation request is routed with rounded coords', async (t) => {
  let seen;
  const { server, base } = await start({ getAirQuality: async (w) => { seen = w; return fakeAir('Here'); } });
  t.after(() => server.close());
  const res = await post(base, '/api/plan', { lat: 28.6139, lon: 77.209 });
  assert.equal(res.status, 200);
  assert.deepEqual(seen, { lat: 28.61, lon: 77.21 });
});

test('large responses are gzip-compressed', async (t) => {
  const { server, base } = await start();
  t.after(() => server.close());
  const res = await fetch(`${base}/styles.css`, { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(res.headers.get('content-encoding'), 'gzip');
  assert.match(res.headers.get('cache-control'), /max-age/);
});
