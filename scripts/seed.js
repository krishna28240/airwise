'use strict';

/**
 * Demo data seeder: fills the database with realistic plans for several Indian cities
 * spread over the last 14 days, so the Insights dashboard has meaningful data.
 *
 *   npm run seed            # add demo plans
 *   npm run seed -- --reset # wipe history first
 */

const { openDb } = require('../src/db');
const { buildPlan } = require('../src/planner');
const { estimateHourly } = require('../src/routine');
const { validateProfile } = require('../src/validate');

// [city, typical winter AQI]
const CITIES = [
  ['Delhi, India', 285], ['Noida, India', 260], ['Lucknow, India', 210], ['Kolkata, India', 165],
  ['Mumbai, India', 140], ['Pune, India', 105], ['Bengaluru, India', 62], ['Chennai, India', 78],
];
const PROFILES = [
  { adults: 2, children: 1, elderly: 0, conditions: ['asthma'], activities: ['school_run', 'outdoor_play'], commute: 'two_wheeler', commuteKm: 9, home: 'near_main_road' },
  { adults: 2, children: 0, elderly: 2, conditions: ['copd', 'heart_disease'], activities: ['morning_walk', 'yoga'], commute: 'car', commuteKm: 14, home: 'apartment', hasPurifier: true },
  { adults: 1, children: 2, elderly: 0, conditions: [], activities: ['outdoor_sports', 'market_errands'], commute: 'metro', commuteKm: 11, home: 'independent_house' },
  { adults: 2, children: 0, elderly: 0, conditions: ['pregnancy'], activities: ['morning_walk'], commute: 'bus', commuteKm: 6, home: 'apartment', cooking: 'induction' },
];

// Deterministic pseudo-random so the demo looks the same every time.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const reset = process.argv.includes('--reset');
const db = openDb();
if (reset) console.log(`Cleared ${db.clearPlans()} existing plans.`);

const DAYS = 14;
const PER_DAY = 3;
const COUNT = DAYS * PER_DAY;
const now = Date.now();
for (let i = 0; i < COUNT; i++) {
  const day = Math.floor(i / PER_DAY);             // 0 = oldest
  const daysAgo = DAYS - 1 - day;
  const [place, base] = CITIES[(i * 3) % CITIES.length]; // rotate so every city appears
  // A smog episode that builds mid-period, eases, then returns – plus small noise.
  const episode = 1 + 0.35 * Math.sin((day / (DAYS - 1)) * Math.PI * 1.6);
  const aqi = Math.max(25, Math.min(420, Math.round(base * episode * (0.9 + rand() * 0.2))));
  const when = new Date(now - daysAgo * 86400000 - (2 + (i % PER_DAY) * 4) * 3600000);
  const hour = when.getHours();
  const date = when.toISOString().slice(0, 10);

  const profile = validateProfile({ city: place.split(',')[0], aqi, localHour: hour, language: 'en', ...PROFILES[i % PROFILES.length] });
  const air = { place, aqi, hourly: estimateHourly(aqi, hour, date), source: 'Demo data (seeded)' };
  const plan = buildPlan(air, profile);
  const result = { place, source: air.source, pm25: Math.round(aqi * 0.55), pm10: Math.round(aqi * 0.85), hourly: air.hourly, plan, briefing: null, ai: false };
  db.savePlan(result, profile, when.toISOString().slice(0, 19).replace('T', ' '));
}

const s = db.stats();
console.log(`Seeded ${COUNT} plans → total ${s.total}, avg AQI ${s.avgAqi}, worst ${s.maxAqi}, ${s.places} locations.`);
db.close();
