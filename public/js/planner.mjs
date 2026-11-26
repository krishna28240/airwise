/**
 * Planner: household form, plan rendering, sharing and the "Ask AirWise" chat.
 */

import { $, el, renderRich, countUp, toast, setBusy, prefersReducedMotion } from './dom.mjs';
import { aqiColor, hourLabel, validateProfileInput, planAsText } from './lib.mjs';
import { api } from './api.mjs';

const STORAGE_KEY = 'airwise.profile.v1';
const STATUS_TEXT = { ok: 'Normal day', limit: 'Limit outdoors', stay_in: 'Stay indoors' };
const FIELDS = ['city', 'adults', 'children', 'elderly', 'commute', 'commuteKm', 'home', 'cooking', 'language'];

const form = $('#profile-form');
const results = $('#results');
const errorEl = $('#form-error');
const submitBtn = $('#submit-btn');
const resultsCol = $('.results-col');

const state = { profile: null, data: null, coords: null };

function readProfile() {
  const fd = new FormData(form);
  const num = (k) => (fd.get(k) === '' || fd.get(k) === null ? undefined : Number(fd.get(k)));
  const city = String(fd.get('city') || '').trim();
  return {
    city,
    aqi: num('aqi'),
    adults: num('adults'),
    children: num('children'),
    elderly: num('elderly'),
    conditions: fd.getAll('conditions'),
    activities: fd.getAll('activities'),
    commute: fd.get('commute'),
    home: fd.get('home'),
    cooking: fd.get('cooking'),
    language: fd.get('language'),
    hasPurifier: $('#hasPurifier').checked,
    commuteKm: num('commuteKm'),
    localHour: new Date().getHours(),
    ...(state.coords && !city ? { lat: state.coords.lat, lon: state.coords.lon } : {}),
  };
}

/** Populate the form from a saved profile. */
export function fillForm(saved) {
  if (!saved) return;
  FIELDS.forEach((k) => { if (saved[k] !== undefined && form.elements[k]) form.elements[k].value = saved[k]; });
  form.querySelectorAll('input[name="conditions"], input[name="activities"]').forEach((cb) => {
    cb.checked = (saved[cb.name] || []).includes(cb.value);
  });
  $('#hasPurifier').checked = Boolean(saved.hasPurifier);
}

function restoreProfile() {
  try { fillForm(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); } catch { /* corrupt or unavailable storage */ }
}

function renderSummary(data) {
  const { plan } = data;
  const dial = $('#aqi-dial');
  dial.style.setProperty('--c', plan.category.color);
  dial.style.setProperty('--p', '0');
  requestAnimationFrame(() => requestAnimationFrame(() => dial.style.setProperty('--p', String(Math.min(100, (plan.aqi / 500) * 100)))));
  dial.setAttribute('aria-label', `Air quality index ${plan.aqi}, ${plan.category.label}`);
  const value = $('#aqi-value');
  countUp(value, plan.aqi);
  value.style.color = plan.category.color;
  $('#place').textContent = data.place;
  $('#category').textContent = plan.category.label;
  $('#headline').textContent = plan.headline;
  const meta = [`Source: ${data.source}`];
  if (data.pm25 !== null) meta.push(`PM2.5 ${data.pm25} µg/m³`);
  if (data.pm10 !== null) meta.push(`PM10 ${data.pm10} µg/m³`);
  $('#meta').textContent = meta.join(' · ');
}

function renderForecast(hourly, best) {
  const wrap = $('#forecast');
  wrap.replaceChildren();
  $('#forecast-card').hidden = !hourly.length;
  if (!hourly.length) return;
  const max = Math.max(...hourly.map((h) => h.aqi), 100);
  hourly.forEach((h) => {
    const label = `${hourLabel(h.time)}: AQI ${h.aqi}`;
    const bar = el('div', { class: 'bar', role: 'listitem', 'aria-label': label, title: label });
    bar.style.height = `${Math.max(4, (h.aqi / max) * 100)}%`;
    bar.style.background = aqiColor(h.aqi);
    if (best && h.time >= best.start && h.time <= best.end) bar.classList.add('best');
    bar.appendChild(el('span', { 'aria-hidden': 'true' }, hourLabel(h.time)));
    wrap.appendChild(bar);
  });
  $('#window-text').textContent = best
    ? `Outlined bars show the cleanest 2-hour window (avg AQI ${best.avgAqi}) – best time for errands or airing out the house.`
    : '';
}

function renderMembers(members) {
  const list = $('#members');
  list.replaceChildren();
  $('#members-card').hidden = !members.length;
  members.forEach((m) => {
    const li = el('li', { class: `member ${m.status}` });
    li.append(el('strong', null, m.who), el('span', { class: 'status' }, STATUS_TEXT[m.status]), el('p', null, m.tip));
    list.appendChild(li);
  });
}

function renderRoutine(steps, estimated) {
  const list = $('#routine');
  list.replaceChildren();
  $('#routine-card').hidden = !steps.length;
  $('#routine-note').textContent = estimated
    ? 'Times are estimated from the typical winter smog pattern (no live forecast).'
    : 'Built from the live 24-hour forecast for your area.';
  steps.forEach((r) => {
    const li = el('li', { class: r.kind });
    li.append(el('span', { class: 'when' }, r.label), el('span', null, r.action));
    list.appendChild(li);
  });
}

