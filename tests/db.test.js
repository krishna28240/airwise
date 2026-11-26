'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../src/app');
const { openDb } = require('../src/db');

const fakeAir = async (city) => ({
  place: `${city}, India`, aqi: 220, pm25: 150, pm10: 260, source: 'test',
  hourly: [230, 210, 120, 110, 200].map((aqi, i) => ({ time: `2026-11-24T1${i}:00`, aqi })),
});

test('database + history API', async (t) => {
  const db = openDb(':memory:');
  const server = createServer({ db, getAirQuality: fakeAir, briefing: async () => null, aiEnabled: () => false });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());
  const post = (city) => fetch(`${base}/api/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city, adults: 2 }) }).then((r) => r.json());

  const a = await post('Delhi');
  await post('Pune');
  assert.ok(Number.isInteger(a.id));

  await t.test('lists newest first', async () => {
    const { plans } = await (await fetch(`${base}/api/history`)).json();
    assert.equal(plans.length, 2);
    assert.match(plans[0].place, /Pune/);
    assert.equal(plans[0].aqi, 220);
  });

  await t.test('fetches a saved plan with profile', async () => {
    const p = await (await fetch(`${base}/api/history/${a.id}`)).json();
    assert.match(p.place, /Delhi/);
    assert.equal(p.profile.adults, 2);
    assert.ok(Array.isArray(p.plan.sections));
  });

  await t.test('stats aggregate', async () => {
    const s = await (await fetch(`${base}/api/stats`)).json();
    assert.equal(s.total, 2); assert.equal(s.places, 2); assert.equal(s.avgAqi, 220);
  });

  await t.test('delete one, 404 after, then clear all', async () => {
    assert.equal((await fetch(`${base}/api/history/${a.id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await fetch(`${base}/api/history/${a.id}`)).status, 404);
    const c = await (await fetch(`${base}/api/history`, { method: 'DELETE' })).json();
    assert.equal(c.deleted, 1);
  });
});

test('city comparison API', async (t) => {
  const aqis = { Delhi: 300, Pune: 90, Mumbai: 140 };
  const server = createServer({
    db: openDb(':memory:'), briefing: async () => null, aiEnabled: () => false,
    getAirQuality: async (c) => { if (!aqis[c]) throw new Error('nope'); return { place: c, aqi: aqis[c], hourly: [{ time: 't1', aqi: aqis[c] }, { time: 't2', aqi: aqis[c] - 20 }] }; },
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());

  await t.test('ranks cleanest first, reports unknown cities last', async () => {
    const r = await (await fetch(`${base}/api/compare?cities=Delhi,Pune,Atlantis,Mumbai`)).json();
    assert.deepEqual(r.results.map((x) => x.query), ['Pune', 'Mumbai', 'Delhi', 'Atlantis']);
    assert.equal(r.results[0].category, 'Moderate');
    assert.equal(r.results[0].cleanestHour.aqi, 70);
    assert.equal(r.results[3].error, 'Not found');
  });

  await t.test('needs at least two cities', async () => {
    assert.equal((await fetch(`${base}/api/compare?cities=Delhi`)).status, 400);
  });
});
