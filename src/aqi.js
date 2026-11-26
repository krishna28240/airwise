'use strict';

/**
 * AQI utilities based on the US EPA Air Quality Index (2024 PM2.5 breakpoints).
 * Pure functions – no I/O – so they are easy to test.
 */

/** PM2.5 (µg/m³, 24h) breakpoints -> AQI, per US EPA (revised Feb 2024). */
const PM25_BREAKPOINTS = Object.freeze([
  { cLow: 0.0, cHigh: 9.0, iLow: 0, iHigh: 50 },
  { cLow: 9.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
  { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
  { cLow: 55.5, cHigh: 125.4, iLow: 151, iHigh: 200 },
  { cLow: 125.5, cHigh: 225.4, iLow: 201, iHigh: 300 },
  { cLow: 225.5, cHigh: 325.4, iLow: 301, iHigh: 500 },
]);

const CATEGORIES = Object.freeze([
  { max: 50, key: 'good', label: 'Good', color: '#2e7d32', level: 0 },
  { max: 100, key: 'moderate', label: 'Moderate', color: '#8a6d00', level: 1 },
  { max: 150, key: 'usg', label: 'Unhealthy for Sensitive Groups', color: '#b45309', level: 2 },
  { max: 200, key: 'unhealthy', label: 'Unhealthy', color: '#b91c1c', level: 3 },
  { max: 300, key: 'very_unhealthy', label: 'Very Unhealthy', color: '#7e22ce', level: 4 },
  { max: Infinity, key: 'hazardous', label: 'Hazardous', color: '#7f1d1d', level: 5 },
]);

/**
 * Convert a PM2.5 concentration to an AQI value.
 * @param {number} pm25 concentration in µg/m³
 * @returns {number} AQI (0–500, rounded)
 */
function pm25ToAqi(pm25) {
  if (!Number.isFinite(pm25) || pm25 < 0) throw new RangeError('pm25 must be a non-negative number');
  const c = Math.floor(pm25 * 10) / 10; // EPA truncation to 1 decimal
  const bp = PM25_BREAKPOINTS.find((b) => c <= b.cHigh) || PM25_BREAKPOINTS[PM25_BREAKPOINTS.length - 1];
  const capped = Math.min(c, bp.cHigh);
  const aqi = ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (capped - bp.cLow) + bp.iLow;
  return Math.round(Math.min(aqi, 500));
}

/**
 * Get the AQI category for a given AQI value.
 * @param {number} aqi
 */
function categorize(aqi) {
  if (!Number.isFinite(aqi) || aqi < 0) throw new RangeError('aqi must be a non-negative number');
  return CATEGORIES.find((c) => aqi <= c.max);
}

/**
 * Find the cleanest contiguous window of `hours` hours in an hourly forecast.
 * @param {{time: string, aqi: number}[]} hourly
 * @param {number} hours window length
 * @returns {{start: string, end: string, avgAqi: number} | null}
 */
function cleanestWindow(hourly, hours = 2) {
  if (!Array.isArray(hourly) || hourly.length < hours || hours < 1) return null;
  let best = null;
  let sum = 0;
  for (let i = 0; i < hourly.length; i += 1) {
    sum += hourly[i].aqi;
    if (i >= hours) sum -= hourly[i - hours].aqi;
    if (i >= hours - 1) {
      const avg = sum / hours;
      if (!best || avg < best.avgAqi) {
        best = { start: hourly[i - hours + 1].time, end: hourly[i].time, avgAqi: Math.round(avg) };
      }
    }
  }
  return best;
}

module.exports = { pm25ToAqi, categorize, cleanestWindow, CATEGORIES };