function renderCommute(c) {
  const rows = $('#commute-rows');
  rows.replaceChildren();
  const has = Boolean(c && c.alternatives.length);
  $('#commute-card').hidden = !has;
  if (!has) return;
  $('#commute-current').textContent = `Today: ${c.current.label} ≈ ${c.current.weeklyKgCo2} kg CO₂ per week (round trips, 5 days).`;
  c.alternatives.forEach((a) => {
    const exp = a.exposureChangePct;
    const tr = el('tr');
    tr.append(
      el('th', { scope: 'row' }, a.label),
      el('td', null, `${a.weeklyKgCo2} kg`),
      el('td', { class: a.savedKgCo2 > 0 ? 'good-delta' : '' }, a.savedKgCo2 > 0 ? `−${a.savedKgCo2} kg` : '—'),
      el('td', { class: exp < 0 ? 'good-delta' : '' }, exp === 0 ? 'Same' : `${exp > 0 ? '+' : ''}${exp}%`),
    );
    rows.appendChild(tr);
  });
}

function renderSections(sections) {
  const wrap = $('#sections');
  wrap.replaceChildren();
  sections.forEach((s) => {
    const card = el('section', { class: 'card plan-section', 'aria-labelledby': `sec-${s.id}` });
    const ul = el('ul');
    s.items.forEach((item) => ul.appendChild(el('li', null, item)));
    card.append(el('h3', { id: `sec-${s.id}` }, s.title), ul);
    wrap.appendChild(card);
  });
}

/** Render a plan API response (new or saved) into the results column. */
export function showPlan(data, profile = state.profile) {
  state.data = data;
  state.profile = profile;
  const { plan } = data;
  renderSummary(data);
  renderForecast(data.hourly || [], plan.cleanestWindow);
  renderMembers(plan.members || []);
  renderRoutine(plan.routine || [], plan.forecastEstimated);
  renderCommute(plan.commute);
  renderSections(plan.sections);
  $('#briefing-card').hidden = !data.briefing;
  renderRich($('#briefing'), data.briefing || '');
  $('#briefing').setAttribute('lang', profile?.language || 'en');
  results.hidden = false;
  $('#empty-state').hidden = true;
}

async function onSubmit(e, onSaved) {
  e.preventDefault();
  const profile = readProfile();
  const msg = validateProfileInput(profile);
  errorEl.textContent = msg;
  const cityMissing = Boolean(msg) && !profile.city && profile.aqi === undefined;
  form.elements.city.setAttribute('aria-invalid', String(cityMissing));
  if (msg) {
    // Move focus to the field that needs fixing so keyboard and screen-reader users land on it.
    (cityMissing ? form.elements.city : form.querySelector('input:invalid, #adults')).focus();
    return;
  }

  setBusy(submitBtn, true, 'Analysing air quality…', 'Generate plan');
  results.setAttribute('aria-busy', 'true');
  resultsCol.classList.add('is-loading');
  try {
    const data = await api.plan(profile);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch { /* storage unavailable */ }
    showPlan(data, profile);
    onSaved();
    $('#results-title').focus();
    results.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    setBusy(submitBtn, false, '', 'Generate plan');
    results.setAttribute('aria-busy', 'false');
    resultsCol.classList.remove('is-loading');
  }
}

async function ask(question) {
  if (!state.profile || question.length < 3) return;
  const log = $('#chat-log');
  const pending = el('div', { class: 'msg bot' }, 'Thinking…');
  log.append(el('div', { class: 'msg user' }, question), pending);
  log.scrollTop = log.scrollHeight;
  try {
    const data = await api.chat(question, state.profile);
    renderRich(pending, data.text);
  } catch (err) {
    pending.textContent = err.message;
  }
  log.scrollTop = log.scrollHeight;
}

function useLocation() {
  const hint = $('#city-hint');
  if (!('geolocation' in navigator)) {
    errorEl.textContent = 'Location is not supported in this browser – type your city instead.';
    return;
  }
  hint.textContent = 'Getting your location…';
  navigator.geolocation.getCurrentPosition((pos) => {
    // Round to ~1 km before it leaves the browser.
    state.coords = { lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100 };
    form.elements.city.value = '';
    hint.textContent = 'Using your current location (rounded to ~1 km).';
    form.requestSubmit();
  }, () => {
    hint.textContent = 'Location permission denied – type your city instead.';
  }, { timeout: 10000, maximumAge: 600000 });
}

async function sharePlan() {
  if (!state.data) return;
  const text = planAsText(state.data);
  try {
    if (navigator.share) await navigator.share({ title: 'AirWise plan', text });
    else { await navigator.clipboard.writeText(text); toast('Plan copied to clipboard'); }
  } catch {
    toast('Could not share – try printing instead');
  }
}

/**
 * Wire up the planner.
 * @param {{onPlanSaved: () => void}} hooks called after a new plan is stored server-side
 */
export function initPlanner({ onPlanSaved }) {
  form.addEventListener('submit', (e) => onSubmit(e, onPlanSaved));
  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#question');
    const q = input.value.trim();
    input.value = '';
    ask(q);
  });
  document.querySelectorAll('.chip-btn').forEach((b) => b.addEventListener('click', () => ask(b.dataset.q)));
  $('#locate-btn').addEventListener('click', useLocation);
  $('#print-btn').addEventListener('click', () => window.print());
  $('#share-btn').addEventListener('click', sharePlan);
  restoreProfile();
}
