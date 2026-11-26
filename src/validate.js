'use strict';

/**
 * Strict input validation & sanitisation. Every request body passes through here
 * so the rest of the app only ever sees well-typed, bounded data (allow-listing).
 */

const ENUMS = Object.freeze({
  commute: ['walk', 'cycle', 'two_wheeler', 'car', 'bus', 'metro', 'work_from_home'],
  home: ['apartment', 'independent_house', 'near_main_road'],
  conditions: ['asthma', 'copd', 'heart_disease', 'allergies', 'pregnancy', 'diabetes'],
  activities: ['morning_walk', 'outdoor_sports', 'school_run', 'outdoor_play', 'yoga', 'market_errands'],
  cooking: ['lpg', 'induction', 'biomass'],
  language: ['en', 'hi', 'mr', 'ta', 'bn', 'te'],
});

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

/** Remove control chars / angle brackets and clamp length. */
function cleanText(value, max = 200) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new ValidationError('Expected text input');
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function int(value, { min, max, def, name }) {
  if (value === undefined || value === null || value === '') return def;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ValidationError(`${name} must be a whole number between ${min} and ${max}`);
  }
  return n;
}

function oneOf(value, allowed, def, name) {
  if (value === undefined || value === null || value === '') return def;
  if (!allowed.includes(value)) throw new ValidationError(`Invalid ${name}`);
  return value;
}

function listOf(value, allowed, name) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > allowed.length) throw new ValidationError(`Invalid ${name}`);
  return [...new Set(value.filter((v) => allowed.includes(v)))];
}

function coords(lat, lon) {
  if ((lat === undefined || lat === null || lat === '') && (lon === undefined || lon === null || lon === '')) return null;
  const la = Number(lat);
  const lo = Number(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) {
    throw new ValidationError('Invalid location coordinates');
  }
  // Round to ~1 km – enough for air data, avoids handling precise locations.
  return { lat: Math.round(la * 100) / 100, lon: Math.round(lo * 100) / 100 };
}

/**
 * Validate a family profile.
 * @param {object} body raw JSON body
 */
function validateProfile(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Invalid request body');
  const profile = {
    city: cleanText(body.city, 80),
    adults: int(body.adults, { min: 0, max: 12, def: 2, name: 'adults' }),
    children: int(body.children, { min: 0, max: 12, def: 0, name: 'children' }),
    elderly: int(body.elderly, { min: 0, max: 12, def: 0, name: 'elderly' }),
    conditions: listOf(body.conditions, ENUMS.conditions, 'conditions'),
    activities: listOf(body.activities, ENUMS.activities, 'activities'),
    commute: oneOf(body.commute, ENUMS.commute, 'bus', 'commute'),
    home: oneOf(body.home, ENUMS.home, 'apartment', 'home'),
    cooking: oneOf(body.cooking, ENUMS.cooking, 'lpg', 'cooking'),
    hasPurifier: body.hasPurifier === true,
    language: oneOf(body.language, ENUMS.language, 'en', 'language'),
    aqi: int(body.aqi, { min: 0, max: 999, def: undefined, name: 'aqi' }),
    commuteKm: int(body.commuteKm, { min: 0, max: 100, def: 0, name: 'commute distance' }),
    localHour: int(body.localHour, { min: 0, max: 23, def: undefined, name: 'localHour' }),
    coords: coords(body.lat, body.lon),
  };
  if (profile.adults + profile.children + profile.elderly === 0) {
    throw new ValidationError('Add at least one family member');
  }
  if (!profile.city && profile.aqi === undefined && !profile.coords) {
    throw new ValidationError('Enter a city or a current AQI value');
  }
  return profile;
}

/** Validate a chat question. */
function validateQuestion(body) {
  if (!body || typeof body !== 'object') throw new ValidationError('Invalid request body');
  const question = cleanText(body.question, 500);
  if (question.length < 3) throw new ValidationError('Please type a question');
  return question;
}

module.exports = { validateProfile, validateQuestion, cleanText, ValidationError, ENUMS };
