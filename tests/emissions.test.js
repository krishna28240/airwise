'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compareCommute, weeklyCo2 } = require('../src/emissions');

test('weeklyCo2 = factor × km × 2 trips × 5 days', () => {
  assert.equal(weeklyCo2('car', 10), 17);
  assert.equal(weeklyCo2('walk', 3), 0);
  assert.throws(() => weeklyCo2('plane', 5), RangeError);
});

test('car commuter sees metro as best for exposure and CO2', () => {
  const c = compareCommute('car', 12);
  assert.equal(c.current.weeklyKgCo2, 20.4);
  assert.equal(c.alternatives[0].mode, 'metro');
  assert.ok(c.alternatives[0].savedKgCo2 > 0);
  assert.ok(c.alternatives[0].exposureChangePct < 0);
  assert.ok(!c.alternatives.some((a) => a.mode === 'walk'), 'walking hidden for long trips');
  assert.ok(!c.alternatives.some((a) => a.mode === 'cycle'), 'cycling hidden beyond 10 km');
});

test('two-wheeler commuter is shown lower-exposure options', () => {
  const c = compareCommute('two_wheeler', 2);
  assert.ok(c.alternatives.some((a) => a.mode === 'walk'));
  assert.ok(c.alternatives.every((a) => a.savedKgCo2 > 0 || a.exposureChangePct < 0));
});

test('no comparison for WFH, zero distance or unknown mode', () => {
  assert.equal(compareCommute('work_from_home', 10), null);
  assert.equal(compareCommute('car', 0), null);
  assert.equal(compareCommute('rocket', 5), null);
});
