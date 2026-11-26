'use strict';

/* AirWise front-end. Uses textContent everywhere (never innerHTML with data) to prevent XSS. */
(function () {
  const $ = (sel) => document.querySelector(sel);
  const form = $('#profile-form');
  const results = $('#results');
  const errorEl = $('#form-error');
  const submitBtn = $('#submit-btn');
  let lastProfile = null;
  let lastData = null;
  let coords = null;

  const STORAGE_KEY = 'airwise.profile.v1';

  function el(tag, attrs, text) {
    const node = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function readProfile() {
    const fd = new FormData(form);
    const num = (k) => (fd.get(k) === '' || fd.get(k) === null ? undefined : Number(fd.get(k)));
    return {
      city: String(fd.get('city') || '').trim(),
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
      ...(coords && !String(fd.get('city') || '').trim() ? { lat: coords.lat, lon: coords.lon } : {}),
    };
  }

  function restoreProfile() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { saved = null; }
    fillForm(saved);
  }

  function fillForm(saved) {
    if (!saved) return;
    ['city', 'adults', 'children', 'elderly', 'commute', 'commuteKm', 'home', 'cooking', 'language'].forEach((k) => {
      if (saved[k] !== undefined && form.elements[k]) form.elements[k].value = saved[k];
    });
    form.querySelectorAll('input[name="conditions"], input[name="activities"]').forEach((cb) => {
      cb.checked = (saved[cb.name] || []).includes(cb.value);
    });
    $('#hasPurifier').checked = Boolean(saved.hasPurifier);
  }

  function clientValidate(p) {
    if (!p.city && p.aqi === undefined && p.lat === undefined) return 'Enter your city, use your location, or type an AQI value.';
    if (p.commuteKm !== undefined && (!Number.isInteger(p.commuteKm) || p.commuteKm < 0 || p.commuteKm > 100)) return 'Commute distance must be 0–100 km.';
    if (p.aqi !== undefined && (!Number.isInteger(p.aqi) || p.aqi < 0 || p.aqi > 999)) return 'AQI must be a whole number from 0 to 999.';
    if ((p.adults || 0) + (p.children || 0) + (p.elderly || 0) === 0) return 'Add at least one family member.';
    return '';
  }

  async function postJson(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  function hourLabel(iso) {
    const h = Number(String(iso).slice(11, 13));
    return `${((h + 11) % 12) + 1}${h >= 12 ? 'p' : 'a'}`;
  }

  function aqiColor(aqi) {
    if (aqi <= 50) return '#2e7d32';
    if (aqi <= 100) return '#8a6d00';
    if (aqi <= 150) return '#b45309';
    if (aqi <= 200) return '#b91c1c';
    if (aqi <= 300) return '#7e22ce';
    return '#7f1d1d';
  }

  function renderForecast(hourly, best) {
    const card = $('#forecast-card');
    const wrap = $('#forecast');
    wrap.replaceChildren();
    if (!hourly.length) { card.hidden = true; return; }
    card.hidden = false;
    const max = Math.max(...hourly.map((h) => h.aqi), 100);
    hourly.forEach((h) => {
      const bar = el('div', { class: 'bar', role: 'listitem', 'aria-label': `${hourLabel(h.time)}: AQI ${h.aqi}`, title: `${hourLabel(h.time)} – AQI ${h.aqi}` });
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

  const STATUS_TEXT = { ok: 'Normal day', limit: 'Limit outdoors', stay_in: 'Stay indoors' };

  function renderMembers(members) {
    const list = $('#members');
    list.replaceChildren();
    $('#members-card').hidden = !members.length;
    members.forEach((m) => {
      const li = el('li', { class: `member ${m.status}` });
      li.appendChild(el('strong', null, m.who));
      li.appendChild(el('span', { class: 'status' }, STATUS_TEXT[m.status]));
      li.appendChild(el('p', null, m.tip));
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
      li.appendChild(el('span', { class: 'when' }, r.label));
      li.appendChild(el('span', null, r.action));
      list.appendChild(li);
    });
  }

  function renderCommute(c) {
    const card = $('#commute-card');
    const rows = $('#commute-rows');
    rows.replaceChildren();
    if (!c || !c.alternatives.length) { card.hidden = true; return; }
    card.hidden = false;
    $('#commute-current').textContent = `Today: ${c.current.label} ≈ ${c.current.weeklyKgCo2} kg CO₂ per week (round trips, 5 days).`;
    c.alternatives.forEach((a) => {
      const tr = el('tr');
      tr.appendChild(el('th', { scope: 'row' }, a.label));
      tr.appendChild(el('td', null, `${a.weeklyKgCo2} kg`));
      tr.appendChild(el('td', { class: a.savedKgCo2 > 0 ? 'good-delta' : '' }, a.savedKgCo2 > 0 ? `−${a.savedKgCo2} kg` : '—'));
      const exp = a.exposureChangePct;
      tr.appendChild(el('td', { class: exp < 0 ? 'good-delta' : '' }, exp === 0 ? 'Same' : `${exp > 0 ? '+' : ''}${exp}%`));
      rows.appendChild(tr);
    });
  }

  /* Render the small subset of Markdown Gemini uses (**bold**, bullets) with DOM nodes only – no innerHTML. */
  function renderRich(node, text) {
    node.replaceChildren();
    const inline = (parent, str) => {
      String(str).split(/(\*\*[^*]+\*\*)/g).forEach((part) => {
        if (!part) return;
        if (/^\*\*[^*]+\*\*$/.test(part)) parent.appendChild(el('strong', null, part.slice(2, -2)));
        else parent.appendChild(document.createTextNode(part));
      });
    };
    let list = null;
    String(text).split(/\r?\n/).forEach((raw) => {
      const line = raw.trim();
      const bullet = line.match(/^(?:[*\-•]|\d+\.)\s+(.*)/);
      if (bullet) {
        if (!list) { list = el('ul', { class: 'rich-list' }); node.appendChild(list); }
        const li = el('li');
        inline(li, bullet[1]);
        list.appendChild(li);
        return;
      }
      list = null;
      if (!line) return;
      const pEl = el('p', { class: 'rich-p' });
      inline(pEl, line.replace(/^#+\s*/, ''));
      node.appendChild(pEl);
    });
  }

  function planAsText(data) {
    const p = data.plan;
    const lines = [`AirWise plan – ${data.place}`, `AQI ${p.aqi} (${p.category.label}): ${p.headline}`, ''];
    p.routine.forEach((r) => lines.push(`• ${r.label}: ${r.action}`));
    p.sections.forEach((s) => { lines.push('', s.title.toUpperCase()); s.items.forEach((i) => lines.push(`- ${i}`)); });
    return lines.join('\n');
  }

  function render(data) {
    const { plan } = data;
    const dial = $('#aqi-dial');
    const pct = Math.min(100, (plan.aqi / 500) * 100);
    dial.style.setProperty('--c', plan.category.color);
    dial.style.setProperty('--p', '0');
    requestAnimationFrame(() => requestAnimationFrame(() => dial.style.setProperty('--p', String(pct))));
    dial.setAttribute('aria-label', `Air quality index ${plan.aqi}, ${plan.category.label}`);
    countUp($('#aqi-value'), plan.aqi);
    $('#aqi-value').style.color = plan.category.color;
    $('#place').textContent = data.place;
    $('#category').textContent = plan.category.label;
    $('#headline').textContent = plan.headline;
    const bits = [`Source: ${data.source}`];
    if (data.pm25 !== null) bits.push(`PM2.5 ${data.pm25} µg/m³`);
    if (data.pm10 !== null) bits.push(`PM10 ${data.pm10} µg/m³`);
    $('#meta').textContent = bits.join(' · ');

    renderForecast(data.hourly || [], plan.cleanestWindow);
    renderMembers(plan.members || []);
    renderRoutine(plan.routine || [], plan.forecastEstimated);
    renderCommute(plan.commute);
    lastData = data;

    $('#briefing-card').hidden = !data.briefing;
    renderRich($('#briefing'), data.briefing || '');
    $('#briefing').setAttribute('lang', (lastProfile && lastProfile.language) || 'en');

    const sections = $('#sections');
    sections.replaceChildren();
    plan.sections.forEach((s) => {
      const card = el('section', { class: 'card plan-section', 'aria-labelledby': `sec-${s.id}` });
      card.appendChild(el('h3', { id: `sec-${s.id}` }, s.title));
      const ul = el('ul');
      s.items.forEach((item) => ul.appendChild(el('li', null, item)));
      card.appendChild(ul);
      sections.appendChild(card);
    });

    results.hidden = false;
    $('#empty-state').hidden = true;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const profile = readProfile();
    const msg = clientValidate(profile);
    errorEl.textContent = msg;
    if (msg) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Analysing air quality…';
    results.setAttribute('aria-busy', 'true');
    document.querySelector('.results-col').classList.add('is-loading');
    try {
      lastProfile = profile;
      const data = await postJson('/api/plan', profile);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch { /* storage unavailable */ }
      render(data);
      loadHistory();
      $('#results-title').focus?.();
      results.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Generate plan';
      results.setAttribute('aria-busy', 'false');
      document.querySelector('.results-col').classList.remove('is-loading');
    }
  });

  async function ask(question) {
    if (!lastProfile || question.length < 3) return;
    const log = $('#chat-log');
    log.appendChild(el('div', { class: 'msg user' }, question));
    const pending = el('div', { class: 'msg bot' }, 'Thinking…');
    log.appendChild(pending);
    log.scrollTop = log.scrollHeight;
    try {
      const data = await postJson('/api/chat', { question, profile: lastProfile });
      renderRich(pending, data.text);
    } catch (err) {
      pending.textContent = err.message;
    }
    log.scrollTop = log.scrollHeight;
  }

  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#question');
    const q = input.value.trim();
    input.value = '';
    ask(q);
  });
  document.querySelectorAll('.chip-btn').forEach((b) => b.addEventListener('click', () => ask(b.dataset.q)));

  fetch('/api/health').then((r) => r.json()).then((d) => {
    $('#ai-status').textContent = d.ai ? 'Gemini AI: on' : 'Rule engine mode';
    $('#ai-status').classList.toggle('off', !d.ai);
  }).catch(() => { $('#ai-status').textContent = 'Offline'; });

  $('#locate-btn').addEventListener('click', () => {
    const hint = $('#city-hint');
    if (!('geolocation' in navigator)) { errorEl.textContent = 'Location is not supported in this browser – type your city instead.'; return; }
    hint.textContent = 'Getting your location…';
    navigator.geolocation.getCurrentPosition((pos) => {
      coords = { lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100 };
      form.elements.city.value = '';
      hint.textContent = 'Using your current location (rounded to ~1 km).';
      form.requestSubmit();
    }, () => {
      hint.textContent = 'Location permission denied – type your city instead.';
    }, { timeout: 10000, maximumAge: 600000 });
  });

  $('#print-btn').addEventListener('click', () => window.print());
  $('#share-btn').addEventListener('click', async () => {
    if (!lastData) return;
    const text = planAsText(lastData);
    try {
      if (navigator.share) await navigator.share({ title: 'AirWise plan', text });
      else { await navigator.clipboard.writeText(text); toast('Plan copied to clipboard'); }
    } catch { toast('Could not share – try printing instead'); }
  });

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove('show'); setTimeout(() => { t.hidden = true; }, 250); }, 2600);
  }

  /* ---------- History (server database) ---------- */
  async function api(url, opts) {
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  async function loadStats() {
    try {
      const s = await api('/api/stats');
      countUp($('#st-total'), s.total || 0);
      if (s.avgAqi === null) $('#st-avg').textContent = '–'; else countUp($('#st-avg'), s.avgAqi);
      if (s.maxAqi === null) $('#st-max').textContent = '–'; else countUp($('#st-max'), s.maxAqi);
      countUp($('#st-places'), s.places || 0);
      const list = $('#top-places');
      list.replaceChildren();
      (s.topPlaces || []).forEach((t) => {
        const li = el('li');
        li.append(el('span', null, t.place), el('span', { class: 'muted' }, `${t.n}× · avg ${t.avgAqi}`));
        list.appendChild(li);
      });
      $('#top-places-card').hidden = !(s.topPlaces || []).length;
    } catch { /* stats are optional */ }
  }

  let historyCache = [];
  async function loadHistory() {
    const rows = $('#history-rows');
    try {
      const { plans } = await api('/api/history');
      historyCache = plans;
      renderTrend(plans);
      renderDist(plans);
      rows.replaceChildren();
      $('#history-empty').hidden = plans.length > 0;
      $('#clear-history').disabled = !plans.length;
      $('#export-csv').disabled = !plans.length;
      plans.forEach((p) => {
        const tr = el('tr');
        tr.appendChild(el('td', { class: 'muted' }, toDate(p.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })));
        tr.appendChild(el('th', { scope: 'row' }, p.place));
        const td = el('td');
        const pill = el('span', { class: 'aqi-pill' }, String(p.aqi));
        pill.style.background = p.color || aqiColor(p.aqi);
        td.appendChild(pill);
        tr.appendChild(td);
        tr.appendChild(el('td', null, p.category));
        tr.appendChild(el('td', null, p.ai ? 'Yes' : '—'));
        const act = el('td', { class: 't-right' });
        const view = el('button', { type: 'button', class: 'link-btn', 'aria-label': `Open plan for ${p.place}` }, 'Open');
        view.addEventListener('click', () => openPlan(p.id));
        const del = el('button', { type: 'button', class: 'link-btn danger', 'aria-label': `Delete plan for ${p.place}` }, 'Delete');
        del.addEventListener('click', async () => {
          try { await api(`/api/history/${p.id}`, { method: 'DELETE' }); toast('Plan deleted'); } catch (e) { toast(e.message); }
          loadHistory();
        });
        act.append(view, del);
        tr.appendChild(act);
        rows.appendChild(tr);
      });
    } catch {
      $('#history-empty').textContent = 'Could not load history.';
    }
    loadStats();
  }

  async function openPlan(id) {
    try {
      const data = await api(`/api/history/${id}`);
      lastProfile = data.profile;
      fillForm({ ...data.profile, city: data.profile.city || data.place.split(',')[0] });
      form.elements.aqi.value = '';
      render(data);
      $('#planner').scrollIntoView();
    } catch (err) { toast(err.message); }
  }

  $('#clear-history').addEventListener('click', async () => {
    if (!confirm('Delete all saved plans? This cannot be undone.')) return;
    await api('/api/history', { method: 'DELETE' });
    toast('History cleared');
    loadHistory();
  });

  /* ---------- Insights: trend chart, category mix, CSV ---------- */
  const SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) {
    const n = document.createElementNS(SVGNS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
    return n;
  }
  function toDate(s) { return new Date(String(s).replace(' ', 'T') + 'Z'); }
  function shortDate(s, withTime) { return toDate(s).toLocaleString(undefined, withTime ? { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' } : { day: 'numeric', month: 'short' }); }

  function renderTrend(plans) {
    const box = $('#trend');
    box.replaceChildren();
    // Aggregate to a daily average when history spans several days; otherwise plot each plan.
    const recent = plans.slice(0, 60).reverse();
    const byDay = new Map();
    recent.forEach((p) => {
      const d = toDate(p.createdAt);
      const key = d.toDateString();
      if (!byDay.has(key)) byDay.set(key, { d, sum: 0, n: 0, places: new Set() });
      const g = byDay.get(key); g.sum += p.aqi; g.n += 1; g.places.add(p.place.split(',')[0]);
    });
    const daily = byDay.size >= 3;
    const pts = daily
      ? [...byDay.values()].slice(-14).map((g) => {
        const aqi = Math.round(g.sum / g.n);
        return { aqi, label: g.d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), tip: `${g.d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}: avg AQI ${aqi} · ${g.n} plan${g.n > 1 ? 's' : ''} (${[...g.places].join(', ')})` };
      })
      : recent.slice(-30).map((p) => ({ aqi: p.aqi, label: shortDate(p.createdAt, true), tip: `${p.place}: AQI ${p.aqi} (${p.category})` }));
    $('#trend-sub').textContent = daily ? `Daily average · last ${pts.length} days` : `Last ${pts.length} plans`;
    if (pts.length < 2) {
      box.appendChild(el('p', { class: 'chart-empty' }, pts.length ? 'Generate one more plan to see a trend line.' : 'No data yet – generate a plan to start tracking.'));
      return;
    }
    const W = Math.max(300, box.clientWidth), H = Math.max(220, box.clientHeight), L = 40, R = 14, T = 14, B = 28;
    const yMax = Math.ceil(Math.max(100, ...pts.map((p) => p.aqi)) / 100) * 100;
    const x = (i) => L + (i * (W - L - R)) / (pts.length - 1);
    const y = (v) => T + (H - T - B) * (1 - v / yMax);
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'trend-svg' });
    const defs = svg('defs');
    const g = svg('linearGradient', { id: 'tg', x1: 0, y1: 0, x2: 0, y2: 1 });
    g.append(svg('stop', { offset: '0%', 'stop-color': '#0f172a', 'stop-opacity': '.08' }), svg('stop', { offset: '100%', 'stop-color': '#0f172a', 'stop-opacity': '0' }));
    defs.appendChild(g);
    root.appendChild(defs);
    const stepY = yMax > 300 ? 100 : 50;
    for (let v = 0; v <= yMax; v += stepY) {
      root.appendChild(svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }));
      const t = svg('text', { x: L - 8, y: y(v) + 4, class: 'axis', 'text-anchor': 'end' });
      t.textContent = Math.round(v);
      root.appendChild(t);
    }
    [100, 200].filter((v) => v < yMax).forEach((v) => root.appendChild(svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: `threshold t${v}` })));
    // Smooth curve (Catmull-Rom → cubic Bézier)
    const P = pts.map((p, i) => [x(i), y(p.aqi)]);
    let line = `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}`;
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      line += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    root.appendChild(svg('path', { d: `${line}L${x(pts.length - 1)},${y(0)}L${x(0)},${y(0)}Z`, fill: 'url(#tg)' }));
    root.appendChild(svg('path', { d: line, class: 'trend-line' }));
    const every = Math.ceil(pts.length / Math.max(2, Math.floor((W - L - R) / 80)));
    pts.forEach((p, i) => {
      const c = svg('circle', { cx: x(i), cy: y(p.aqi), r: 4.5, fill: aqiColor(p.aqi), class: 'dot' });
      const tt = svg('title');
      tt.textContent = p.tip;
      c.appendChild(tt);
      root.appendChild(c);
      if (i % every === 0 || i === pts.length - 1) {
        if (i !== pts.length - 1 && pts.length - 1 - i < every) return;
        const lab = svg('text', { x: x(i), y: H - 6, class: 'axis', 'text-anchor': i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle' });
        lab.textContent = p.label;
        root.appendChild(lab);
      }
    });
    box.appendChild(root);
  }

  const CATS = [['Good', '#2e7d32'], ['Moderate', '#8a6d00'], ['Unhealthy for Sensitive Groups', '#b45309'], ['Unhealthy', '#b91c1c'], ['Very Unhealthy', '#7e22ce'], ['Hazardous', '#7f1d1d']];
  function renderDist(plans) {
    const list = $('#dist');
    list.replaceChildren();
    const total = plans.length || 1;
    CATS.forEach(([name, color]) => {
      const n = plans.filter((p) => p.category === name).length;
      const li = el('li');
      const head = el('div', { class: 'dist-head' });
      head.append(el('span', null, name === 'Unhealthy for Sensitive Groups' ? 'Sensitive groups' : name), el('span', { class: 'muted' }, `${n} · ${Math.round((n / total) * 100)}%`));
      const track = el('div', { class: 'dist-track' });
      const fill = el('div', { class: 'dist-fill' });
      fill.style.width = `${(n / total) * 100}%`;
      fill.style.background = color;
      track.appendChild(fill);
      li.append(head, track);
      list.appendChild(li);
    });
  }

  $('#export-csv').addEventListener('click', () => {
    if (!historyCache.length) return;
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [['id', 'date_utc', 'location', 'aqi', 'category', 'risk_level', 'ai'].join(',')];
    historyCache.forEach((p) => lines.push([p.id, p.createdAt, esc(p.place), p.aqi, esc(p.category), p.riskLevel ?? '', p.ai].join(',')));
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = el('a', { href: url, download: `airwise-history-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('CSV exported');
  });

  /* ---------- City comparison ---------- */
  $('#compare-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cities = ['#cmp1', '#cmp2', '#cmp3', '#cmp4'].map((s) => $(s).value.trim()).filter(Boolean);
    const err = $('#compare-error');
    const out = $('#compare-results');
    err.textContent = '';
    if (cities.length < 2) { err.textContent = 'Enter at least two cities.'; return; }
    const btn = $('#compare-btn');
    btn.disabled = true;
    btn.textContent = 'Fetching live data…';
    out.setAttribute('aria-busy', 'true');
    try {
      const { results: rs } = await api(`/api/compare?cities=${encodeURIComponent(cities.join(','))}`);
      out.replaceChildren();
      const okRs = rs.filter((r) => !r.error);
      const maxAqi = Math.max(100, ...okRs.map((r) => r.aqi));
      rs.forEach((r, i) => {
        const card = el('article', { class: `card cmp-card${r.error ? ' cmp-err' : ''}` });
        if (r.error) {
          card.append(el('h3', null, r.query), el('p', { class: 'muted' }, 'Location not found – check the spelling.'));
          out.appendChild(card);
          return;
        }
        const isBest = i === 0 && okRs.length > 1;
        const top = el('div', { class: 'cmp-top' });
        top.append(el('h3', null, r.place), el('span', { class: `cmp-rank${isBest ? ' best' : ''}` }, isBest ? 'Cleanest' : `#${i + 1}`));
        const val = el('div', { class: 'cmp-val' });
        const num = el('strong', null, String(r.aqi));
        num.style.color = r.color;
        val.append(num, el('span', null, 'US AQI'));
        const cat = el('p', { class: 'cmp-cat' }, r.category);
        const bar = el('div', { class: 'dist-track' });
        const fill = el('div', { class: 'dist-fill' });
        fill.style.width = `${(r.aqi / maxAqi) * 100}%`;
        fill.style.background = r.color;
        bar.appendChild(fill);
        const dl = el('dl', { class: 'cmp-meta' });
        const add = (k, v) => dl.append(el('dt', null, k), el('dd', null, v));
        add('PM2.5', r.pm25 !== null ? `${r.pm25} µg/m³` : '—');
        add('PM10', r.pm10 !== null ? `${r.pm10} µg/m³` : '—');
        if (r.cleanestHour) add('Cleanest hour (24h)', `${hourLabel(r.cleanestHour.time)} · AQI ${r.cleanestHour.aqi}`);
        card.append(top, val, cat, bar, dl);
        out.appendChild(card);
      });
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Compare cities';
      out.setAttribute('aria-busy', 'false');
    }
  });

  // Redraw the chart whenever its container changes size (layout, reveal, window resize).
  let resizeTimer, lastSize = '';
  if ('ResizeObserver' in window) {
    new ResizeObserver(([e]) => {
      const size = `${Math.round(e.contentRect.width)}x${Math.round(e.contentRect.height)}`;
      if (size === lastSize) return;
      lastSize = size;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => renderTrend(historyCache), 60);
    }).observe($('#trend'));
  }

  /* Highlight the nav link of the section currently on screen. */
  const navLinks = document.querySelectorAll('[data-nav]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${en.target.id}`));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('.page').forEach((sec) => io.observe(sec));
  }

  /* ---------- Count-up number animation ---------- */
  function countUp(node, to) {
    const target = Number(to) || 0;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || target === 0) { node.textContent = String(target); return; }
    const from = Number(node.textContent) || 0;
    const t0 = performance.now();
    const dur = 700;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      node.textContent = String(Math.round(from + (target - from) * e));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- Live AQI ticker on the home page ---------- */
  async function loadLiveTicker() {
    const list = $('#live-cities');
    const cities = ['Delhi', 'Mumbai', 'Bengaluru', 'Kolkata'];
    try {
      const { results: rs } = await api(`/api/compare?cities=${encodeURIComponent(cities.join(','))}`);
      list.replaceChildren();
      rs.filter((r) => !r.error).forEach((r) => {
        const li = el('li', { class: 'live-city' });
        const dot = el('i');
        dot.style.background = r.color;
        const name = el('span', { class: 'lc-name' }, r.place.split(',')[0]);
        const val = el('strong');
        countUp(val, r.aqi);
        const cat = el('span', { class: 'lc-cat' }, r.category === 'Unhealthy for Sensitive Groups' ? 'Sensitive groups' : r.category);
        li.append(dot, name, val, cat);
        list.appendChild(li);
      });
      $('#live-time').textContent = `Updated ${new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    } catch {
      $('#live-strip').hidden = true;
    }
  }

  /* ---------- Reveal-on-scroll ---------- */
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const targets = document.querySelectorAll('.section-head, .steps .step, .features .feature, .kpis .kpi, .insights-grid > .card, .compare-form, .hero-copy, .hero-panel');
    const rio = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); rio.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    targets.forEach((t, i) => { t.classList.add('reveal'); t.style.setProperty('--d', `${(i % 4) * 70}ms`); rio.observe(t); });
  }

  restoreProfile();
  loadHistory();
  loadLiveTicker();
})();
