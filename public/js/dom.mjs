/**
 * DOM helpers. Data is always written with textContent / DOM nodes – never innerHTML – to prevent XSS.
 */

import { parseRich } from './lib.mjs';

/** @param {string} sel @returns {Element|null} */
export const $ = (sel) => document.querySelector(sel);

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Create an element with attributes and optional text.
 * @param {string} tag
 * @param {Record<string, string>|null} [attrs]
 * @param {string} [text]
 */
export function el(tag, attrs, text) {
  const node = document.createElement(tag);
  if (attrs) Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  if (text !== undefined) node.textContent = text;
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Create an SVG element with attributes. */
export function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
}

/** Render Gemini's Markdown subset (bold, bullets) into `node` using DOM nodes only. */
export function renderRich(node, text) {
  const appendRuns = (parent, runs) => runs.forEach((r) => parent.appendChild(r.bold ? el('strong', null, r.text) : document.createTextNode(r.text)));
  node.replaceChildren();
  for (const block of parseRich(text)) {
    if (block.type === 'ul') {
      const ul = el('ul', { class: 'rich-list' });
      block.items.forEach((runs) => { const li = el('li'); appendRuns(li, runs); ul.appendChild(li); });
      node.appendChild(ul);
    } else {
      const p = el('p', { class: 'rich-p' });
      appendRuns(p, block.items[0]);
      node.appendChild(p);
    }
  }
}

/** Animate a number from its current value to `to` (instant when reduced motion is preferred). */
export function countUp(node, to) {
  const target = Number(to) || 0;
  if (prefersReducedMotion() || target === 0) { node.textContent = String(target); return; }
  const from = Number(node.textContent) || 0;
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 700);
    node.textContent = String(Math.round(from + (target - from) * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

let toastTimer;
/** Show a short status message (announced via the toast's aria-live region). */
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.hidden = true; }, 250);
  }, 2600);
}

/** Toggle a button's busy state with a temporary label. */
export function setBusy(button, busy, busyLabel, idleLabel) {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : idleLabel;
}
