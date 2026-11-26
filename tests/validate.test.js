'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProfile, validateQuestion, cleanText, ValidationError } = require('../src/validate');

test('applies defaults for a minimal profile', () => {
  const p = validateProfile({ city: 'Delhi' });
  assert.equal(p.adults, 2);
  assert.equal(p.commute, 'bus');
  assert.deepEqual(p.conditions, []);
  assert.equal(p.hasPurifier, false);
});

test('filters unknown and duplicate list values', () => {
  const p = validateProfile({ city: 'Pune', conditions: ['asthma', 'asthma', 'evil'] });
  assert.deepEqual(p.conditions, ['asthma']);
});

test('rejects invalid enums and ranges', () => {
  assert.throws(() => validateProfile({ city: 'X', commute: 'rocket' }), ValidationError);
  assert.throws(() => validateProfile({ city: 'X', adults: 99 }), ValidationError);
  assert.throws(() => validateProfile({ city: 'X', aqi: -3 }), ValidationError);
  assert.throws(() => validateProfile({ city: 'X', adults: 1.5 }), ValidationError);
});

test('requires city or aqi and at least one member', () => {
  assert.throws(() => validateProfile({}), /city or a current AQI/);
  assert.throws(() => validateProfile({ city: 'X', adults: 0, children: 0, elderly: 0 }), /at least one/);
  assert.throws(() => validateProfile(null), ValidationError);
  assert.throws(() => validateProfile([]), ValidationError);
});

test('cleanText strips markup/control characters and clamps length', () => {
  assert.equal(cleanText('<script>alert(1)</script>'), 'script alert(1) /script');
  assert.equal(cleanText('a'.repeat(500), 10).length, 10);
  assert.throws(() => cleanText(42), ValidationError);
});

test('validateQuestion enforces length', () => {
  assert.equal(validateQuestion({ question: '  When to open windows? ' }), 'When to open windows?');
  assert.throws(() => validateQuestion({ question: 'a' }), ValidationError);
});

test('coordinates are validated and rounded to ~1 km', () => {
  const p = validateProfile({ lat: 28.61394, lon: 77.20902 });
  assert.deepEqual(p.coords, { lat: 28.61, lon: 77.21 });
  assert.throws(() => validateProfile({ lat: 200, lon: 0 }), /coordinates/);
  assert.throws(() => validateProfile({ lat: 'x', lon: 5 }), /coordinates/);
  assert.equal(validateProfile({ city: 'Pune' }).coords, null);
});

test('commute distance and local hour are bounded', () => {
  assert.equal(validateProfile({ city: 'Pune', commuteKm: 12 }).commuteKm, 12);
  assert.throws(() => validateProfile({ city: 'Pune', commuteKm: 500 }), ValidationError);
  assert.throws(() => validateProfile({ city: 'Pune', localHour: 24 }), ValidationError);
});
