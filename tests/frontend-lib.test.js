'use strict';

/** Unit tests for the browser's pure helper module (public/js/lib.mjs). */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'public', 'js', 'lib.mjs')).href);

test('aqiColor and shortCategory map AQI bands', async () => {
  const { aqiColor, shortCategory } = await load();
  assert.equal(aqiColor(0), '#2e7d32');
  assert.equal(aqiColor(50), '#2e7d32');
  assert.equal(aqiColor(51), '#8a6d00');
  assert.equal(aqiColor(201), '#7e22ce');
  assert.equal(aqiColor(450), '#7f1d1d');
  assert.equal(shortCategory('Unhealthy for Sensitive Groups'), 'Sensitive groups');
  assert.equal(shortCategory('Something else'), 'Something else');
});

test('hourLabel and toDate format time values', async () => {
  const { hourLabel, toDate } = await load();
  assert.equal(hourLabel('2026-11-24T00:00'), '12a');
  assert.equal(hourLabel('2026-11-24T13:00'), '1p');
  assert.equal(toDate('2026-11-24 10:30:00').toISOString(), '2026-11-24T10:30:00.000Z');
});

test('validateProfileInput mirrors server rules', async () => {
  const { validateProfileInput: v } = await load();
  assert.match(v({ adults: 1 }), /city/);
  assert.match(v({ city: 'Delhi', adults: 0, children: 0, elderly: 0 }), /family member/);
  assert.match(v({ city: 'Delhi', adults: 1, aqi: 1000 }), /0 to 999/);
  assert.match(v({ city: 'Delhi', adults: 1, commuteKm: 2.5 }), /0–100/);
  assert.equal(v({ city: 'Delhi', adults: 2 }), '');
  assert.equal(v({ lat: 28.6, lon: 77.2, children: 1 }), '');
});

test('parseRich turns Gemini markdown into safe blocks', async () => {
  const { parseRich } = await load();
  const blocks = parseRich('## Hello **Delhi**\n\n* **Asthma:** keep inhaler\n- stay in\n1. open windows at 2 PM\n\nBye');
  assert.deepEqual(blocks.map((b) => b.type), ['p', 'ul', 'p']);
  assert.deepEqual(blocks[0].items[0], [{ bold: false, text: 'Hello ' }, { bold: true, text: 'Delhi' }]);
  assert.equal(blocks[1].items.length, 3);
  assert.deepEqual(blocks[1].items[0][0], { bold: true, text: 'Asthma:' });
  assert.deepEqual(parseRich(null), []);
  // HTML stays plain text: it is only ever inserted via text nodes.
  assert.equal(parseRich('<img src=x onerror=alert(1)>')[0].items[0][0].text, '<img src=x onerror=alert(1)>');
});

test('planAsText and historyToCsv produce shareable output', async () => {
  const { planAsText, historyToCsv } = await load();
  const text = planAsText({
    place: 'Delhi',
    plan: { aqi: 210, category: { label: 'Very Unhealthy' }, headline: 'Stay in', routine: [{ label: '7 AM', action: 'Walk indoors' }], sections: [{ title: 'Masks', items: ['N95'] }] },
  });
  assert.match(text, /AQI 210 \(Very Unhealthy\)/);
  assert.match(text, /• 7 AM: Walk indoors/);
  assert.match(text, /MASKS\n- N95/);
  const csv = historyToCsv([{ id: 1, createdAt: '2026-11-24 10:00:00', place: 'Delhi, "NCR"', aqi: 200, category: 'Unhealthy', riskLevel: 4, ai: true }]);
  assert.equal(csv.split('\n')[1], '1,2026-11-24 10:00:00,"Delhi, ""NCR""",200,"Unhealthy",4,true');
});

test('trendSeries averages by day when history spans 3+ days', async () => {
  const { trendSeries } = await load();
  const plans = [
    { createdAt: '2026-11-24 10:00:00', aqi: 100, place: 'Delhi, India' },
    { createdAt: '2026-11-24 09:00:00', aqi: 200, place: 'Pune, India' },
    { createdAt: '2026-11-23 10:00:00', aqi: 80, place: 'Pune, India' },
    { createdAt: '2026-11-22 10:00:00', aqi: 60, place: 'Goa, India' },
  ];
  const daily = trendSeries(plans);
  assert.equal(daily.daily, true);
  assert.deepEqual(daily.points.map((p) => p.aqi), [60, 80, 150]);
  assert.deepEqual(daily.points[2].places.sort(), ['Delhi', 'Pune']);
  const perPlan = trendSeries(plans.slice(0, 2));
  assert.equal(perPlan.daily, false);
  assert.deepEqual(perPlan.points.map((p) => p.aqi), [200, 100], 'oldest first');
});

test('niceAxis and smoothPath build chart geometry', async () => {
  const { niceAxis, smoothPath } = await load();
  assert.deepEqual(niceAxis(40), { top: 100, step: 50 });
  assert.deepEqual(niceAxis(260), { top: 300, step: 50 });
  assert.deepEqual(niceAxis(365), { top: 400, step: 100 });
  assert.equal(smoothPath([]), '');
  const d = smoothPath([[0, 0], [10, 10], [20, 0]]);
  assert.match(d, /^M0\.0,0\.0C/);
  assert.equal((d.match(/C/g) || []).length, 2);
  assert.match(d, /20\.0,0\.0$/);
});
