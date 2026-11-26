# 🌫️ AirWise – Urban Air Quality Assistant

> A GenAI assistant that helps city families get through winter smog with a **personalised, hour-by-hour plan** for every household member, **low-emission routines** and **indoor air hacks**.

**Challenge:** PromptWars Virtual – Challenge 06
**Chosen vertical:** Urban Air Quality Assistant
**Persona:** a city household with children, elderly members and/or people with health conditions (asthma, COPD, heart disease, pregnancy) during the winter smog season.

## 🔗 Submission links

- 🔗 **Live:** https://airwise-o9w8.onrender.com/
- 💻 **GitHub:** https://github.com/krishna28240/airwise
- 📝 **Medium:** https://medium.com/@krishna28240/building-airwise-an-ai-powered-air-quality-assistant-for-families-facing-winter-smog-1b36854fd783
- 💼 **LinkedIn:** https://www.linkedin.com/in/krishna-chavan-2baa85371/

---

## ✨ Features

| Feature | What it does |
|---|---|
| 📍 **Live AQI by city or GPS** | Current US AQI, PM2.5 and PM10 plus a 24-hour hourly forecast from Open-Meteo (Copernicus CAMS – free, no key). Browser location is rounded to ~1 km and never stored. |
| ✍️ **Manual AQI fallback** | Type an AQI from any monitor. AirWise estimates the rest of the day from the typical winter pattern (overnight inversion peak, cleanest early afternoon) and labels it as an estimate. |
| 🧠 **Context-aware decision engine** | Computes a *personal risk level* from the AQI band and the household's vulnerability, then builds health alerts, an outdoor plan, mask guidance, indoor air hacks and low-emission routines. |
| ⏰ **Cleanest-window finder** | A sliding window over the forecast finds the cleanest 2 hours – the best time to air out the house or run errands. |
| 🗓️ **Hour-by-hour routine** | When to ventilate, when to run errands, when children can play, when the peak hits and when to run the purifier before bed. |
| 👨‍👩‍👧‍👦 **Per-member guidance** | Separate cards for children, elderly and adults with a status of *Normal day*, *Limit outdoors* or *Stay indoors*. |
| 🚇 **Cleaner-commute calculator** | Compares the family's commute with metro, bus, cycling and walking for **weekly CO₂** and **personal smog exposure**. |
| ✨ **Gemini AI briefing** | Google Gemini turns the plan into a warm daily briefing in 6 languages (English, Hindi, Marathi, Tamil, Bengali, Telugu). |
| 💬 **Ask AirWise chat** | Follow-up questions ("Can my son play cricket at 4 PM?") answered with the family's live plan as grounded context. |
| 🏙️ **City comparison** | Live AQI, PM2.5, PM10 and the cleanest hour for up to 4 cities, ranked cleanest first. |
| 📈 **Insights dashboard** | Every plan is stored in SQLite. KPIs, a daily-average AQI trend chart, category mix, most-checked locations, plan history (open / delete) and CSV export. |
| 🖨️ **Print / share** | A print stylesheet plus the native share sheet or clipboard copy for the family group chat. |

## 🧭 Approach & logic

AirWise uses a **hybrid "rules first, GenAI second" architecture**. Health advice must be dependable, so every decision is made by deterministic, unit-tested code; Gemini only explains and personalises it.

```
Browser (HTML/CSS + ES modules) ──► Node.js API ──► Open-Meteo (geocoding + air quality, cached 15 min)
                                        │
                                        ├─► Rule engine  (src/planner.js)  → deterministic, tested plan
                                        ├─► SQLite       (src/db.js)       → plan history and statistics
                                        └─► Gemini       (src/gemini.js)   → briefing + chat, grounded in the plan
```

1. **Validate** the household profile against strict allow-lists and ranges (`src/validate.js`).
2. **Get air data**: geocode the city and fetch current AQI plus the hourly forecast (`src/airdata.js`). A manual AQI skips the network call.
3. **Decide** (`src/planner.js`):
   - `vulnerability` = +1 if there are children or elderly members, +1 for a sensitive condition (asthma, COPD, heart disease, pregnancy).
   - `riskLevel` = the EPA AQI band, raised one band for vulnerable families (never on "Good" days).
   - `buildRoutine` (`src/routine.js`) turns the forecast into a timeline: the cleanest daytime 2-hour window for ventilation and errands, and the peak to avoid.
   - `memberAdvice` gives each person group its own status.
   - `compareCommute` (`src/emissions.js`) ranks alternatives by exposure reduction, then CO₂ saved, and hides unrealistic options (e.g. walking more than 3 km).
   - Advice depends on the risk level **and** the profile: no purifier → DIY box-fan filter; two-wheeler → highest-exposure warning; morning walk → inversion warning; biomass cooking → indoor smoke tips; home on a main road → rush-hour rule.
