'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlan, riskLevel, vulnerability, formatHour } = require('../src/planner');
const { validateProfile } = require('../src/validate');

const base = (extra = {}) => validateProfile({ city: 'Delhi', adults: 2, children: 0, ...extra });
const all = (plan) => plan.sections.flatMap((s) => s.items).join(' ');

test('vulnerability considers kids, elderly and conditions', () => {
  assert.equal(vulnerability(base()), 0);
  assert.equal(vulnerability(base({ children: 1 })), 1);
  assert.equal(vulnerability(base({ elderly: 1, conditions: ['asthma'] })), 2);
});

test('risk level is bumped for vulnerable families but not on good days', () => {
  assert.equal(riskLevel(30, base({ children: 2 })), 0);
  assert.equal(riskLevel(120, base()), 2);
  assert.equal(riskLevel(120, base({ children: 1 })), 3);
  assert.equal(riskLevel(450, base({ children: 1 })), 5);
});

test('clean air plan stays light and has no mask advice', () => {
  const plan = buildPlan({ aqi: 30, hourly: [] }, base());
  assert.equal(plan.category.key, 'good');
  assert.ok(!plan.sections.some((s) => s.id === 'mask'));
});

test('severe smog plan personalises for asthma, kids and purifier', () => {
  const profile = base({ children: 1, conditions: ['asthma'], activities: ['morning_walk', 'school_run'], hasPurifier: true, commute: 'two_wheeler' });
  const text = all(buildPlan({ aqi: 320, hourly: [] }, profile));
  assert.match(text, /inhaler/i);
  assert.match(text, /child-size N95/i);
  assert.match(text, /HEPA purifier/);
  assert.match(text, /Two-wheeler/);
  assert.match(text, /morning walk/i);
});

test('suggests DIY purifier when family has none', () => {
  assert.match(all(buildPlan({ aqi: 220, hourly: [] }, base())), /Corsi-Rosenthal/);
});

test('biomass cooking and main-road homes get targeted tips', () => {
  const text = all(buildPlan({ aqi: 160, hourly: [] }, base({ cooking: 'biomass', home: 'near_main_road' })));
  assert.match(text, /Biomass/);
  assert.match(text, /road-facing windows/);
});

test('plan includes cleanest window from forecast', () => {
  const hourly = [250, 240, 90, 95, 260].map((aqi, i) => ({ time: `2026-11-24T1${i}:00`, aqi }));
  const plan = buildPlan({ aqi: 250, hourly }, base());
  assert.equal(plan.cleanestWindow.start, '2026-11-24T12:00');
  assert.match(all(plan), /12 PM–1 PM/);
});

test('formatHour converts ISO hours to 12h labels', () => {
  assert.equal(formatHour('2026-11-24T00:00'), '12 AM');
  assert.equal(formatHour('2026-11-24T13:00'), '1 PM');
  assert.equal(formatHour(''), '');
});

const { memberAdvice } = require('../src/planner');

test('memberAdvice creates a card per member group with escalating status', () => {
  const p = base({ adults: 2, children: 1, elderly: 1 });
  const severe = memberAdvice(4, p);
  assert.equal(severe.length, 3);
  assert.ok(severe.every((m) => m.status === 'stay_in'));
  const mild = memberAdvice(0, p);
  assert.ok(mild.every((m) => m.status === 'ok'));
  const asthmaAdult = memberAdvice(2, base({ adults: 1, conditions: ['asthma'] }));
  assert.equal(asthmaAdult[0].status, 'limit');
});

test('plan exposes routine, members and commute comparison', () => {
  const p = base({ commute: 'car', commuteKm: 10, children: 1 });
  const hourly = [300, 280, 200, 150, 160, 250].map((aqi, i) => ({ time: `2026-11-24T1${i}:00`, aqi }));
  const plan = buildPlan({ aqi: 300, hourly }, p);
  assert.ok(plan.routine.length > 0);
  assert.ok(plan.members.length === 2);
  assert.equal(plan.commute.current.mode, 'car');
  assert.equal(plan.forecastEstimated, false);
});
