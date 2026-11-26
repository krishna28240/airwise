'use strict';

/**
 * Live air-quality data from Open-Meteo (free, no API key).
 * Results are cached in memory to save time and avoid hammering the API.
 */

const { pm25ToAqi } = require('./aqi');
const { TTLCache } = require('./cache');

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const AQ_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const TIMEOUT_MS = 6000;

const cache = new TTLCache({ ttlMs: 15 * 60 * 1000, max: 200 });

async function fetchJson(url, fetchImpl = fetch) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Upstream error ${res.status}`);
  return res.json();
}

/**
 * Resolve a city name to coordinates.
 * @returns {Promise<{name: string, country: string, latitude: number, longitude: number, timezone: string}>}
 */
async function geocode(city, fetchImpl) {
  const url = `${GEO_URL}?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const data = await fetchJson(url, fetchImpl);
  const r = data && Array.isArray(data.results) ? data.results[0] : null;
  if (!r) {
    const err = new Error('City not found. Try a nearby larger city, or enter AQI manually.');
    err.status = 404;
    throw err;
  }
  return { name: r.name, country: r.country || '', latitude: r.latitude, longitude: r.longitude, timezone: r.timezone || 'auto' };
}

/**
 * Get current air quality + 24h hourly AQI forecast.
 * @param {string | {lat: number, lon: number}} where city name or rounded coordinates
 * @param {typeof fetch} [fetchImpl] injectable for tests
 */
async function getAirQuality(where, fetchImpl) {
  const byCoords = typeof where === 'object' && where !== null;
  const key = byCoords ? `@${where.lat},${where.lon}` : String(where).toLowerCase();
  const hit = cache.get(key);
  if (hit) return { ...hit, cached: true };

  const place = byCoords
    ? { name: 'Your location', country: '', latitude: where.lat, longitude: where.lon, timezone: 'auto' }
    : await geocode(where, fetchImpl);
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: 'us_aqi,pm2_5,pm10',
    hourly: 'us_aqi,pm2_5',
    forecast_days: '2',
    timezone: place.timezone,
  });
  const data = await fetchJson(`${AQ_URL}?${params}`, fetchImpl);
  const cur = data.current || {};
  const pm25 = Number(cur.pm2_5);
  const aqi = Number.isFinite(cur.us_aqi) ? Math.round(cur.us_aqi) : pm25ToAqi(Number.isFinite(pm25) ? pm25 : 0);

  const now = cur.time || '';
  const hourly = [];
  const h = data.hourly || {};
  (h.time || []).forEach((t, i) => {
    const v = h.us_aqi ? h.us_aqi[i] : null;
    if (t >= now.slice(0, 13) && Number.isFinite(v)) hourly.push({ time: t, aqi: Math.round(v) });
  });

  const result = {
    place: `${place.name}${place.country ? `, ${place.country}` : ''}`,
    aqi,
    pm25: Number.isFinite(pm25) ? pm25 : null,
    pm10: Number.isFinite(cur.pm10) ? cur.pm10 : null,
    hourly: hourly.slice(0, 24),
    source: 'Open-Meteo (CAMS)',
  };
  cache.set(key, result);
  return { ...result, cached: false };
}

module.exports = { getAirQuality, geocode, _cache: cache };