4. **Store** the plan in SQLite so it appears in Insights (`src/db.js`).
5. **Personalise** with Gemini: the structured plan is sent with a safety-scoped system prompt. Gemini rewrites and explains the advice; it does not invent facts.
6. **Degrade gracefully**: if Gemini or the air-data API fails, the user still gets the full rule-based plan.

## 🛠️ How it works

| Layer | Implementation |
|---|---|
| Server | Node.js 22 `http` module – zero runtime dependencies (`server.js`, `src/app.js`) |
| Database | SQLite via Node's built-in `node:sqlite` (`src/db.js`), file at `data/airwise.db` |
| Air data | Open-Meteo geocoding + air-quality APIs with a 15-minute TTL cache |
| AI | Google Gemini REST API, server-side only (`src/gemini.js`) |
| Front-end | Semantic HTML, one stylesheet and native ES modules – no framework, no build step |

**REST API**

| Method & path | Purpose |
|---|---|
| `GET /api/health` | Status and whether AI is enabled |
| `POST /api/plan` | Validate the profile, build the plan, add the AI briefing, store it |
| `POST /api/chat` | Grounded follow-up question |
| `GET /api/compare?cities=a,b` | Rank 2–4 cities by live AQI |
| `GET /api/history`, `GET /api/history/:id` | List plans / fetch one |
| `DELETE /api/history`, `DELETE /api/history/:id` | Clear all / delete one |
| `GET /api/stats` | Totals, averages and most-checked places |

**Front-end modules** (`public/js/`): `main.mjs` (entry point), `planner.mjs` (form, results, chat), `compare.mjs` (comparison + live ticker), `insights.mjs` (history, KPIs, CSV), `chart.mjs` (SVG trend chart), `api.mjs` (HTTP client), `dom.mjs` (safe DOM helpers) and `lib.mjs` (pure, unit-tested logic).

## 🔐 Security

- The **Gemini API key stays on the server** and is sent in the `x-goog-api-key` header – never in URLs or to the browser.
- **Allow-list validation**, text sanitisation, a 10 KB body limit and JSON content-type enforcement on every write endpoint.
- **Security headers**: strict CSP (no inline scripts, no third-party origins), HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy and Cross-Origin-Resource-Policy.
- **Rate limiting** (30 requests/min per IP) on endpoints that call external services or change data; cheap local reads are exempt. `X-Forwarded-For` is only trusted when `TRUST_PROXY=true`, and then only the proxy-appended hop, so the limit cannot be evaded by spoofing the header.
- **Parameterised SQL** for every database query; path-traversal protection on static files.
- The front-end writes data with `textContent` / DOM nodes only – AI output is parsed into text nodes, never `innerHTML` – preventing XSS.
- **Prompt-injection hardening**: user questions are wrapped in `<user_question>` tags and treated as data; the system prompt restricts the model to the air-quality domain.
- Zero runtime dependencies (no supply-chain risk in production) and a non-root Docker user. See [SECURITY.md](SECURITY.md).

## ⚡ Efficiency

- **Zero runtime dependencies** – fast start-up; the whole repository is about 240 KB (most of it the ESLint lock file).
- TTL caches for air data (15 min) and AI briefings (30 min) cut latency and API cost.
- In-memory static-file cache, gzip compression and `Cache-Control` headers.
- Upstream timeouts (`AbortSignal.timeout`) stop hanging requests; Gemini falls back to other models only when the primary is busy, rate-limited or retired (429, 5xx or 404).
- City lookups for comparison run in parallel (`Promise.allSettled`); the cleanest-window finder is an O(n) sliding window.
- The trend chart redraws only when its container actually changes size (`ResizeObserver`).

## ♿ Accessibility

- Semantic landmarks, a skip link, `fieldset`/`legend` groups and a visible label for every input.
- `aria-live` regions for results, chat, errors and toasts; errors are linked to their fields with `aria-describedby` and `aria-invalid`, and focus moves to the field to fix.
- The AQI gauge, forecast bars and trend chart have text alternatives (the chart exposes a written summary of its trend and peak).
- Colour is never the only signal: the category name is always written out. Text colours meet WCAG AA contrast.
- Visible focus rings, full keyboard support and interactive targets of at least 32 px (inputs and buttons 36–40 px).
- Respects `prefers-reduced-motion`; responsive from 320 px phones to desktop; print stylesheet.
- The AI briefing carries a `lang` attribute for correct screen-reader pronunciation in 6 languages.

## 🧪 Testing

**73 automated tests with 99% line coverage**, using Node's built-in test runner (`node:test`). **GitHub Actions CI** runs ESLint, a syntax check and the full test suite with coverage on Node 22 and 24 for every push.

