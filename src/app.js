'use strict';

/**
 * HTTP application (zero dependencies – Node core only, small attack surface).
 * Dependencies are injected so every route can be unit tested without network.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const { validateProfile, validateQuestion, ValidationError } = require('./validate');
const { buildPlan } = require('./planner');
const { estimateHourly } = require('./routine');
const airdata = require('./airdata');
const gemini = require('./gemini');
const { openDb } = require('./db');
const { parseCities, compareCities } = require('./compare');
const { applySecurityHeaders, RateLimiter, clientIp } = require('./security');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MAX_BODY_BYTES = 10 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function sendJson(req, res, status, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  maybeCompress(req, res, Buffer.from(body));
}

function maybeCompress(req, res, buf) {
  const accepts = String(req.headers['accept-encoding'] || '');
  if (buf.length > 1024 && accepts.includes('gzip')) {
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.end(zlib.gzipSync(buf));
  } else {
    res.end(buf);
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '');
    if (!type.includes('application/json')) {
      reject(Object.assign(new ValidationError('Content-Type must be application/json'), { status: 415 }));
      return;
    }
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (chunk) => {
      if (tooLarge) return; // discard the rest without buffering it
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        reject(Object.assign(new ValidationError('Request body too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new ValidationError('Malformed JSON'));
      }
    });
    req.on('error', reject);
  });
}

/** In-memory static file cache (files are tiny) – avoids disk reads per request. */
const staticCache = new Map();
function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }
  let file = staticCache.get(filePath);
  if (!file) {
    try {
      file = fs.readFileSync(filePath);
      staticCache.set(filePath, file);
    } catch {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Not found');
      return;
    }
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME[path.extname(filePath)] || 'application/octet-stream');
  res.setHeader('Cache-Control', rel === 'index.html' ? 'no-cache' : 'public, max-age=3600');
  maybeCompress(req, res, file);
}

/**
 * Resolve air data: live lookup by city, or manual AQI override.
 */
async function resolveAir(profile, deps) {
  if (profile.aqi !== undefined) {
    const hour = profile.localHour ?? deps.now().getHours();
    const date = deps.now().toISOString().slice(0, 10);
    return {
      place: profile.city || 'Your area',
      aqi: profile.aqi,
      hourly: estimateHourly(profile.aqi, hour, date),
      source: 'Manual entry (forecast estimated from typical winter pattern)',
    };
  }
  return deps.getAirQuality(profile.coords || profile.city);
}

/**
 * Create the request handler.
 * @param {object} [overrides] injectable deps for testing
 */
function createHandler(overrides = {}) {
  const deps = {
    getAirQuality: airdata.getAirQuality,
    briefing: gemini.briefing,
    answer: gemini.answer,
    aiEnabled: gemini.isEnabled,
    limiter: new RateLimiter({ windowMs: 60000, max: 30 }),
    now: () => new Date(),
    startedAt: Date.now(),
    ...overrides,
  };
  if (!deps.db) deps.db = openDb(process.env.NODE_TEST_CONTEXT ? ':memory:' : undefined);

  return async function handler(req, res) {
    applySecurityHeaders(res);
    const url = new URL(req.url, 'http://localhost');
    const route = `${req.method} ${url.pathname}`;

    try {
      if (url.pathname.startsWith('/api/')) {
        // Rate-limit expensive/mutating calls; cheap local DB reads are exempt.
        const cheapRead = req.method === 'GET' && /^\/api\/(health|stats|history(\/\d+)?)$/.test(url.pathname);
        if (!cheapRead && !deps.limiter.allow(clientIp(req))) {
          sendJson(req, res, 429, { error: 'Too many requests – please wait a minute.' });
          return;
        }
        switch (route) {
          case 'GET /api/health':
            sendJson(req, res, 200, { status: 'ok', ai: deps.aiEnabled(), uptimeSec: Math.round((Date.now() - deps.startedAt) / 1000) });
            return;
          case 'POST /api/plan': {
            const profile = validateProfile(await readJsonBody(req));
            const air = await resolveAir(profile, deps);
            const plan = buildPlan(air, profile);
            const aiBriefing = await deps.briefing(plan, profile, air.place);
            const result = {
              place: air.place,
              source: air.source,
              pm25: air.pm25 ?? null,
              pm10: air.pm10 ?? null,
              hourly: air.hourly || [],
              plan,
              briefing: aiBriefing,
              ai: Boolean(aiBriefing),
            };
            result.id = deps.db.savePlan(result, profile);
            sendJson(req, res, 200, result);
            return;
          }
          case 'POST /api/chat': {
            const body = await readJsonBody(req);
            const question = validateQuestion(body);
            const profile = validateProfile(body.profile);
            const air = await resolveAir(profile, deps);
            const plan = buildPlan(air, profile);
            const reply = await deps.answer(question, plan, profile, air.place);
            sendJson(req, res, 200, reply);
            return;
          }
          case 'GET /api/history':
            sendJson(req, res, 200, { plans: deps.db.listPlans(Number(url.searchParams.get('limit')) || 50) });
            return;
          case 'DELETE /api/history':
            sendJson(req, res, 200, { deleted: deps.db.clearPlans() });
            return;
          case 'GET /api/compare': {
            const cities = parseCities(url.searchParams.get('cities'));
            sendJson(req, res, 200, { results: await compareCities(cities, deps.getAirQuality) });
            return;
          }
          case 'GET /api/stats':
            sendJson(req, res, 200, deps.db.stats());
            return;
          default: {
            const m = url.pathname.match(/^\/api\/history\/(\d{1,9})$/);
            if (m && req.method === 'GET') {
              const plan = deps.db.getPlan(Number(m[1]));
              sendJson(req, res, plan ? 200 : 404, plan || { error: 'Plan not found' });
              return;
            }
            if (m && req.method === 'DELETE') {
              const ok = deps.db.deletePlan(Number(m[1]));
              sendJson(req, res, ok ? 200 : 404, ok ? { deleted: 1 } : { error: 'Plan not found' });
              return;
            }
            sendJson(req, res, 404, { error: 'Not found' });
            return;
          }
        }
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET, HEAD');
        res.end();
        return;
      }
      serveStatic(req, res, url.pathname);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error('[server]', err);
      if (!res.headersSent) {
        sendJson(req, res, status, {
          error: status >= 500 ? 'Could not fetch air data right now. Enter your AQI manually and try again.' : err.message,
        });
      }
    }
  };
}

function createServer(overrides) {
  return http.createServer(createHandler(overrides));
}

module.exports = { createServer, createHandler };
