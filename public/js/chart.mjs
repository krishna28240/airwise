/**
 * AQI trend chart (inline SVG). The SVG is decorative; the container carries a text summary for screen readers.
 */

import { el, svg } from './dom.mjs';
import { aqiColor, trendSeries, niceAxis, smoothPath } from './lib.mjs';

const PAD = { left: 40, right: 14, top: 14, bottom: 28 };
const DAY = { day: 'numeric', month: 'short' };
const DAY_TIME = { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' };

function describe(p, daily) {
  if (daily) {
    const day = p.date.toLocaleDateString(undefined, { weekday: 'short', ...DAY });
    return `${day}: avg AQI ${p.aqi} · ${p.count} plan${p.count > 1 ? 's' : ''} (${p.places.join(', ')})`;
  }
  return `${p.places[0]}: AQI ${p.aqi}`;
}

/**
 * Draw the trend for `plans` into `box`.
 * @param {HTMLElement} box chart container (sized by CSS)
 * @param {HTMLElement} subtitle element that receives the "Daily average · last N days" caption
 * @param {object[]} plans history rows, newest first
 */
export function renderTrend(box, subtitle, plans) {
  box.replaceChildren();
  const { daily, points } = trendSeries(plans);
  const labelOf = (p) => p.date.toLocaleString(undefined, daily ? DAY : DAY_TIME);
  subtitle.textContent = daily ? `Daily average · last ${points.length} days` : `Last ${points.length} plans`;
  if (points.length < 2) {
    box.removeAttribute('aria-label');
    box.appendChild(el('p', { class: 'chart-empty' }, points.length ? 'Generate one more plan to see a trend line.' : 'No data yet – generate a plan to start tracking.'));
    return;
  }

  const W = Math.max(300, box.clientWidth);
  const H = Math.max(220, box.clientHeight);
  const { top, step } = niceAxis(Math.max(...points.map((p) => p.aqi)));
  const x = (i) => PAD.left + (i * (W - PAD.left - PAD.right)) / (points.length - 1);
  const y = (v) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / top);

  const first = points[0];
  const last = points[points.length - 1];
  const peak = points.reduce((m, q) => (q.aqi > m.aqi ? q : m));
  box.setAttribute('aria-label', `AQI trend, ${daily ? 'daily average' : 'per plan'} over ${points.length} points: from ${first.aqi} (${labelOf(first)}) to ${last.aqi} (${labelOf(last)}); peak ${peak.aqi} on ${labelOf(peak)}.`);

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'trend-svg', 'aria-hidden': 'true', focusable: 'false' });
  const gradient = svg('linearGradient', { id: 'tg', x1: 0, y1: 0, x2: 0, y2: 1 });
  gradient.append(svg('stop', { offset: '0%', 'stop-color': '#0f172a', 'stop-opacity': '.08' }), svg('stop', { offset: '100%', 'stop-color': '#0f172a', 'stop-opacity': '0' }));
  root.appendChild(svg('defs')).appendChild(gradient);

  for (let v = 0; v <= top; v += step) {
    root.appendChild(svg('line', { x1: PAD.left, x2: W - PAD.right, y1: y(v), y2: y(v), class: 'grid' }));
    root.appendChild(svg('text', { x: PAD.left - 8, y: y(v) + 4, class: 'axis', 'text-anchor': 'end' })).textContent = String(v);
  }
  [100, 200].filter((v) => v < top).forEach((v) => root.appendChild(svg('line', { x1: PAD.left, x2: W - PAD.right, y1: y(v), y2: y(v), class: `threshold t${v}` })));

  const line = smoothPath(points.map((p, i) => [x(i), y(p.aqi)]));
  root.appendChild(svg('path', { d: `${line}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z`, fill: 'url(#tg)' }));
  root.appendChild(svg('path', { d: line, class: 'trend-line' }));

  const every = Math.ceil(points.length / Math.max(2, Math.floor((W - PAD.left - PAD.right) / 80)));
  points.forEach((p, i) => {
    const dot = svg('circle', { cx: x(i), cy: y(p.aqi), r: 4.5, fill: aqiColor(p.aqi), class: 'dot' });
    dot.appendChild(svg('title')).textContent = describe(p, daily);
    root.appendChild(dot);
    const isLast = i === points.length - 1;
    const tooCloseToLast = !isLast && points.length - 1 - i < every;
    if ((i % every === 0 || isLast) && !tooCloseToLast) {
      const anchor = i === 0 ? 'start' : isLast ? 'end' : 'middle';
      root.appendChild(svg('text', { x: x(i), y: H - 6, class: 'axis', 'text-anchor': anchor })).textContent = labelOf(p);
    }
  });
  box.appendChild(root);
}
