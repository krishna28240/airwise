'use strict';

/**
 * City comparison: fetch live air quality for several cities and rank them cleanest first.
 */

const { categorize } = require('./aqi');
const { cleanText, ValidationError } = require('./validate');

const MIN_CITIES = 2;
const MAX_CITIES = 4;

/**
 * Parse and validate the `cities` query parameter (comma-separated, de-duplicated).
 * @param {string|null} raw
 * @returns {string[]}
 */
function parseCities(raw) {
  const cities = [...new Set(String(raw || '').split(',').map((c) => cleanText(c, 80)).filter(Boolean))];
  if (cities.length < MIN_CITIES) throw new ValidationError('Enter at least two cities to compare');
  return cities.slice(0, MAX_CITIES);
}

/**
 * @param {{time: string, aqi: number}[]} hourly
 * @returns {{time: string, aqi: number}|null} the hour with the lowest AQI
 */
function cleanestHour(hourly = []) {
  return hourly.length ? hourly.reduce((best, h) => (h.aqi < best.aqi ? h : best)) : null;
}

/**
 * Compare cities. Lookups run in parallel; a city that cannot be found is reported, not fatal.
 * @param {string[]} cities
 * @param {(city: string) => Promise<object>} getAirQuality
 * @returns {Promise<object[]>} results sorted by AQI ascending, unknown cities last
 */
async function compareCities(cities, getAirQuality) {
  const settled = await Promise.allSettled(cities.map((c) => getAirQuality(c)));
  const results = settled.map((r, i) => {
    if (r.status !== 'fulfilled') return { query: cities[i], error: 'Not found' };
    const a = r.value;
    const cat = categorize(a.aqi);
    return {
      query: cities[i],
      place: a.place,
      aqi: a.aqi,
      pm25: a.pm25 ?? null,
      pm10: a.pm10 ?? null,
      category: cat.label,
      color: cat.color,
      cleanestHour: cleanestHour(a.hourly),
    };
  });
  return results.sort((x, y) => {
    if (x.error || y.error) return Number(Boolean(x.error)) - Number(Boolean(y.error));
    return x.aqi - y.aqi;
  });
}

module.exports = { parseCities, compareCities, cleanestHour, MAX_CITIES };
