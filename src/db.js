'use strict';

/**
 * Persistence layer – SQLite via Node's built-in `node:sqlite` (no dependencies).
 * Stores generated plans so families can revisit their history and see trends.
 */

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_PATH = path.join(__dirname, '..', 'data', 'airwise.db');

function openDb(file = process.env.DB_PATH || DEFAULT_PATH) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS plans (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      place       TEXT    NOT NULL,
      aqi         INTEGER NOT NULL,
      category    TEXT    NOT NULL,
      color       TEXT,
      risk_level  INTEGER,
      ai          INTEGER NOT NULL DEFAULT 0,
      profile     TEXT    NOT NULL,
      result      TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_plans_created ON plans(created_at DESC);
  `);

  const stmts = {
    insert: db.prepare(`INSERT INTO plans (place, aqi, category, color, risk_level, ai, profile, result, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`),
    list: db.prepare(`SELECT id, created_at AS createdAt, place, aqi, category, color, risk_level AS riskLevel, ai
                      FROM plans ORDER BY id DESC LIMIT ?`),
    get: db.prepare('SELECT id, created_at AS createdAt, profile, result FROM plans WHERE id = ?'),
    del: db.prepare('DELETE FROM plans WHERE id = ?'),
    clear: db.prepare('DELETE FROM plans'),
    stats: db.prepare(`SELECT COUNT(*) AS total, ROUND(AVG(aqi)) AS avgAqi, MAX(aqi) AS maxAqi, MIN(aqi) AS minAqi,
                       COUNT(DISTINCT place) AS places FROM plans`),
    top: db.prepare(`SELECT place, COUNT(*) AS n, ROUND(AVG(aqi)) AS avgAqi FROM plans
                     GROUP BY place ORDER BY n DESC LIMIT 5`),
  };

  return {
    /** @param {string} [createdAt] optional UTC 'YYYY-MM-DD HH:MM:SS' (used by the demo seeder) */
    savePlan(result, profile, createdAt) {
      const p = result.plan;
      const info = stmts.insert.run(
        String(result.place), p.aqi, p.category.label, p.category.color || null,
        p.riskLevel ?? null, result.ai ? 1 : 0, JSON.stringify(profile), JSON.stringify(result),
        createdAt || null,
      );
      return Number(info.lastInsertRowid);
    },
    listPlans(limit = 50) {
      return stmts.list.all(Math.min(Math.max(1, limit), 200)).map((r) => ({ ...r, ai: Boolean(r.ai) }));
    },
    getPlan(id) {
      const row = stmts.get.get(id);
      if (!row) return null;
      return { id: row.id, createdAt: row.createdAt, profile: JSON.parse(row.profile), ...JSON.parse(row.result) };
    },
    deletePlan(id) { return Number(stmts.del.run(id).changes) > 0; },
    clearPlans() { return Number(stmts.clear.run().changes); },
    stats() { return { ...stmts.stats.get(), topPlaces: stmts.top.all() }; },
    close() { db.close(); },
  };
}

module.exports = { openDb };
