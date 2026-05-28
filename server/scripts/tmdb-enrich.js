#!/usr/bin/env node
/**
 * Enrich film_history + tv_history rows that are missing tmdb_id.
 *
 * Strategy:
 *   - For each film: TMDb /search/movie?query=<title>&language=zh-TW (first result)
 *   - For each unique series_name in tv_history: TMDb /search/tv?...
 *   - Update tmdb_id, poster_url, release_year, genres
 *
 * Run idempotently — rows already enriched are skipped.
 *
 * Env: TMDB_API_TOKEN (v4 Bearer token)
 * Usage:
 *   node tmdb-enrich.js                # enrich all NULL rows
 *   node tmdb-enrich.js --force-films  # re-enrich every film (overwrite)
 *   node tmdb-enrich.js --force-tv     # re-enrich every series
 *   node tmdb-enrich.js --limit 20     # only enrich up to 20 of each kind
 */
const fs = require('node:fs');
const path = require('node:path');
const sqlite3 = require('sqlite3');

const TOKEN = process.env.TMDB_API_TOKEN;
if (!TOKEN) {
  console.error('ERR: TMDB_API_TOKEN env var required');
  process.exit(1);
}

const args = process.argv.slice(2);
const forceFilms = args.includes('--force-films');
const forceTv = args.includes('--force-tv');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

const TMDB = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tmdbGet(pathStr) {
  const res = await fetch(`${TMDB}${pathStr}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, accept: 'application/json' },
  });
  if (res.status === 429) {
    // rate-limited: respect Retry-After or default 1s
    const wait = parseInt(res.headers.get('retry-after') || '1', 10) * 1000;
    console.warn(`429 rate limited, sleeping ${wait}ms`);
    await sleep(wait);
    return tmdbGet(pathStr);
  }
  if (!res.ok) throw new Error(`TMDb ${res.status} ${pathStr}`);
  return res.json();
}

/** Loads {id → name} genre maps from TMDb */
async function loadGenres() {
  const [movie, tv] = await Promise.all([
    tmdbGet('/genre/movie/list?language=zh-TW'),
    tmdbGet('/genre/tv/list?language=zh-TW'),
  ]);
  const map = new Map();
  for (const g of movie.genres) map.set(`m${g.id}`, g.name);
  for (const g of tv.genres) map.set(`t${g.id}`, g.name);
  return map;
}

/** Best-effort search: first try zh-TW, fall back to default (English titles). */
async function searchTitle(kind, title) {
  const enc = encodeURIComponent(title);
  const path1 = `/search/${kind}?query=${enc}&language=zh-TW&include_adult=false`;
  let r = await tmdbGet(path1);
  if (r.results && r.results.length > 0) return r.results[0];
  // fallback without lang filter (catches English/JP-only titles)
  r = await tmdbGet(`/search/${kind}?query=${enc}&include_adult=false`);
  return r.results && r.results.length > 0 ? r.results[0] : null;
}

function genreNames(genreMap, kind, ids) {
  if (!Array.isArray(ids)) return null;
  const prefix = kind === 'movie' ? 'm' : 't';
  const names = ids.map((id) => genreMap.get(`${prefix}${id}`)).filter(Boolean);
  return names.length > 0 ? names.join(',') : null;
}

const dbPath = path.resolve(__dirname, '../db/db.sqlite');
const db = new sqlite3.Database(dbPath);

const allp = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows))),
  );
const runp = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.run(sql, params, (e) => (e ? reject(e) : resolve())),
  );

async function enrichFilms(genreMap) {
  const where = forceFilms ? '' : 'WHERE tmdb_id IS NULL';
  const films = await allp(
    `SELECT id, title FROM film_history ${where} ORDER BY watched_date DESC NULLS LAST LIMIT ?`,
    [LIMIT === Infinity ? -1 : LIMIT],
  );
  console.log(`[films] ${films.length} to enrich`);
  let ok = 0, miss = 0;
  for (const f of films) {
    try {
      const r = await searchTitle('movie', f.title);
      if (!r) {
        console.warn(`  ✗ no match: ${f.title}`);
        miss++;
      } else {
        const year = r.release_date ? parseInt(r.release_date.slice(0, 4), 10) : null;
        const poster = r.poster_path ? `${IMG_BASE}${r.poster_path}` : null;
        const genres = genreNames(genreMap, 'movie', r.genre_ids);
        await runp(
          'UPDATE film_history SET tmdb_id = ?, poster_url = ?, release_year = ?, genres = ? WHERE id = ?',
          [r.id, poster, year, genres, f.id],
        );
        ok++;
        if (ok % 10 === 0) console.log(`  ${ok}/${films.length} films done`);
      }
      await sleep(150); // ~6 req/s, well under 40/10s
    } catch (e) {
      console.error(`  ERR ${f.title}:`, e.message);
      miss++;
    }
  }
  console.log(`[films] done: ${ok} matched, ${miss} missed`);
}

async function enrichTv(genreMap) {
  // distinct series_name needing enrichment
  const where = forceTv ? '' : 'WHERE tmdb_id IS NULL OR poster_url IS NULL';
  const series = await allp(
    `SELECT DISTINCT series_name FROM tv_history ${where} LIMIT ?`,
    [LIMIT === Infinity ? -1 : LIMIT],
  );
  console.log(`[tv] ${series.length} series to enrich`);
  let ok = 0, miss = 0;
  for (const s of series) {
    try {
      const r = await searchTitle('tv', s.series_name);
      if (!r) {
        console.warn(`  ✗ no match: ${s.series_name}`);
        miss++;
      } else {
        const poster = r.poster_path ? `${IMG_BASE}${r.poster_path}` : null;
        const genres = genreNames(genreMap, 'tv', r.genre_ids);
        // update ALL rows of this series
        await runp(
          'UPDATE tv_history SET tmdb_id = ?, poster_url = ?, genres = ? WHERE series_name = ?',
          [r.id, poster, genres, s.series_name],
        );
        ok++;
        if (ok % 10 === 0) console.log(`  ${ok}/${series.length} series done`);
      }
      await sleep(150);
    } catch (e) {
      console.error(`  ERR ${s.series_name}:`, e.message);
      miss++;
    }
  }
  console.log(`[tv] done: ${ok} matched, ${miss} missed`);
}

(async () => {
  console.log('Loading TMDb genre maps...');
  const genreMap = await loadGenres();
  console.log(`  loaded ${genreMap.size} genres`);

  await enrichFilms(genreMap);
  await enrichTv(genreMap);

  db.close();
  console.log('all done');
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
