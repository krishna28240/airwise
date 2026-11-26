'use strict';

/**
 * Builds an hour-by-hour "smog-day routine" for the family from the hourly
 * AQI forecast. When no forecast exists (manual AQI), it uses the typical
 * winter pattern: smog peaks overnight/early morning under temperature
 * inversions and is lowest in the early afternoon.
 */

const { cleanestWindow } = require('./aqi');
const { formatHour } = require('./time');

/** Typical winter diurnal multipliers by hour (0–23), relative to the daily mean. */
const WINTER_PATTERN = Object.freeze([
  1.25, 1.3, 1.3, 1.3, 1.28, 1.25, 1.22, 1.2, 1.15, 1.0, 0.85, 0.75,
  0.68, 0.65, 0.66, 0.72, 0.82, 0.95, 1.05, 1.12, 1.18, 1.2, 1.22, 1.24,
]);

/**
 * Estimate an hourly forecast from a single AQI reading using the winter pattern.
 * @param {number} aqi current AQI
 * @param {number} currentHour 0–23
 * @param {string} [datePrefix] e.g. '2026-11-24'
 * @returns {{time: string, aqi: number, estimated: true}[]}
 */
function estimateHourly(aqi, currentHour, datePrefix = '1970-01-01') {
  const mean = aqi / WINTER_PATTERN[currentHour];
  const out = [];
  for (let i = 0; i < 24; i += 1) {
    const h = (currentHour + i) % 24;
    const dayOffset = currentHour + i >= 24 ? 1 : 0;
    out.push({
      time: `${shiftDate(datePrefix, dayOffset)}T${String(h).padStart(2, '0')}:00`,
      aqi: Math.max(0, Math.round(mean * WINTER_PATTERN[h])),
      estimated: true,
    });
  }
  return out;
}

function shiftDate(datePrefix, days) {
  if (!days) return datePrefix;
  const d = new Date(`${datePrefix}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const hourOf = (iso) => Number(String(iso).slice(11, 13));

/**
 * Build the routine timeline.
 * @param {{time: string, aqi: number}[]} hourly next 24h
 * @param {object} profile validated profile
 * @returns {{time: string, label: string, action: string, kind: string}[]}
 */
function buildRoutine(hourly, profile) {
  if (!Array.isArray(hourly) || hourly.length < 3) return [];
  const steps = [];
  const daytime = hourly.filter((h) => hourOf(h.time) >= 7 && hourOf(h.time) <= 20);
  const pool = daytime.length >= 2 ? daytime : hourly;

  const best = cleanestWindow(pool, 2);
  const worst = pool.reduce((a, b) => (b.aqi > a.aqi ? b : a));
  const peakAqi = Math.max(...hourly.map((h) => h.aqi));

  if (best) {
    const ventilate = best.avgAqi <= 100 ? 'Open windows for 15–20 minutes' : 'Open windows for only 5–10 minutes';
    steps.push({ time: best.start, label: formatHour(best.start), kind: 'ventilate', action: `${ventilate} – this is the cleanest air of the day (avg AQI ~${best.avgAqi}).` });
    const errands = profile.activities.includes('market_errands') ? 'Do market errands and outdoor chores now' : 'Best slot for any outdoor errands';
    steps.push({ time: best.start, label: `${formatHour(best.start)}–${formatHour(best.end)}`, kind: 'outdoor', action: `${errands}${best.avgAqi > 150 ? ' – wear an N95' : ''}.` });
    if ((profile.children > 0 || profile.activities.includes('outdoor_play')) && best.avgAqi <= 150) {
      steps.push({ time: best.end, label: formatHour(best.end), kind: 'outdoor', action: 'Short outdoor play for children (30–45 min max), then back indoors.' });
    }
  }

  if (worst && worst.aqi > 100) {
    steps.push({ time: worst.time, label: formatHour(worst.time), kind: 'protect', action: `Peak smog expected (AQI ~${worst.aqi}). Keep everyone indoors and windows shut.` });
  }

  if (peakAqi > 100) {
    const purifier = profile.hasPurifier ? 'Run the purifier on high in the bedroom' : 'Run your DIY box-fan filter in the bedroom';
    steps.push({ time: hourly.find((h) => hourOf(h.time) === 21)?.time || `${hourly[0].time.slice(0, 10)}T21:00`, label: '9 PM', kind: 'indoor', action: `${purifier} 1 hour before sleep with the door closed.` });
  }

  if (profile.activities.includes('morning_walk') || profile.activities.includes('yoga')) {
    const morning = hourly.find((h) => hourOf(h.time) === 7);
    if (morning) {
      steps.push({
        time: morning.time,
        label: '7 AM',
        kind: morning.aqi > 100 ? 'indoor' : 'outdoor',
        action: morning.aqi > 100 ? `Morning AQI ~${morning.aqi}: do your walk/yoga indoors.` : `Morning AQI ~${morning.aqi}: a short outdoor walk is OK.`,
      });
    }
  }

  const today = hourly[0].time.slice(0, 10);
  return steps
    .map((s) => (s.time.slice(0, 10) > today ? { ...s, label: `Tomorrow ${s.label}`, tomorrow: true } : s))
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

module.exports = { buildRoutine, estimateHourly, WINTER_PATTERN };
