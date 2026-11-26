/**
 * AirWise front-end entry point: wires the feature modules together and adds page-level behaviour.
 */

import { $, toast, prefersReducedMotion } from './dom.mjs';
import { api } from './api.mjs';
import { initPlanner, showPlan, fillForm } from './planner.mjs';
import { initInsights, loadHistory } from './insights.mjs';
import { initCompare, loadLiveTicker } from './compare.mjs';

async function openSavedPlan(id) {
  try {
    const data = await api.savedPlan(id);
    fillForm({ ...data.profile, city: data.profile.city || data.place.split(',')[0] });
    $('#aqi').value = '';
    showPlan(data, data.profile);
    $('#planner').scrollIntoView();
  } catch (err) {
    toast(err.message);
  }
}

async function showAiStatus() {
  const badge = $('#ai-status');
  try {
    const { ai } = await api.health();
    badge.textContent = ai ? 'Gemini AI: on' : 'Rule engine mode';
    badge.classList.toggle('off', !ai);
  } catch {
    badge.textContent = 'Offline';
    badge.classList.add('off');
  }
}

/** Highlight the nav link for the section currently in view. */
function trackActiveSection() {
  if (!('IntersectionObserver' in window)) return;
  const links = document.querySelectorAll('[data-nav]');
  const io = new IntersectionObserver((entries) => {
    entries.filter((en) => en.isIntersecting).forEach((en) => {
      links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${en.target.id}`));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('.page').forEach((sec) => io.observe(sec));
}

/** Fade sections in as they scroll into view (skipped when reduced motion is preferred). */
function revealOnScroll() {
  if (!('IntersectionObserver' in window) || prefersReducedMotion()) return;
  const targets = document.querySelectorAll('.section-head, .steps .step, .features .feature, .kpis .kpi, .insights-grid > .card, .compare-form, .hero-copy, .hero-panel');
  const io = new IntersectionObserver((entries) => {
    entries.filter((en) => en.isIntersecting).forEach((en) => { en.target.classList.add('in'); io.unobserve(en.target); });
  }, { rootMargin: '0px 0px -8% 0px' });
  targets.forEach((t, i) => {
    t.classList.add('reveal');
    t.style.setProperty('--d', `${(i % 4) * 70}ms`);
    io.observe(t);
  });
}

initPlanner({ onPlanSaved: loadHistory });
initInsights({ openPlan: openSavedPlan });
initCompare();
showAiStatus();
loadLiveTicker();
trackActiveSection();
revealOnScroll();
