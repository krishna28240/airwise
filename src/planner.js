'use strict';

/**
 * Deterministic rule engine: turns (air quality + family profile) into a
 * personalized action plan. This is the "decision making based on user context"
 * layer. The GenAI layer then explains/personalizes this plan in natural language,
 * so advice stays grounded and safe even if the model is unavailable.
 */

const { categorize, cleanestWindow } = require('./aqi');
const { formatHour } = require('./time');
const { buildRoutine } = require('./routine');
const { compareCommute } = require('./emissions');

const SENSITIVE_CONDITIONS = new Set(['asthma', 'copd', 'heart_disease', 'pregnancy']);

/**
 * Work out how vulnerable the household is (0 = low, 2 = high).
 * @param {object} profile validated profile
 */
function vulnerability(profile) {
  let score = 0;
  if (profile.children > 0 || profile.elderly > 0) score += 1;
  if (profile.conditions.some((c) => SENSITIVE_CONDITIONS.has(c))) score += 1;
  return Math.min(score, 2);
}

/**
 * Effective risk level: AQI category level bumped up for vulnerable families.
 * @returns {number} 0–5
 */
function riskLevel(aqi, profile) {
  const base = categorize(aqi).level;
  const bump = base >= 1 ? vulnerability(profile) : 0;
  return Math.min(base + (bump > 0 ? 1 : 0), 5);
}

function outdoorAdvice(level, profile, window) {
  const items = [];
  const when = window ? ` Cleanest window today: ${formatHour(window.start)}–${formatHour(window.end)} (avg AQI ~${window.avgAqi}).` : '';
  if (level <= 1) {
    items.push(`Outdoor activity is fine for everyone.${when}`);
  } else if (level === 2) {
    items.push(`Keep outdoor exercise short and light; prefer the afternoon when smog lifts.${when}`);
  } else if (level === 3) {
    items.push(`Move workouts indoors. Limit outdoor time to essentials.${when}`);
  } else {
    items.push(`Avoid all non-essential outdoor activity today. Keep windows shut.${window ? ` If you must step out, go between ${formatHour(window.start)}–${formatHour(window.end)} (avg AQI ~${window.avgAqi}).` : ''}`);
  }
  if (profile.activities.includes('morning_walk') && level >= 2) {
    items.push('Skip the early-morning walk – winter inversions trap smog near the ground until ~10–11 AM. Walk indoors or in a mall corridor instead.');
  }
  if (profile.activities.includes('school_run') && level >= 3) {
    items.push('For the school run, fit children with snug N95/KN95 child masks and keep car windows closed with AC on recirculate.');
  }
  if ((profile.activities.includes('outdoor_play') || profile.activities.includes('outdoor_sports')) && level >= 3) {
    items.push('Swap outdoor play for indoor games (board games, dance, skipping in a purified room).');
  }
  if (profile.activities.includes('yoga') && level >= 2) {
    items.push('Do yoga/pranayama indoors in your cleanest room – deep breathing outdoors pulls more PM2.5 into the lungs.');
  }
  return items;
}

function maskAdvice(level, profile) {
  if (level <= 1) return [];
  const items = ['Use a well-fitted N95/KN95/FFP2 mask outdoors – cloth and surgical masks do not stop PM2.5.'];
  if (profile.children > 0) items.push('Children need child-size N95s; check for a tight seal and no gaps at the nose.');
  if (profile.conditions.includes('heart_disease') || profile.conditions.includes('copd')) {
    items.push('People with heart or lung disease should ask their doctor before using tight respirators for long periods.');
  }
  return items;
}

function indoorHacks(level, profile) {
  const items = [];
  if (level >= 2) {
    items.push('Keep doors and windows closed; air out for 10–15 minutes only during the cleanest window of the day.');
    items.push('Pick one "clean room" (usually a bedroom) for the most vulnerable family members and seal gaps with door snakes or tape.');
  }
  if (profile.hasPurifier) {
    items.push('Run your HEPA purifier on high in the clean room with doors closed; size it so CADR (m³/h) ≈ 5 × room volume.');
  } else if (level >= 2) {
    items.push('No purifier? Build a DIY Corsi-Rosenthal box: 4 MERV-13 filters taped around a box fan – roughly ₹3–4k and very effective.');
  }
  items.push('Damp-mop floors and wipe surfaces instead of sweeping or dusting, which re-suspends particles.');
  items.push('Avoid incense, mosquito coils, candles and dhoop indoors – they are major indoor PM2.5 sources.');
  if (profile.cooking === 'biomass') {
    items.push('Biomass cooking hugely raises indoor smoke – cook with a chimney/exhaust on, or switch to LPG/induction where possible.');
  } else {
    items.push('Turn on the kitchen exhaust while cooking and avoid deep-frying on high-smog days.');
  }
  if (profile.home === 'near_main_road') {
    items.push('Your home faces traffic – keep road-facing windows shut during rush hours (8–11 AM, 6–9 PM).');
  }
  items.push('Indoor plants look nice but do not measurably clean air – rely on filtration and ventilation timing.');
  return items;
}

