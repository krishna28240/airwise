/**
 * City comparison and the live AQI ticker on the home page.
 */

import { $, el, countUp, setBusy } from './dom.mjs';
import { hourLabel, shortCategory } from './lib.mjs';
import { api } from './api.mjs';

const TICKER_CITIES = ['Delhi', 'Mumbai', 'Bengaluru', 'Kolkata'];
const INPUTS = ['#cmp1', '#cmp2', '#cmp3', '#cmp4'];

function errorCard(r) {
  const card = el('article', { class: 'card cmp-card cmp-err' });
  card.append(el('h3', null, r.query), el('p', { class: 'muted' }, 'Location not found – check the spelling.'));
  return card;
}

function cityCard(r, rank, isBest, maxAqi) {
  const card = el('article', { class: 'card cmp-card' });
  const top = el('div', { class: 'cmp-top' });
  top.append(el('h3', null, r.place), el('span', { class: `cmp-rank${isBest ? ' best' : ''}` }, isBest ? 'Cleanest' : `#${rank}`));

  const num = el('strong', null, String(r.aqi));
  num.style.color = r.color;
  const value = el('div', { class: 'cmp-val' });
  value.append(num, el('span', null, 'US AQI'));

  const fill = el('div', { class: 'dist-fill' });
  fill.style.width = `${(r.aqi / maxAqi) * 100}%`;
  fill.style.background = r.color;
  const bar = el('div', { class: 'dist-track' });
  bar.appendChild(fill);

  const meta = el('dl', { class: 'cmp-meta' });
  const add = (k, v) => meta.append(el('dt', null, k), el('dd', null, v));
  add('PM2.5', r.pm25 !== null ? `${r.pm25} µg/m³` : '—');
  add('PM10', r.pm10 !== null ? `${r.pm10} µg/m³` : '—');
  if (r.cleanestHour) add('Cleanest hour (24h)', `${hourLabel(r.cleanestHour.time)} · AQI ${r.cleanestHour.aqi}`);

  card.append(top, value, el('p', { class: 'cmp-cat' }, r.category), bar, meta);
  return card;
}

async function onCompare(e) {
  e.preventDefault();
  const cities = INPUTS.map((s) => $(s).value.trim()).filter(Boolean);
  const err = $('#compare-error');
  const out = $('#compare-results');
  err.textContent = '';
  $('#cmp2').setAttribute('aria-invalid', String(cities.length < 2));
  if (cities.length < 2) {
    err.textContent = 'Enter at least two cities.';
    $(INPUTS[cities.length]).focus();
    return;
  }
  const btn = $('#compare-btn');
  setBusy(btn, true, 'Fetching live data…', 'Compare cities');
  out.setAttribute('aria-busy', 'true');
  try {
    const { results } = await api.compare(cities);
    const found = results.filter((r) => !r.error);
    const maxAqi = Math.max(100, ...found.map((r) => r.aqi));
    out.replaceChildren(...results.map((r, i) => (r.error ? errorCard(r) : cityCard(r, i + 1, i === 0 && found.length > 1, maxAqi))));
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    setBusy(btn, false, '', 'Compare cities');
    out.setAttribute('aria-busy', 'false');
  }
}

/** Fill the home-page ticker with live readings; hide it if the data is unavailable. */
export async function loadLiveTicker() {
  try {
    const { results } = await api.compare(TICKER_CITIES);
    $('#live-cities').replaceChildren(...results.filter((r) => !r.error).map((r) => {
      const dot = el('i');
      dot.style.background = r.color;
      const value = el('strong');
      countUp(value, r.aqi);
      const li = el('li', { class: 'live-city' });
      li.append(dot, el('span', { class: 'lc-name' }, r.place.split(',')[0]), value, el('span', { class: 'lc-cat' }, shortCategory(r.category)));
      return li;
    }));
    $('#live-time').textContent = `Updated ${new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  } catch {
    $('#live-strip').hidden = true;
  }
}

export function initCompare() {
  $('#compare-form').addEventListener('submit', onCompare);
}
