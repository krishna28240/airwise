# 🌫️ AirWise – Urban Air Quality Assistant

> A GenAI assistant that helps families beat severe winter smog with **personalised low-emission routines** and **indoor air hacks**.

**Challenge:** PromptWars Virtual – Challenge 06
**Chosen vertical:** Urban Air Quality Assistant for families (persona: a city household with children, elderly members and/or people with health conditions during winter smog season)

## 🔗 Submission Links

- 🔗 **Live:** https://airwise-o9w8.onrender.com/
- 💻 **GitHub:** https://github.com/krishna28240/airwise
- 📝 **Medium:** https://medium.com/@krishna28240/building-airwise-an-ai-powered-air-quality-assistant-for-families-facing-winter-smog-1b36854fd783
- 💼 **LinkedIn:** https://www.linkedin.com/in/krishna-chavan-2baa85371/

---

## ✨ Features

| Feature | What it does |
|---|---|
| 📍 **Live AQI by city or GPS** | Fetches current US-AQI, PM2.5 and PM10 plus a 24-hour hourly forecast (Open-Meteo / Copernicus CAMS – free, no key). |
| 📡 **Use my location** | One tap uses browser geolocation. Coordinates are rounded to about 1 km and never stored. |
| ✍️ **Manual AQI fallback** | Type an AQI from any monitor or app. AirWise estimates the rest of the day from the typical winter smog pattern (inversion peak overnight, lowest early afternoon). |
| 🗓️ **Hour-by-hour smog-day routine** | A personal timeline: when to air out the house, when to run errands, when kids can play, when peak smog hits, when to run the purifier before bed, and whether the morning walk or yoga should move indoors. |
| 👨‍👩‍👧‍👦 **Per-member guidance** | Separate cards for children, elderly and adults, each with a status of *Normal day*, *Limit outdoors* or *Stay indoors*. |
| 🚇 **Cleaner-commute calculator** | Compares the family's commute against metro, bus, cycling and walking for **weekly CO₂** and **personal smog exposure**, so the low-emission routine comes with real numbers. |
| 🖨️ **Print / share** | A print-friendly plan, plus a native share sheet or clipboard copy to send it to the family WhatsApp group. |
| 👨‍👩‍👧 **Family profile** | Adults, children, elderly, conditions (asthma, COPD, heart disease, pregnancy…), daily activities, commute, home type, cooking fuel and purifier ownership. |
| 🧠 **Context-aware decision engine** | Works out a *personal risk level* (AQI band + family vulnerability) and builds a plan with health alerts, an outdoor plan, mask guidance, indoor air hacks and low-emission routines. |
| ⏰ **Cleanest-window finder** | Uses a sliding window to find the cleanest 2 hours in the next 24h, the best time for errands or airing out the house. |
| ✨ **Gemini AI briefing** | Google Gemini turns the plan into a warm daily briefing that names the specific family members it applies to. |
| 💬 **Ask AirWise chat** | Follow-up Q&A ("Can my son play cricket at 4 PM?") grounded in the family's live context. |
| 🌐 **6 languages** | English, Hindi, Marathi, Tamil, Bengali and Telugu for the AI output. |
| 💾 **SQLite database + history** | Every plan is saved in a server-side SQLite database (`data/airwise.db`, built into Node – no install). The History page lists, reopens and deletes saved plans and shows AQI stats. Endpoints: `GET/DELETE /api/history`, `GET/DELETE /api/history/:id`, `GET /api/stats`. |
| 🏙️ **City comparison** | Compare live AQI, PM2.5, PM10 and the cleanest upcoming hour across up to 4 cities, ranked cleanest first (`GET /api/compare?cities=a,b,c`). |
| 📈 **Insights dashboard** | KPI cards, an AQI trend chart, category mix, most-checked locations, plan history (open/delete) and CSV export. |

## 🧭 Approach & logic

AirWise uses a **hybrid "rules + GenAI" architecture**:

```
Browser (HTML/CSS/JS) ──► Node.js API ──► Open-Meteo (geocode + air quality, cached 15 min)
                              │
                              ├─► Rule engine (src/planner.js)  → deterministic, safe, testable plan
                              └─► Gemini (src/gemini.js)        → personalised briefing + chat, grounded in the plan
```

