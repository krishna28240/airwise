'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const airdata = require('../src/airdata');
const gemini = require('../src/gemini');
const { buildPlan } = require('../src/planner');
const { validateProfile } = require('../src/validate');

const jsonRes = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

test('getAirQuality geocodes, parses and caches', async () => {
  airdata._cache.clear();
  let calls = 0;
  const fakeFetch = async (url) => {
    calls += 1;
    if (url.includes('geocoding')) return jsonRes({ results: [{ name: 'Delhi', country: 'India', latitude: 28.6, longitude: 77.2, timezone: 'Asia/Kolkata' }] });
    return jsonRes({
      current: { time: '2026-11-24T20:00', us_aqi: 312.4, pm2_5: 240.1, pm10: 380 },
      hourly: { time: ['2026-11-24T19:00', '2026-11-24T20:00', '2026-11-24T21:00'], us_aqi: [300, 312, 290] },
    });
  };
  const r = await airdata.getAirQuality('Delhi', fakeFetch);
  assert.equal(r.aqi, 312);
  assert.equal(r.place, 'Delhi, India');
  assert.equal(r.hourly.length, 2, 'past hours dropped');
  await airdata.getAirQuality('delhi', fakeFetch);
  assert.equal(calls, 2, 'second call served from cache');
});

test('getAirQuality reports unknown city as 404', async () => {
  airdata._cache.clear();
  await assert.rejects(airdata.getAirQuality('Zzzz', async () => jsonRes({})), (e) => e.status === 404);
});

test('gemini falls back cleanly without an API key', async () => {
  delete process.env.GEMINI_API_KEY;
  const profile = validateProfile({ city: 'Delhi' });
  const plan = buildPlan({ aqi: 200, hourly: [] }, profile);
  assert.equal(await gemini.briefing(plan, profile, 'Delhi'), null);
  const a = await gemini.answer('hi there', plan, profile, 'Delhi');
  assert.equal(a.ai, false);
});

test('gemini sends key in header, parses text and handles errors', async () => {
  process.env.GEMINI_API_KEY = 'test-key';
  gemini._cache.clear();
  const profile = validateProfile({ city: 'Delhi', language: 'hi' });
  const plan = buildPlan({ aqi: 200, hourly: [] }, profile);
  let seen;
  const ok = async (url, opts) => { seen = { url, opts }; return jsonRes({ candidates: [{ content: { parts: [{ text: 'नमस्ते' }] } }] }); };
  assert.equal(await gemini.briefing(plan, profile, 'Delhi', ok), 'नमस्ते');
  assert.ok(!seen.url.includes('test-key'), 'key not in URL');
  assert.equal(seen.opts.headers['x-goog-api-key'], 'test-key');
  assert.match(JSON.parse(seen.opts.body).contents[0].parts[0].text, /Hindi/);

  const bad = async () => jsonRes({}, false, 500);
  const a = await gemini.answer('Is it safe?', plan, profile, 'Delhi', bad);
  assert.equal(a.ai, false);
  delete process.env.GEMINI_API_KEY;
});

test('getAirQuality accepts coordinates without geocoding', async () => {
  airdata._cache.clear();
  const urls = [];
  const fakeFetch = async (url) => {
    urls.push(url);
    return jsonRes({ current: { time: '2026-11-24T10:00', pm2_5: 60 }, hourly: { time: [], us_aqi: [] } });
  };
  const r = await airdata.getAirQuality({ lat: 19.07, lon: 72.88 }, fakeFetch);
  assert.equal(urls.length, 1);
  assert.ok(!urls[0].includes('geocoding'));
  assert.equal(r.place, 'Your location');
  assert.equal(r.aqi, 154, 'AQI derived from PM2.5 when us_aqi missing');
});

test('gemini retries once on 503 then succeeds', async () => {
  process.env.GEMINI_API_KEY = 'k';
  const profile = validateProfile({ city: 'Pune' });
  const plan = buildPlan({ aqi: 180, hourly: [] }, profile);
  let n = 0;
  const flaky = async () => {
    n += 1;
    return n === 1 ? jsonRes({}, false, 503) : jsonRes({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
  };
  const a = await gemini.answer('Masks for kids?', plan, profile, 'Pune', flaky);
  assert.equal(a.text, 'ok');
  assert.equal(n, 2);

  let m = 0;
  const forbidden = async () => { m += 1; return jsonRes({}, false, 403); };
  assert.equal((await gemini.answer('Masks?', plan, profile, 'Pune', forbidden)).ai, false);
  assert.equal(m, 1, 'no retry on 4xx');
  delete process.env.GEMINI_API_KEY;
});