function lowEmissionRoutines(level, profile) {
  const items = [];
  const map = {
    car: 'Carpool or combine errands into one trip; keep AC on recirculate and change the cabin filter every winter.',
    two_wheeler: 'Two-wheeler riders get the highest exposure – shift to metro/bus on bad days or wear an N95 under the helmet.',
    walk: 'Walk on side streets away from main roads – exposure drops sharply even one block away from traffic.',
    cycle: 'Cycle on low-traffic routes and avoid peak hours; ease off on very poor days.',
    bus: 'Prefer AC buses or metro on high-smog days and wait away from the road edge.',
    metro: 'Metro is one of the lowest-exposure ways to commute – great choice. Mask up on the walk to the station.',
    work_from_home: 'Working from home already cuts emissions and exposure – keep it up on very poor days.',
  };
  items.push(map[profile.commute]);
  items.push('Never burn leaves, garbage or plastic – report open burning to your municipal helpline or the Sameer app.');
  if (level >= 3) items.push('On severe days, postpone non-essential car trips and use online deliveries clubbed into a single order.');
  items.push('Switch off vehicle engines at red lights over 10 seconds – idling adds local emissions.');
  return items;
}

function healthAlerts(level, profile) {
  const items = [];
  const hasAsthma = profile.conditions.includes('asthma') || profile.conditions.includes('copd');
  if (hasAsthma && level >= 2) items.push('Keep reliever inhalers handy and follow your asthma action plan; seek care if breathlessness worsens.');
  if (profile.conditions.includes('heart_disease') && level >= 2) items.push('Watch for chest pain, palpitations or unusual fatigue – seek medical help immediately if they occur.');
  if (profile.conditions.includes('pregnancy') && level >= 2) items.push('Pregnant members should minimise outdoor exposure and sleep in the purified room.');
  if (profile.elderly > 0 && level >= 3) items.push('Check on elderly members twice daily for cough, wheeze or breathlessness.');
  if (profile.children > 0 && level >= 3) items.push('Children breathe faster and inhale more pollutants per kg – keep them indoors in the clean room.');
  if (level >= 4) items.push('Hydrate well and use saline nasal rinses; avoid strenuous activity even indoors without filtration.');
  return items;
}

/**
 * Per-member guidance cards so each person in the family gets advice for them.
 */
function memberAdvice(level, profile) {
  const cards = [];
  const sensitive = profile.conditions.filter((c) => SENSITIVE_CONDITIONS.has(c));
  if (profile.children > 0) {
    cards.push({
      who: profile.children === 1 ? 'Child' : `Children (${profile.children})`,
      status: level >= 3 ? 'stay_in' : level >= 2 ? 'limit' : 'ok',
      tip: level >= 3 ? 'Indoor play only; child-size N95 for the school run.' : level >= 2 ? 'Up to 30–45 min of light outdoor play in the cleanest window.' : 'Outdoor play is fine.',
    });
  }
  if (profile.elderly > 0) {
    cards.push({
      who: profile.elderly === 1 ? 'Elderly member' : `Elderly members (${profile.elderly})`,
      status: level >= 3 ? 'stay_in' : level >= 2 ? 'limit' : 'ok',
      tip: level >= 2 ? 'Skip early-morning walks; sleep in the purified room; watch for breathlessness.' : 'Normal routine; prefer afternoon walks.',
    });
  }
  if (profile.adults > 0) {
    const vulnerableAdult = sensitive.length > 0;
    cards.push({
      who: profile.adults === 1 ? 'Adult' : `Adults (${profile.adults})`,
      status: level >= 4 ? 'stay_in' : level >= 3 || (vulnerableAdult && level >= 2) ? 'limit' : 'ok',
      tip: level >= 3 ? 'Essential trips only, N95 outdoors, exercise indoors.' : level >= 2 ? 'Normal day, but mask up in traffic and avoid outdoor runs.' : 'No restrictions.',
    });
  }
  return cards;
}

/**
 * Build the full personalised plan.
 * @param {object} air  { aqi, pm25?, pm10?, hourly?: {time, aqi}[], source }
 * @param {object} profile validated profile
 */
function buildPlan(air, profile) {
  const category = categorize(air.aqi);
  const level = riskLevel(air.aqi, profile);
  const hourly = (air.hourly || []).slice(0, 24);
  const window = cleanestWindow(hourly, 2);
  const headline = [
    'Air is clean – enjoy the outdoors!',
    'Air is acceptable – very sensitive people should take it easy.',
    'Sensitive family members should limit outdoor time.',
    'Unhealthy air – move activities indoors and mask up.',
    'Very unhealthy – stay indoors and run filtration.',
    'Hazardous – emergency conditions. Stay inside your clean room.',
  ][level];

  return {
    aqi: air.aqi,
    category: { key: category.key, label: category.label, color: category.color },
    riskLevel: level,
    vulnerability: vulnerability(profile),
    headline,
    cleanestWindow: window,
    forecastEstimated: hourly.some((h) => h.estimated),
    members: memberAdvice(level, profile),
    routine: buildRoutine(hourly, profile),
    commute: compareCommute(profile.commute, profile.commuteKm),
    sections: [
      { id: 'health', title: 'Health alerts for your family', items: healthAlerts(level, profile) },
      { id: 'outdoor', title: 'Outdoor plan', items: outdoorAdvice(level, profile, window) },
      { id: 'mask', title: 'Masks', items: maskAdvice(level, profile) },
      { id: 'indoor', title: 'Indoor air hacks', items: indoorHacks(level, profile) },
      { id: 'routine', title: 'Low-emission routines', items: lowEmissionRoutines(level, profile) },
    ].filter((s) => s.items.length > 0),
  };
}

module.exports = { buildPlan, riskLevel, vulnerability, memberAdvice, formatHour };