1. **Validate** the family profile against strict allow-lists (`src/validate.js`).
2. **Get air data**: geocode the city, then fetch current AQI and the hourly forecast. A manual AQI skips the network call.
3. **Decide** (`src/planner.js`):
   - `vulnerability` = +1 if there are children or elderly members, +1 if there is a sensitive condition (asthma, COPD, heart disease, pregnancy).
   - `riskLevel` = EPA AQI band level, bumped one band for vulnerable families (never on "Good" days).
   - `buildRoutine` (`src/routine.js`) turns the hourly forecast into a timeline. It picks the cleanest daytime 2-hour window for ventilation and errands and finds the peak to avoid.
   - `memberAdvice` gives each person group its own status.
   - `compareCommute` (`src/emissions.js`) ranks alternatives by exposure reduction, then by CO₂ saved. It hides unrealistic options, such as walking more than 3 km.
   - Each section's advice is chosen from the risk level **and** the profile. Examples: no purifier → DIY Corsi-Rosenthal box; two-wheeler commute → highest-exposure warning; morning walk → winter inversion warning; biomass cooking → indoor smoke tips; home on a main road → rush-hour window rule.
4. **Personalise with GenAI**: the structured plan and context are sent to Gemini with a safety-scoped system prompt. Gemini rewrites, ranks and explains the advice; it does not make up facts.
5. **Degrade gracefully**: if Gemini or the air API fails, the user still gets the full rule-based plan.

**Why hybrid?** Health advice must be reliable. The rule engine guarantees correct, testable recommendations, and Gemini adds personalisation, language support and conversation.

## 🔐 Security
- API key stays **server-side** and is sent in the `x-goog-api-key` header, never in URLs or to the browser.
- Strict **allow-list validation**, text sanitisation, 10 KB body limit and JSON content-type enforcement.
- **Security headers**: strict CSP (no inline scripts, no third-party origins), HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy and Permissions-Policy.
- **Rate limiting** per IP (30 requests/min) on the API.
- **Path-traversal protection** on static files.
- Frontend renders data with `textContent` only, which prevents XSS.
- **Prompt-injection hardening**: user questions are wrapped in `<user_question>` tags and treated as data, and the system prompt limits the model to the air-quality domain.
- Zero runtime dependencies, so no third-party supply-chain risk. The Docker image runs as a non-root user.

## ⚡ Efficiency
- **Zero dependencies**: Node core only, so startup is fast and the repo is tiny (< 100 KB).
- TTL caches for air data (15 min) and AI briefings (30 min) cut latency and API cost.
- In-memory static file cache, gzip compression and `Cache-Control` headers.
- Upstream timeouts (`AbortSignal.timeout`) stop requests from hanging, and Gemini calls retry once with backoff only on 429/5xx.
- O(n) sliding-window algorithm for the cleanest-window finder.

## ♿ Accessibility
- Print stylesheet, a semantic data table with caption and scoped headers, and a `lang` attribute on the AI output for correct screen-reader pronunciation.
- Semantic landmarks, a skip link, `fieldset`/`legend` groups and labelled inputs throughout.
- `aria-live` regions for results, chat and errors. The AQI dial and forecast bars have text labels.
- Colour is never the only signal: the category name is always written out, with WCAG-AA contrast colours.
- Visible focus rings, 44 px touch targets, full keyboard support.
- Respects `prefers-color-scheme` (dark mode) and `prefers-reduced-motion`. Responsive on mobile.
- Advice in 6 Indian languages.

## 🧪 Testing
**52 automated tests, ~98% line coverage**, using Node's built-in test runner (`node:test`) with no extra packages. **GitHub Actions CI** runs a syntax check, the tests and coverage on Node 20 and 22 for every push.

