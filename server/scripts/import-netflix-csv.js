#!/usr/bin/env node
/**
 * Import Netflix "Viewing activity" CSV into film_history + tv_history.
 *
 * CSV format (Netflix export):
 *   Title,Date
 *   "鬼怪","12/5/22"
 *   "Series Name: 第 1 季: 第 5 集","2/4/22"
 *
 * Rules:
 *   - title with ':' → TV (series_name = before first colon, episode_label = rest)
 *   - title without ':' → film
 *   - date M/D/YY → YYYY-MM-DD (assume 20YY)
 *   - skip blank rows
 *   - INSERT OR IGNORE so re-running is idempotent
 *
 * Usage: node import-netflix-csv.js <csv-path>
 */
const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3');

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('usage: node import-netflix-csv.js <csv-path>');
  process.exit(1);
}
if (!fs.existsSync(csvPath)) {
  console.error('file not found:', csvPath);
  process.exit(1);
}

const dbPath = path.resolve(__dirname, '../db/db.sqlite');
const db = new sqlite3.Database(dbPath);

/** Minimal CSV parser handling quoted fields with commas inside. */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuote = false; }
      } else { cur += c; }
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"') { inQuote = true; }
      else { cur += c; }
    }
  }
  out.push(cur);
  return out;
}

/** "M/D/YY" → "YYYY-MM-DD"; returns null on failure */
function isoDate(mdy) {
  const m = mdy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, M, D, Y] = m;
  if (Y.length === 2) Y = '20' + Y;
  return `${Y}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}`;
}

const raw = fs.readFileSync(csvPath, 'utf-8');
const lines = raw.split(/\r?\n/).filter((l) => l.trim());
if (lines[0].toLowerCase().startsWith('title')) lines.shift(); // strip header

const films = [];
const tvEps = [];
let skipped = 0;

for (const line of lines) {
  const [title, date] = parseCsvLine(line);
  if (!title || !title.trim() || title.trim() === ',') { skipped++; continue; }
  const watched = isoDate(date || '');
  const t = title.trim();

  if (t.includes(':')) {
    const colon = t.indexOf(':');
    const series = t.slice(0, colon).trim();
    const ep = t.slice(colon + 1).trim();
    tvEps.push({ series, ep, watched });
  } else {
    films.push({ title: t, watched });
  }
}

console.log(`Parsed ${films.length} films, ${tvEps.length} TV episodes (${skipped} skipped)`);

db.serialize(() => {
  db.run('BEGIN TRANSACTION');

  const filmInsert = db.prepare(
    `INSERT OR IGNORE INTO film_history (title, watched_date, source) VALUES (?, ?, 'netflix')`,
  );
  let filmsInserted = 0;
  for (const f of films) {
    filmInsert.run(f.title, f.watched, function () { if (this.changes) filmsInserted += this.changes; });
  }
  filmInsert.finalize();

  const tvInsert = db.prepare(
    `INSERT OR IGNORE INTO tv_history (series_name, episode_label, watched_date, source) VALUES (?, ?, ?, 'netflix')`,
  );
  let tvInserted = 0;
  for (const e of tvEps) {
    tvInsert.run(e.series, e.ep, e.watched, function () { if (this.changes) tvInserted += this.changes; });
  }
  tvInsert.finalize();

  db.run('COMMIT', () => {
    // 統計實際 inserted（restart safely 之後 再 run 不會重複，UNIQUE 會擋）
    db.get('SELECT COUNT(*) AS n FROM film_history WHERE source = "netflix"', (e, r) => {
      console.log(`film_history (source=netflix): ${r.n} rows total`);
    });
    db.get('SELECT COUNT(DISTINCT series_name) AS s, COUNT(*) AS e FROM tv_history WHERE source = "netflix"', (e, r) => {
      console.log(`tv_history (source=netflix): ${r.s} series, ${r.e} episode rows total`);
      db.close();
    });
  });
});
