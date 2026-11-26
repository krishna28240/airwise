/**
 * Pure helpers shared by the AirWise front-end.
 * No DOM access here, so everything in this module is unit-tested in Node (tests/frontend-lib.test.js).
 */

/** AQI category names (as returned by the API) with their display colours and short labels. */
export const CATEGORIES = Object.freeze([
  { name: 'Good', color: '#2e7d32', short: 'Good' },
  { name: 'Moderate', color: '#8a6d00', short: 'Moderate' },
  { name: 'Unhealthy for Sensitive Groups', color: '#b45309', short: 'Sensitive groups' },
  { name: 'Unhealthy', color: '#b91c1c', short: 'Unhealthy' },
  { name: 'Very Unhealthy', color: '#7e22ce', short: 'Very Unhealthy' },
  { name: 'Hazardous', color: '#7f1d1d', short: 'Hazardous' },
]);

const AQI_BREAKS = [50, 100, 150, 200, 300];

/** @param {number} aqi @returns {string} hex colour for the AQI band */
export function aqiColor(aqi) {
  const i = AQI_BREAKS.findIndex((max) => aqi <= max);
  return CATEGORIES[i === -1 ? CATEGORIES.length - 1 : i].color;
}

/** @param {string} name full category name @returns {string} compact label for tight layouts */
export function shortCategory(name) {
  return CATEGORIES.find((c) => c.name === name)?.short ?? name;
}

/** @param {string} iso e.g. "2026-11-24T13:00" @returns {string} e.g. "1p" */
export function hourLabel(iso) {
  const h = Number(String(iso).slice(11, 13));
  return `${((h + 11) % 12) + 1}${h >= 12 ? 'p' : 'a'}`;
}

/** SQLite stores UTC as "YYYY-MM-DD HH:MM:SS"; convert to a Date. */
export function toDate(sqlUtc) {
  return new Date(`${String(sqlUtc).replace(' ', 'T')}Z`);
}

/**
 * Client-side mirror of the server's validation, for instant feedback.
 * @param {object} p profile read from the form
 * @returns {string} an error message, or '' when valid
 */
export function validateProfileInput(p) {
  if (!p.city && p.aqi === undefined && p.lat === undefined) return 'Enter your city, use your location, or type an AQI value.';
  if (p.commuteKm !== undefined && (!Number.isInteger(p.commuteKm) || p.commuteKm < 0 || p.commuteKm > 100)) return 'Commute distance must be 0–100 km.';
  if (p.aqi !== undefined && (!Number.isInteger(p.aqi) || p.aqi < 0 || p.aqi > 999)) return 'AQI must be a whole number from 0 to 999.';
  if ((p.adults || 0) + (p.children || 0) + (p.elderly || 0) === 0) return 'Add at least one family member.';
  return '';
}

/** @param {object} data plan API response @returns {string} plain-text plan for sharing */
export function planAsText(data) {
  const p = data.plan;
  const lines = [`AirWise plan – ${data.place}`, `AQI ${p.aqi} (${p.category.label}): ${p.headline}`, ''];
  p.routine.forEach((r) => lines.push(`• ${r.label}: ${r.action}`));
  p.sections.forEach((s) => {
    lines.push('', s.title.toUpperCase());
    s.items.forEach((i) => lines.push(`- ${i}`));
  });
  return lines.join('\n');
}

/** @param {object[]} plans history rows @returns {string} RFC 4180 CSV */
export function historyToCsv(plans) {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const header = ['id', 'date_utc', 'location', 'aqi', 'category', 'risk_level', 'ai'].join(',');
  const rows = plans.map((p) => [p.id, p.createdAt, esc(p.place), p.aqi, esc(p.category), p.riskLevel ?? '', p.ai].join(','));
  return [header, ...rows].join('\n');
}

/**
 * Parse the small Markdown subset Gemini returns into blocks, so the UI can build DOM nodes safely.
 * @param {string} text
 * @returns {{type: 'p'|'ul', items: {bold: boolean, text: string}[][]}[]}
 *   each `p` block has one item (a run list); each `ul` block has one run list per bullet
 */
export function parseRich(text) {
  const runs = (str) => String(str).split(/(\*\*[^*]+\*\*)/g).filter(Boolean)
    .map((part) => (/^\*\*[^*]+\*\*$/.test(part) ? { bold: true, text: part.slice(2, -2) } : { bold: false, text: part }));
  const blocks = [];
  let list = null;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    const bullet = line.match(/^(?:[*\-•]|\d+\.)\s+(.*)/);
    if (bullet) {
      if (!list) { list = { type: 'ul', items: [] }; blocks.push(list); }
      list.items.push(runs(bullet[1]));
    } else {
      list = null;
      if (line) blocks.push({ type: 'p', items: [runs(line.replace(/^#+\s*/, ''))] });
    }
  }
  return blocks;
}

/**
 * Turn plan history into chart points: a daily average when history spans 3+ days, otherwise one point per plan.
 * @param {object[]} plans newest first (as returned by the API)
 * @param {{maxDays?: number, maxPlans?: number}} [opts]
 * @returns {{daily: boolean, points: {aqi: number, date: Date, count: number, places: string[]}[]}}
 */
export function trendSeries(plans, { maxDays = 14, maxPlans = 30 } = {}) {
  const recent = plans.slice(0, 60).reverse();
  const byDay = new Map();
  for (const p of recent) {
    const date = toDate(p.createdAt);
    const key = date.toDateString();
    if (!byDay.has(key)) byDay.set(key, { date, sum: 0, count: 0, places: new Set() });
    const g = byDay.get(key);
    g.sum += p.aqi;
    g.count += 1;
    g.places.add(String(p.place).split(',')[0]);
  }
  if (byDay.size >= 3) {
    const points = [...byDay.values()].slice(-maxDays)
      .map((g) => ({ aqi: Math.round(g.sum / g.count), date: g.date, count: g.count, places: [...g.places] }));
    return { daily: true, points };
  }
  const points = recent.slice(-maxPlans)
    .map((p) => ({ aqi: p.aqi, date: toDate(p.createdAt), count: 1, places: [String(p.place).split(',')[0]] }));
  return { daily: false, points };
}

/** @param {number} max largest value @returns {{top: number, step: number}} a readable y-axis */
export function niceAxis(max) {
  const top = Math.ceil(Math.max(100, max) / 100) * 100;
  return { top, step: top > 300 ? 100 : 50 };
}

/**
 * Smooth SVG path through points (Catmull-Rom spline converted to cubic Béziers).
 * @param {[number, number][]} pts
 * @returns {string}
 */
export function smoothPath(pts) {
  if (!pts.length) return '';
  const f = (n) => n.toFixed(1);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}