| File | Covers |
|---|---|
| `tests/aqi.test.js` | EPA PM2.5→AQI breakpoints, categories, cleanest-window algorithm |
| `tests/validate.test.js` | Defaults, allow-lists, ranges, sanitisation |
| `tests/planner.test.js` | Risk logic and personalisation (asthma, kids, purifier, biomass, roads) |
| `tests/api.test.js` | End-to-end HTTP: plan, chat, 400/413/415/429/500, headers, path traversal |
| `tests/integrations.test.js` | Open-Meteo parsing and caching, Gemini request format, key handling, fallbacks |
| `tests/routine.test.js` | Winter-pattern estimation, midnight rollover, timeline adapting to forecast and profile |
| `tests/emissions.test.js` | CO₂ maths, alternative ranking, unrealistic-option filtering |
| `tests/cache-security.test.js` | TTL cache, rate limiter, client IP |

```bash
npm test               # run all tests
npm run test:coverage  # with coverage report
npm run check          # syntax check
```

## 🚀 Run locally
Requires **Node.js 20+**. There is nothing to install.
```bash
git clone https://github.com/<your-username>/airwise.git
cd airwise
cp .env.example .env        # add your free Gemini key from https://aistudio.google.com/apikey
npm start                   # http://localhost:8080
```

## ☁️ Deploy (free)
**Render.com (one click):** New → Blueprint → select this repo. `render.yaml` sets everything up; you only paste `GEMINI_API_KEY`.

**Any Docker host / Google Cloud Run:**
```bash
docker build -t airwise . && docker run -p 8080:8080 -e GEMINI_API_KEY=xxx airwise
```

## 📁 Project structure
```
server.js            entry point (.env loader, graceful shutdown)
src/app.js           HTTP routing, static serving, error handling
src/planner.js       context-aware decision engine
src/aqi.js           EPA AQI maths + cleanest-window algorithm
src/routine.js       hour-by-hour smog-day routine + winter-pattern estimator
src/emissions.js     commute CO2 / exposure comparison
src/time.js          time formatting helper
src/airdata.js       Open-Meteo integration + caching
src/gemini.js        Gemini briefing + grounded chat
src/validate.js      input validation / sanitisation
src/security.js      security headers + rate limiter
src/cache.js         bounded TTL cache
public/              accessible frontend (HTML/CSS/vanilla JS)
tests/               52 unit + integration tests
.github/workflows/   CI (Node 20 & 22)
render.yaml          one-click Render deploy
Dockerfile           container deploy (Cloud Run etc.)
SECURITY.md          security measures & reporting
```

## 📌 Assumptions
- AQI uses the **US EPA scale** (what Open-Meteo provides). India's NAQI uses different bands, but the protective actions are similar.
- Forecast data comes from the CAMS model and is an estimate. Local monitors may differ, which is why manual AQI entry is supported.
- Families with children, elderly members or sensitive conditions are treated as higher risk, following WHO/EPA guidance.
- The advice is general health guidance, **not a medical diagnosis**. Users are told to see a doctor if they have symptoms.
- Without a Gemini key the app still works fully in rule-based mode.
- CO₂ factors per passenger-km are approximations for Indian cities (car 170 g, two-wheeler 50 g, bus 30 g, metro 20 g). Exposure multipliers are relative estimates taken from commuter-exposure studies. Both are meant for comparing options, not for precise accounting.
- The manual-AQI forecast assumes a typical winter pattern, and the UI labels it clearly as an estimate.

## 🤖 Gen AI usage
- **Google Gemini (gemini-3.8-flash, with automatic fallback models)**: personalised daily briefing, multilingual output and the grounded "Ask AirWise" chat.
- **AI-assisted development**: the project was designed, coded, tested and documented through prompting an AI coding assistant.

## License
MIT

## 🚀 Run & deploy

```bash
npm start              # http://localhost:8080 (Node 22.13+, no dependencies)
npm test               # 61 tests
npm run seed           # add demo history (use -- --reset to wipe first)
```

**Render (free):** New → Blueprint → select this repo. `render.yaml` configures everything; add `GEMINI_API_KEY` in the dashboard to enable AI. The free tier has an ephemeral disk, so `SEED_DEMO=true` refills demo data whenever the database starts empty.

**Docker:** `docker build -t airwise . && docker run -p 8080:8080 -e GEMINI_API_KEY=... airwise`
