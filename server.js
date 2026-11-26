'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('./src/app');

// Minimal .env loader (keeps the project dependency-free).
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

// Optional: fill an empty database with demo plans (useful on hosts with an ephemeral disk).
if (process.env.SEED_DEMO === 'true') {
  const { openDb } = require('./src/db');
  const db = openDb();
  const empty = db.stats().total === 0;
  db.close();
  if (empty) require('./scripts/seed');
}

const PORT = Number(process.env.PORT) || 8080;
const server = createServer();
server.headersTimeout = 20000;
server.requestTimeout = 30000;

server.listen(PORT, () => {
  console.log(`AirWise running on http://localhost:${PORT} (Gemini ${process.env.GEMINI_API_KEY ? 'enabled' : 'disabled – rule-based mode'})`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
