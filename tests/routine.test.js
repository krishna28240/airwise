'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRoutine, estimateHourly, WINTER_PATTERN } = require('../src/routine');
const { validateProfile } = require('../src/validate');

const profile = (extra = {}) => validateProfile({ city: 'Delhi', ...extra });
const day = (values, startHour = 6) =>
  values.map((aqi, i) => ({ time: `2026-11-24T${String(startHour + i).padStart(2, '0')}:00`, aqi }));

test('winter pattern has 24 hours with afternoon minimum', () => {
  assert.equal(WINTER_PATTERN.length, 24);
  const min = Math.min(...WINTER_PATTERN);
  assert.equal(WINTER_PATTERN.indexOf(min), 13);
});

test('estimateHourly anchors the current hour to the measured AQI and rolls over midnight', () => {
  const h = estimateHourly(300, 20, '2026-11-24');
  assert.equal(h.length, 24);
  assert.equal(h[0].aqi, 300);
  assert.equal(h[0].time, '2026-11-24T20:00');
  assert.equal(h[4].time, '2026-11-25T00:00');
  assert.ok(h.every((x) => x.estimated));
  const afternoon = h.find((x) => x.time.endsWith('T13:00'));
  assert.ok(afternoon.aqi < 300);
});

test('routine includes ventilation, peak warning and bedtime purifier', () => {
  const steps = buildRoutine(day([320, 310, 300, 250, 200, 160, 140, 150, 210, 280, 320, 340, 350, 360, 330]), profile({ hasPurifier: true }));
  const kinds = steps.map((s) => s.kind);
  assert.ok(kinds.includes('ventilate'));
  assert.ok(kinds.includes('protect'));
  assert.ok(steps.some((s) => /purifier on high/.test(s.action)));
  const times = steps.map((s) => s.time);
  assert.deepEqual(times, [...times].sort(), 'sorted chronologically');
});

test('routine adapts morning walk and kids play to the forecast', () => {
  const clean = buildRoutine(day([60, 55, 50, 45, 40, 40, 45, 50]), profile({ children: 1, activities: ['morning_walk'] }));
  assert.ok(clean.some((s) => /short outdoor walk is OK/.test(s.action)));
  assert.ok(clean.some((s) => /outdoor play for children/.test(s.action)));
  assert.ok(!clean.some((s) => s.kind === 'protect'));

  const smoggy = buildRoutine(day([300, 290, 280, 270, 260]), profile({ activities: ['yoga'] }));
  assert.ok(smoggy.some((s) => /walk\/yoga indoors/.test(s.action)));
  assert.ok(smoggy.some((s) => /DIY box-fan/.test(s.action)));
});

test('routine handles missing data', () => {
  assert.deepEqual(buildRoutine([], profile()), []);
  assert.deepEqual(buildRoutine(null, profile()), []);
});

test('steps after midnight are labelled as tomorrow', () => {
  const steps = buildRoutine(estimateHourly(300, 20, '2026-11-24'), profile({ activities: ['morning_walk'] }));
  const morning = steps.find((s) => /Morning AQI/.test(s.action));
  assert.ok(morning.tomorrow);
  assert.match(morning.label, /^Tomorrow 7 AM/);
  assert.ok(!steps.find((s) => s.label === '9 PM').tomorrow);
});
