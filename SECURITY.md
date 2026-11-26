# Security Policy

## Measures in AirWise
- **Secrets** only via environment variables (`.env` is git-ignored). The Gemini key is sent in the `x-goog-api-key` header – never in a URL, a log or the browser.
- **Input validation**: allow-lists and ranges for every field, text sanitisation, a 10 KB body limit and enforced JSON content type (`src/validate.js`).
- **HTTP headers**: strict Content-Security-Policy (self only, no inline scripts), HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy, Cross-Origin-Resource-Policy and `X-Permitted-Cross-Domain-Policies: none` (`src/security.js`).
- **Rate limiting**: 30 requests/min per IP on endpoints that call external services or change data. `X-Forwarded-For` is only trusted when `TRUST_PROXY=true` (set on Render), and then only the right-most, proxy-appended hop – so clients cannot evade the limit by spoofing the header.
- **Database**: SQLite with parameterised statements only (no string-built SQL). Plans store the household profile (counts, conditions, activities) and air data – no names, emails or exact coordinates.
- **Static files** are confined to `public/` (path-traversal protection).
- **XSS**: the front-end writes data with `textContent` / DOM nodes only; Gemini's Markdown is parsed into text nodes, never `innerHTML`.
- **Prompt injection**: user questions are wrapped in `<user_question>` delimiters and treated as data; the system prompt restricts the model to the air-quality domain, and delimiter tags are stripped from model output.
- **Privacy**: browser geolocation is rounded to ~1 km before it is sent and is never stored.
- **Supply chain**: zero runtime dependencies (ESLint is a dev-only tool), and the Docker image runs as a non-root user.

## Reporting a vulnerability
Please open a private security advisory on this repository rather than a public issue.
