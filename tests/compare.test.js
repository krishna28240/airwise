'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCities, compareCities, cleanestHour } = require('../src/compare');

test('parseCities trims, de-duplicates and caps at 4', () => {
  assert.deepEqual(parseCities(' Delhi , Pune,Delhi,,Mumbai,Goa,Agra'), ['Delhi', 'Pune', 'Mumbai', 'Goa']);
});

test('parseCities requires at least two cities', () => {
  assert.throws(() => parseCities('Delhi'), /at least two/);
  assert.throws(() => parseCities(null), /at least two/);
});

test('cleanestHour picks the lowest AQI hour', () => {
  assert.deepEqual(cleanestHour([{ time: 'a', aqi: 90 }, { time: 'b', aqi: 40 }, { time: 'c', aqi: 60 }]), { time: 'b', aqi: 40 });
  assert.equal(cleanestHour([]), null);
  assert.equal(cleanestHour(), null);
});

test('compareCities ranks cleanest first and puts failures last', async () => {
  const data = { A: 250, B: 40 };
  const get = async (c) => { if (!(c in data)) throw new Error('nope'); return { place: c, aqi: data[c] }; };
  const r = await compareCities(['A', 'X', 'B'], get);
  assert.deepEqual(r.map((x) => x.query), ['B', 'A', 'X']);
  assert.equal(r[0].category, 'Good');
  assert.equal(r[2].error, 'Not found');
});
