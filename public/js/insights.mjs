/**
 * Insights: KPIs, trend chart, category mix, plan history (open / delete / clear) and CSV export.
 */

import { $, el, countUp, toast } from './dom.mjs';
import { aqiColor, toDate, historyToCsv, CATEGORIES } from './lib.mjs';
import { api } from './api.mjs';
import { renderTrend } from './chart.mjs';

let history = [];
let onOpen = () => {};

function setKpi(sel, value) {
  if (value === null || value === undefined) $(sel).textContent = '–';
  else countUp($(sel), value);
}

async function loadStats() {
  try {
    const s = await api.stats();
    setKpi('#st-total', s.total || 0);
    setKpi('#st-avg', s.avgAqi);
    setKpi('#st-max', s.maxAqi);
    setKpi('#st-places', s.places || 0);
    const top = s.topPlaces || [];
    $('#top-places').replaceChildren(...top.map((t) => {
      const li = el('li');
      li.append(el('span', null, t.place), el('span', { class: 'muted' }, `${t.n}× · avg ${t.avgAqi}`));
      return li;
    }));
    $('#top-places-card').hidden = !top.length;
  } catch { /* stats are a non-essential enhancement */ }
}

function renderDistribution(plans) {
  const total = plans.length || 1;
  $('#dist').replaceChildren(...CATEGORIES.map((c) => {
    const n = plans.filter((p) => p.category === c.name).length;
    const pct = Math.round((n / total) * 100);
    const li = el('li');
    const head = el('div', { class: 'dist-head' });
    head.append(el('span', null, c.short), el('span', { class: 'muted' }, `${n} · ${pct}%`));
    const fill = el('div', { class: 'dist-fill' });
    fill.style.width = `${(n / total) * 100}%`;
    fill.style.background = c.color;
    const track = el('div', { class: 'dist-track' });
    track.appendChild(fill);
    li.append(head, track);
    return li;
  }));
}

function historyRow(p) {
  const tr = el('tr');
  const pill = el('span', { class: 'aqi-pill' }, String(p.aqi));
  pill.style.background = p.color || aqiColor(p.aqi);
  const aqiCell = el('td');
  aqiCell.appendChild(pill);
  const open = el('button', { type: 'button', class: 'link-btn', 'aria-label': `Open plan for ${p.place}` }, 'Open');
  open.addEventListener('click', () => onOpen(p.id));
  const del = el('button', { type: 'button', class: 'link-btn danger', 'aria-label': `Delete plan for ${p.place}` }, 'Delete');
  del.addEventListener('click', async () => {
    try { await api.deletePlan(p.id); toast('Plan deleted'); } catch (e) { toast(e.message); }
    loadHistory();
  });
  const actions = el('td', { class: 't-right' });
  actions.append(open, del);
  tr.append(
    el('td', { class: 'muted' }, toDate(p.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })),
    el('th', { scope: 'row' }, p.place),
    aqiCell,
    el('td', null, p.category),
    el('td', null, p.ai ? 'Yes' : '—'),
    actions,
  );
  return tr;
}

function drawTrend() {
  renderTrend($('#trend'), $('#trend-sub'), history);
}

/** Reload history from the server and refresh every Insights widget. */
export async function loadHistory() {
  try {
    ({ plans: history } = await api.history());
    drawTrend();
    renderDistribution(history);
    $('#history-rows').replaceChildren(...history.map(historyRow));
    $('#history-empty').hidden = history.length > 0;
    $('#clear-history').disabled = !history.length;
    $('#export-csv').disabled = !history.length;
  } catch {
    $('#history-empty').hidden = false;
    $('#history-empty').textContent = 'Could not load history.';
  }
  loadStats();
}

function exportCsv() {
  if (!history.length) return;
  const url = URL.createObjectURL(new Blob([historyToCsv(history)], { type: 'text/csv' }));
  const a = el('a', { href: url, download: `airwise-history-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('CSV exported');
}

async function clearHistory() {
  if (!confirm('Delete all saved plans? This cannot be undone.')) return;
  try { await api.clearHistory(); toast('History cleared'); } catch (e) { toast(e.message); }
  loadHistory();
}

/**
 * Wire up the Insights section.
 * @param {{openPlan: (id: number) => void}} hooks
 */
export function initInsights({ openPlan }) {
  onOpen = openPlan;
  $('#export-csv').addEventListener('click', exportCsv);
  $('#clear-history').addEventListener('click', clearHistory);

  // Redraw the chart when its container is resized (layout changes, window resize).
  if ('ResizeObserver' in window) {
    let timer;
    let lastSize = '';
    new ResizeObserver(([entry]) => {
      const size = `${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`;
      if (size === lastSize) return;
      lastSize = size;
      clearTimeout(timer);
      timer = setTimeout(drawTrend, 60);
    }).observe($('#trend'));
  }
  loadHistory();
}
