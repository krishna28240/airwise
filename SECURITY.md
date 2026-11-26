# Security Policy

## Measures in AirWise
- Secrets only via environment variables (`.env` is git-ignored); the Gemini key is sent in a header, never in a URL or to the browser.
- Allow-list validation for every input, a 10 KB body limit, enforced JSON content type and text sanitisation.
- Strict Content-Security-Policy (self only, no inline scripts), HSTS, frame denial, nosniff, Referrer-Policy and Permissions-Policy.
- Per-IP rate limiting on `/api/*`.
- Static file serving is confined to `public/` (path-traversal protection).
- The frontend renders data with `textContent` only (no `innerHTML`), which prevents XSS.
- Prompt-injection mitigation: user text is wrapped in delimiters and treated as data; the system prompt restricts the model to the air-quality domain.
- Privacy: no database. The family profile stays in the user's browser, and geolocation is rounded to ~1 km.
- Zero runtime dependencies, and the container runs as a non-root user.

## Reporting a vulnerability
Please open a private security advisory on this repository rather than a public issue.