| File | Covers |
|---|---|
| `tests/aqi.test.js` | EPA PM2.5 → AQI breakpoints, categories, cleanest-window algorithm |
| `tests/validate.test.js` | Defaults, allow-lists, ranges, sanitisation |
| `tests/planner.test.js` | Risk logic and personalisation (asthma, children, purifier, biomass, main road) |
| `tests/routine.test.js` | Winter-pattern estimation, midnight rollover, timeline adapting to forecast and profile |
| `tests/emissions.test.js` | CO₂ maths, alternative ranking, unrealistic-option filtering |
| `tests/compare.test.js` | City parsing, de-duplication, ranking, unknown cities |
| `tests/db.test.js` | SQLite persistence and the history, stats and compare endpoints |
| `tests/api.test.js` | End-to-end HTTP: plan, chat, 400/413/415/429/500, headers, path traversal |
| `tests/integrations.test.js` | Open-Meteo parsing and caching, Gemini request format, key handling, fallbacks |
| `tests/cache-security.test.js` | TTL cache, rate limiter, proxy-aware client IP |
| `tests/frontend-lib.test.js` | Front-end logic: validation, AI-text parsing (incl. XSS safety), CSV, trend series, chart geometry |

The UI was also verified end-to-end in a headless browser on desktop and mobile (plan, chat, compare, insights, open/delete).

## 🚀 Run locally

Requires **Node.js 22.13+** (for the built-in SQLite module). The app has no runtime dependencies.

```bash
git clone https://github.com/krishna28240/airwise.git
cd airwise
cp .env.example .env     # optional: add a free Gemini key from https://aistudio.google.com/apikey
npm start                # http://localhost:8080
```

```bash
npm install              # dev tools only (ESLint)
npm test                 # 73 tests
npm run test:coverage    # with coverage report
npm run lint             # ESLint
npm run check            # syntax-check every JS file (cross-platform)
npm run seed             # add demo history (npm run seed -- --reset wipes it first)
```

## ☁️ Deploy

**Render (free):** New → Blueprint → select this repo. `render.yaml` configures everything; add `GEMINI_API_KEY` in the dashboard. The free tier has an ephemeral disk, so `SEED_DEMO=true` refills demo history whenever the database starts empty.

**Docker / Cloud Run:**
```bash
docker build -t airwise . && docker run -p 8080:8080 -e GEMINI_API_KEY=xxx airwise
```

## 📁 Project structure

```
server.js              entry point (.env loader, optional demo seeding, graceful shutdown)
src/app.js             HTTP routing, static files, error handling
src/planner.js         context-aware decision engine
src/routine.js         hour-by-hour routine + winter-pattern estimator
src/aqi.js             EPA AQI maths + cleanest-window algorithm
src/emissions.js       commute CO₂ / exposure comparison
src/compare.js         multi-city comparison
src/airdata.js         Open-Meteo integration + caching
src/gemini.js          Gemini briefing + grounded chat with model fallback
src/db.js              SQLite persistence (plans, history, stats)
src/validate.js        input validation / sanitisation
src/security.js        security headers, rate limiter, client IP
src/cache.js           bounded TTL cache
src/time.js            time formatting helper
public/index.html      semantic, accessible page
public/styles.css      single stylesheet
public/js/             front-end ES modules (see "How it works")
scripts/seed.js        demo-data seeder
scripts/check.js       cross-platform syntax check
tests/                 73 unit + integration tests
.github/workflows/     CI (lint, check, tests on Node 22 & 24)
render.yaml, Dockerfile  deployment
SECURITY.md            security measures & reporting
```

## 📌 Assumptions

- AQI uses the **US EPA scale** (what Open-Meteo provides). India's NAQI uses different bands, but the protective actions are similar.
- Forecasts come from the CAMS model and are estimates; local monitors may differ, which is why manual AQI entry is supported.
- Households with children, elderly members or sensitive conditions are treated as higher risk, following WHO/EPA guidance.
- Advice is general health guidance, **not a medical diagnosis**; users are told to see a doctor for symptoms.
- Without a Gemini key the app still works fully in rule-based mode.
- CO₂ factors per passenger-km are approximations for Indian cities (car 170 g, two-wheeler 50 g, bus 30 g, metro 20 g); exposure multipliers are relative estimates from commuter-exposure studies. Both are for comparing options, not precise accounting.
- The manual-AQI forecast assumes a typical winter pattern, and the UI labels it as an estimate.
- Plan history is shared by everyone using a deployment (there are no user accounts); it stores no names or exact locations.

## 🤖 Gen AI usage

- **Google Gemini** (`gemini-3.8-flash`, falling back to `gemini-flash-latest` and `gemini-flash-lite-latest` when busy): personalised daily briefing in 6 languages and the grounded "Ask AirWise" chat.
- **AI-assisted development**: the project was designed, coded, tested and documented by prompting an AI coding assistant.

## License

MIT
