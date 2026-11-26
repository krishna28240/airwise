'use strict';

/**
 * Commute emission & exposure calculator – powers the "low-emission routine"
 * suggestions with real numbers so families can see the impact of switching.
 *
 * Emission factors are approximate tailpipe CO2 per passenger-km for Indian
 * cities (sources: ICCT, India GHG Program, Delhi Metro sustainability reports).
 * Exposure factors are relative PM2.5 inhaled dose per km vs walking on a side street,
 * summarised from commuter-exposure studies.
 */

const MODES = Object.freeze({
  car: { label: 'Car (solo)', co2: 170, exposure: 1.3 },
  two_wheeler: { label: 'Two-wheeler', co2: 50, exposure: 2.0 },
  bus: { label: 'Bus', co2: 30, exposure: 1.4 },
  metro: { label: 'Metro', co2: 20, exposure: 0.6 },
  cycle: { label: 'Cycle', co2: 0, exposure: 1.8 },
  walk: { label: 'Walk', co2: 0, exposure: 1.5 },
  work_from_home: { label: 'Work from home', co2: 0, exposure: 0 },
});

const WORK_DAYS_PER_WEEK = 5;

/**
 * Weekly CO2 (kg) for a mode and one-way distance (round trip, 5 days).
 * @param {string} mode
 * @param {number} km one-way distance
 */
function weeklyCo2(mode, km) {
  const m = MODES[mode];
  if (!m) throw new RangeError(`Unknown mode: ${mode}`);
  return Math.round(((m.co2 * km * 2 * WORK_DAYS_PER_WEEK) / 1000) * 10) / 10;
}

/**
 * Compare the user's current commute with lower-emission alternatives.
 * @param {string} mode current mode
 * @param {number} km one-way km
 * @returns {{current: object, alternatives: object[]} | null}
 */
function compareCommute(mode, km) {
  if (!km || mode === 'work_from_home' || !MODES[mode]) return null;
  const current = { mode, label: MODES[mode].label, weeklyKgCo2: weeklyCo2(mode, km), exposure: MODES[mode].exposure };
  const candidates = ['metro', 'bus', 'cycle', 'walk'].filter((m) => m !== mode);
  const alternatives = candidates
    .filter((m) => !(m === 'walk' && km > 3) && !(m === 'cycle' && km > 10))
    .map((m) => {
      const kg = weeklyCo2(m, km);
      return {
        mode: m,
        label: MODES[m].label,
        weeklyKgCo2: kg,
        savedKgCo2: Math.round((current.weeklyKgCo2 - kg) * 10) / 10,
        exposureChangePct: Math.round(((MODES[m].exposure - current.exposure) / current.exposure) * 100),
      };
    })
    .filter((a) => a.savedKgCo2 > 0 || a.exposureChangePct < 0)
    .sort((a, b) => a.exposureChangePct - b.exposureChangePct || b.savedKgCo2 - a.savedKgCo2);
  return { current, alternatives };
}

module.exports = { compareCommute, weeklyCo2, MODES };
