'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pm25ToAqi, categorize, cleanestWindow } = require('../src/aqi');

test('pm25ToAqi matches EPA breakpoints', () => {
  assert.equal(pm25ToAqi(0), 0);
  assert.equal(pm25ToAqi(9.0), 50);
  assert.equal(pm25ToAqi(35.4), 100);
  assert.equal(pm25ToAqi(55.4), 150);
  assert.equal(pm25ToAqi(125.4), 200);
  assert.equal(pm25ToAqi(225.4), 300);
  assert.equal(pm25ToAqi(1000), 500);
});

test('pm25ToAqi rejects invalid input', () => {
  assert.throws(() => pm25ToAqi(-1), RangeError);
  assert.throws(() => pm25ToAqi(NaN), RangeError);
});

test('categorize returns correct bands', () => {
  assert.equal(categorize(10).key, 'good');
  assert.equal(categorize(75).key, 'moderate');
  assert.equal(categorize(120).key, 'usg');
  assert.equal(categorize(180).key, 'unhealthy');
  assert.equal(categorize(250).key, 'very_unhealthy');
  assert.equal(categorize(450).key, 'hazardous');
  assert.throws(() => categorize(-5), RangeError);
});

test('cleanestWindow finds the lowest average window', () => {
  const hourly = [300, 280, 150, 120, 200, 310].map((aqi, i) => ({ time: `2026-11-24T${String(i).padStart(2, '0')}:00`, aqi }));
  const w = cleanestWindow(hourly, 2);
  assert.equal(w.start, '2026-11-24T02:00');
  assert.equal(w.end, '2026-11-24T03:00');
  assert.equal(w.avgAqi, 135);
});

test('cleanestWindow handles short/invalid input', () => {
  assert.equal(cleanestWindow([], 2), null);
  assert.equal(cleanestWindow(null, 2), null);
  assert.equal(cleanestWindow([{ time: 't', aqi: 1 }], 2), null);
});
