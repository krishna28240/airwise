'use strict';

/** Security helpers: HTTP security headers + a simple per-IP rate limiter. */

const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
});

function applySecurityHeaders(res) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
}

/** Fixed-window rate limiter keyed by client IP. */
class RateLimiter {
  constructor({ windowMs = 60000, max = 30 } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map();
  }

  /** @returns {boolean} true if the request is allowed */
  allow(key, now = Date.now()) {
    const entry = this.hits.get(key);
    if (!entry || now - entry.start >= this.windowMs) {
      this.hits.set(key, { start: now, count: 1 });
      if (this.hits.size > 10000) this.prune(now);
      return true;
    }
    entry.count += 1;
    return entry.count <= this.max;
  }

  prune(now = Date.now()) {
    for (const [k, v] of this.hits) if (now - v.start >= this.windowMs) this.hits.delete(k);
  }
}

/**
 * Resolve the client IP for rate limiting.
 * X-Forwarded-For is only trusted when TRUST_PROXY=true (e.g. behind Render's proxy), and then the
 * right-most entry is used because it is the one appended by the trusted proxy – the left-most
 * entries are client-controlled and could be spoofed to evade the rate limit.
 * @param {import('node:http').IncomingMessage} req
 * @param {boolean} [trustProxy]
 * @returns {string}
 */
function clientIp(req, trustProxy = process.env.TRUST_PROXY === 'true') {
  const fwd = req.headers['x-forwarded-for'];
  if (trustProxy && typeof fwd === 'string' && fwd.trim()) {
    const hops = fwd.split(',').map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return req.socket?.remoteAddress || 'unknown';
}

module.exports = { applySecurityHeaders, RateLimiter, clientIp, SECURITY_HEADERS };
