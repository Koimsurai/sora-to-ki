/* Watch 域 — 從 index.js 原樣搬出（行為不變）：
   動畫瘋同步（anigamer SDK + cookie 熱更新 + scrobble heartbeat）、
   Trakt 歷史同步與 /watching 輪詢、TMDb 自動 enrich、
   anime/films/tv/stats/now 公開路由、Letterboxd（已停用，保留可復原）。
   由 index.js 注入相依後呼叫：require('./routes/watch')({ apiRouter, db, requireAdmin }) */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

module.exports = function registerWatchRoutes({ apiRouter, db, requireAdmin }) {
/* ──────────────────────────────────────────────────────────────────────
   動畫瘋觀看歷史同步（用自家開源 SDK：anigamer — https://github.com/timo9378/anigamer）
   - SDK 負責 cookie 解析 / serialize / Set-Cookie 自動輪替 / history / cover 抓取
   - 這層只剩：cookie 檔案持久化 + DB upsert + cron
   - cookie 啟動時先吃 file（最新 rotated 版本），沒有再 fallback env；
     SDK 偵測到 Bahamut rotate cookie 時，透過 onCookiesRotated 寫回檔案，
     只要 cron 持續跑就會被視為活躍 user，JWT 通常會默默續發，不用手動重抓
   - cron 每 6 小時跑一次，server 啟動 30 秒後也跑一次
─────────────────────────────────────────────────────────────────────── */
const { AniGamer } = require('anigamer');
const crypto = require('node:crypto');
const BAHAMUT_COOKIE_FILE = path.join(__dirname, '..', 'db', '.bahamut-cookie.json');

// 啟動時：先吃 file（最新 rotated 版本），沒有再 fallback env
function loadBahamutCookie() {
  try {
    if (fs.existsSync(BAHAMUT_COOKIE_FILE)) {
      const stored = JSON.parse(fs.readFileSync(BAHAMUT_COOKIE_FILE, 'utf-8'));
      if (stored && typeof stored === 'object') {
        console.log('[Bahamut] loaded rotated cookies from', BAHAMUT_COOKIE_FILE);
        return stored;
      }
    }
  } catch (e) { /* ignore */ }
  return process.env.BAHAMUT_COOKIE || '';
}

// SDK client：Bahamut 回 Set-Cookie 時自動 merge，並透過 callback 寫回檔案。
// factory + let → 讓後台 / 瀏覽器擴充能熱抽換 cookie 而不必重啟容器。
function makeBahamutClient(cookie) {
  return new AniGamer({
    cookie,
    onCookiesRotated: (jar) => {
      // 守門：若 rotate 後 BAHARUNE 不見了（Bahamut 有時 Set-Cookie 把 web cookie 刪掉），
      // 別把好檔覆寫成掏空的 jar — 否則重啟載到空檔、sync 永遠 skip（先前的災情根因）。
      if (!jar?.BAHARUNE || !String(jar.BAHARUNE).includes('.')) {
        console.warn('[Bahamut] rotation dropped BAHARUNE — NOT persisting (keep previous good cookie)');
        return;
      }
      try {
        fs.writeFileSync(BAHAMUT_COOKIE_FILE, JSON.stringify(jar, null, 2));
        console.log('[Bahamut] cookies rotated, persisted');
      } catch (e) {
        console.error('[Bahamut] persist cookie fail:', e.message);
      }
    },
  });
}
let bahamut = makeBahamutClient(loadBahamutCookie());

// 推 Discord webhook（沒設 DISCORD_WEBHOOK_URL 就跳過，同 host 上的 discord-update-notify.sh）
async function notifyDiscord(content) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    await axios.post(url, { content }, { timeout: 8000 });
  } catch (e) {
    console.error('[Bahamut] discord notify fail:', e.message);
  }
}

// BAHARUNE 約 14 天到期，Bahamut 是否會自動續期未經證實 →「剩 < 3 天」就推 Discord 提醒手動重抓
// SDK 不做自動登入（Bahamut reCAPTCHA），這是「自動運作、快死大聲提醒」的安全網
const JWT_WARN_THRESHOLD_SEC = 3 * 24 * 60 * 60;
let lastJwtAlertAt = 0; // 最多每 24h 提醒一次，避免每次 sync 洗版
async function maybeAlertDiscord(msg) {
  if (Date.now() - lastJwtAlertAt <= 24 * 60 * 60 * 1000) return;
  lastJwtAlertAt = Date.now();
  await notifyDiscord(msg);
}
async function checkBahamutJwtExpiry() {
  // 補強：jwtStatus() 只認 JWT 格式 BAHARUNE，若 BAHARUNE 被 server 端 Set-Cookie 成 "deleted"
  // 或非 JWT 字串，原本會 silent return 整個略過警告 — 改成這裡顯式偵測
  const jar = bahamut.cookies || {};
  const baharune = jar.BAHARUNE;
  if (!baharune || baharune === 'deleted' || !String(baharune).includes('.')) {
    console.warn('[Bahamut] BAHARUNE missing or non-JWT (got:', baharune ? `'${String(baharune).slice(0, 16)}'` : 'undefined', ')');
    await maybeAlertDiscord(
      `⚠️ **動畫瘋 BAHARUNE 不是有效 JWT**（值：\`${String(baharune || 'undefined').slice(0, 24)}\`）— 觀看歷史同步停擺，請登入 ani.gamer.com.tw 重抓 cookie`,
    );
    return;
  }
  const status = bahamut.jwtStatus();
  if (!status) return;
  console.log(
    `[Bahamut] JWT exp ${status.expiresAt.toISOString()} (${Math.floor(status.secondsUntilExpiry / 86400)}d left)`,
  );
  const needAlert = status.isExpired || status.secondsUntilExpiry < JWT_WARN_THRESHOLD_SEC;
  if (needAlert) {
    const days = Math.max(0, Math.floor(status.secondsUntilExpiry / 86400));
    await maybeAlertDiscord(
      status.isExpired
        ? `⚠️ **動畫瘋 cookie 已過期** — 觀看歷史同步停擺，請登入 ani.gamer.com.tw 重抓 cookie 更新 BAHAMUT_COOKIE`
        : `⏳ **動畫瘋 cookie 剩 ${days} 天到期**（${status.expiresAt.toISOString()}）— 找時間登入 ani.gamer.com.tw 重抓 cookie`,
    );
  }
}

// 動畫 TMDb 補值：每次同步後自動跑，新動畫/新集數的 NULL tmdb_id 自動補上，免手動跑 scripts/tmdb-enrich.js
const TMDB_API_TOKEN = process.env.TMDB_API_TOKEN;
function simplifyAnimeTitle(t) {
  return String(t)
    .replace(/[（(]\s*第[^)）]*[)）]/g, ' ')                 // (第三季)
    .replace(/\s*第[一二三四五六七八九十百零\d]+[季期]\s*$/u, '')  // … 第四季 / 第二期
    .replace(/\s*[Ss](?:eason)?\s*\d+\s*$/u, '')              // … S2 / Season 2
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')                        // [年齡限制版]
    .replace(/[：]/g, ':')                                     // 全形冒號
    .replace(/\s+/g, ' ')
    .trim();
}
async function tmdbSearchTvId(title) {
  const q = async (query) => {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(query)}&language=zh-TW&include_adult=false`,
      { headers: { Authorization: `Bearer ${TMDB_API_TOKEN}`, accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const j = await res.json();
    return j.results?.[0]?.id ?? null;
  };
  let id = await q(title);
  if (!id) {
    const s = simplifyAnimeTitle(title);
    if (s && s !== title) id = await q(s);
  }
  return id;
}
async function enrichNullAnime() {
  if (!TMDB_API_TOKEN) return;
  const rows = await new Promise((resolve) =>
    db.all(
      'SELECT anime_sn, MAX(title) AS title FROM anime_history WHERE tmdb_id IS NULL GROUP BY anime_sn',
      (e, r) => resolve(e ? [] : r),
    ),
  );
  if (!rows.length) return;
  let ok = 0;
  for (const a of rows) {
    try {
      const id = await tmdbSearchTvId(a.title);
      if (id) {
        await new Promise((res) =>
          db.run('UPDATE anime_history SET tmdb_id = ? WHERE anime_sn = ?', [id, a.anime_sn], () => res()),
        );
        ok += 1;
      }
      await new Promise((r) => setTimeout(r, 150)); // 溫和：~6 req/s
    } catch {
      /* 單筆失敗略過 */
    }
  }
  console.log(`[Bahamut] anime TMDb enrich: ${ok}/${rows.length} matched`);
}

let bahamutSyncRunning = false;
async function syncBahamutHistory() {
  const { ok, missing } = bahamut.validate();
  if (!ok) {
    console.log('[Bahamut] cookie missing', missing.join(','), '— skip sync');
    return { ok: false, skipped: 'missing-cookie', missing };
  }
  if (bahamutSyncRunning) {
    console.log('[Bahamut] sync already in progress, skip');
    return { ok: false, busy: true };
  }
  bahamutSyncRunning = true;
  console.log('[Bahamut] sync start');
  await checkBahamutJwtExpiry();

  try {
    let totalEntries = 0;
    let newEntries = 0;
    let coversFetched = 0;

    // SDK 走完所有頁 + 按 animeSn:videoSn 去重
    const allHistory = await bahamut.historyAll();

    // soft-401 安全網：舊版 SDK 對「HTTP 200 + {error:NO_LOGIN}」會 silent 回 0 筆。
    // 你帳號有歷史紀錄，健康時絕不會 0 → 視為 session 失效，告警並中止（不覆寫既有資料）。
    if (allHistory.length === 0) {
      console.warn('[Bahamut] historyAll 回 0 筆 — session 多半已失效（NO_LOGIN）');
      await maybeAlertDiscord(
        '⚠️ **動畫瘋同步抓到 0 筆**，session 多半已失效。請在動畫瘋分頁點瀏覽器擴充推一次新 cookie（或後台更新）。',
      );
      return { ok: false, deadSession: true, totalEntries: 0, newEntries: 0 };
    }

    // 1) 找出每個 anime_sn 在 db 是否已有 cover_url（同一部動畫共用一張 cover）
    const uniqueAnimeSns = [...new Set(allHistory.map((e) => e.animeSn).filter(Boolean))];
    const existingCovers = new Map(); // animeSn -> cover_url
    for (const sn of uniqueAnimeSns) {
      const row = await new Promise((resolve) => {
        db.get(
          'SELECT cover_url FROM anime_history WHERE anime_sn = ? AND cover_url IS NOT NULL AND cover_url != "" LIMIT 1',
          [sn],
          (err, r) => resolve(err ? null : r),
        );
      });
      if (row?.cover_url) existingCovers.set(sn, row.cover_url);
    }

    // 2) 對 db 沒紀錄的 anime_sn 用 SDK 抓 cover（og:image）
    for (const sn of uniqueAnimeSns) {
      if (existingCovers.has(sn)) continue;
      const cover = await bahamut.cover(sn).catch(() => null);
      if (cover) {
        existingCovers.set(sn, cover);
        coversFetched += 1;
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    // 3) upsert 每集 — 展開 SDK 提供的 nested history[]（每個 anime 的全部觀看集數）
    //    每筆對應一集：(anime_sn, video_sn) 為主鍵。title 存系列名（清理掉 "[8]" 後綴）。
    for (const entry of allHistory) {
      const { animeSn, title: seriesTitle } = entry;
      if (!animeSn) continue;
      const coverUrl = existingCovers.get(animeSn) || '';
      // entry.raw.history 是 [{ videoSn, title: '婚姻劇毒 [8]', watchTime: '2026-05-28...' }, ...]
      // 若沒 raw 退回單筆（最新一集）
      const eps = entry.raw?.history?.length
        ? entry.raw.history
        : [{ videoSn: entry.videoSn, title: entry.title, watchTime: entry.watchedAt }];

      for (const ep of eps) {
        if (!ep?.videoSn) continue;
        // 從 "婚姻劇毒 [8]" 抽出 "8"；抽不到就 null
        const m = String(ep.title || '').match(/\[([^\]]+)\]\s*$/);
        const epLabel = m ? m[1] : null;
        const watchAtSql = ep.watchTime || null;

        const isNew = await new Promise((resolve) => {
          db.get(
            'SELECT 1 FROM anime_history WHERE anime_sn = ? AND video_sn = ?',
            [animeSn, ep.videoSn],
            (err, row) => resolve(!err && !row),
          );
        });
        if (isNew) newEntries += 1;

        await new Promise((resolve) => {
          db.run(
            `INSERT INTO anime_history (anime_sn, video_sn, title, cover_url, episode, last_watched_at, synced_at)
             VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
             ON CONFLICT(anime_sn, video_sn) DO UPDATE SET
               title = excluded.title,
               cover_url = COALESCE(NULLIF(excluded.cover_url, ''), anime_history.cover_url),
               episode = COALESCE(excluded.episode, anime_history.episode),
               last_watched_at = COALESCE(excluded.last_watched_at, anime_history.last_watched_at),
               synced_at = CURRENT_TIMESTAMP`,
            [animeSn, ep.videoSn, seriesTitle || '', coverUrl, epLabel, watchAtSql],
            () => resolve(),
          );
        });
        totalEntries += 1;
      }
    }

    // 同步後自動補 TMDb（新動畫/新集數的 NULL tmdb_id）→ 連結不會再退到搜尋頁
    try {
      await enrichNullAnime();
    } catch (e) {
      console.error('[Bahamut] anime enrich fail:', e.message);
    }

    console.log(`[Bahamut] sync done: ${totalEntries} entries, ${newEntries} new, ${coversFetched} covers fetched (${uniqueAnimeSns.length} unique animes)`);
    return { ok: true, totalEntries, newEntries, coversFetched };
  } catch (err) {
    console.error('[Bahamut] sync error:', err.message);
    // 新版 SDK 對 NO_LOGIN 會 throw（帶 isAuthError/status）→ 告警並標記 session 死
    if (err.isAuthError || err.status === 'NO_LOGIN' || /NO_LOGIN|尚未登入/.test(err.message || '')) {
      await maybeAlertDiscord(
        '⚠️ **動畫瘋 session 失效（NO_LOGIN）** — 請在動畫瘋分頁點瀏覽器擴充推一次新 cookie。',
      );
      return { ok: false, deadSession: true, error: err.message };
    }
    return { ok: false, error: err.message };
  } finally {
    bahamutSyncRunning = false;
  }
}

// ── 動畫瘋 cookie 熱更新 ───────────────────────────────────────
// 來源：瀏覽器擴充（一鍵抓 cookie）或後台手動貼。寫檔 + 熱抽換 SDK + 立刻重跑同步，免重啟、免改 env。
// 授權：① 一次性 BAHAMUT_PUSH_TOKEN（給擴充用，header X-Bahamut-Token，免登入）或 ② admin JWT。
function hasValidBahamutPushToken(req) {
  const token = process.env.BAHAMUT_PUSH_TOKEN;
  if (!token) return false;
  const got = req.header('X-Bahamut-Token') || '';
  if (got.length !== token.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(token));
  } catch {
    return false;
  }
}
const bahamutPushAuth = (req, res, next) =>
  hasValidBahamutPushToken(req) ? next() : requireAdmin(req, res, next);

// GET 目前 cookie 狀態（擴充推送前後可顯示剩餘天數）
apiRouter.get('/admin/bahamut/status', bahamutPushAuth, (req, res) => {
  const v = bahamut.validate();
  const s = bahamut.jwtStatus();
  res.json({
    ok: v.ok,
    missing: v.missing,
    jwtExpiresAt: s?.expiresAt || null,
    daysLeft: s ? Math.floor(s.secondsUntilExpiry / 86400) : null,
  });
});

// POST 熱更新 cookie：body 接受 { jar: {name:value,...} }（擴充）或 { cookie: "a=b; c=d" }（手貼）
apiRouter.post('/admin/bahamut/cookie', bahamutPushAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const input =
      body.jar && typeof body.jar === 'object'
        ? body.jar
        : typeof body.cookie === 'string'
          ? body.cookie
          : null;
    if (!input) return res.status(400).json({ ok: false, message: '缺少 cookie 或 jar' });

    const candidate = makeBahamutClient(input);
    const { ok, missing } = candidate.validate();
    if (!ok) return res.status(400).json({ ok: false, message: '缺少必要 cookie', missing });

    const status = candidate.jwtStatus();
    fs.writeFileSync(BAHAMUT_COOKIE_FILE, JSON.stringify(candidate.cookies, null, 2));
    bahamut = candidate; // 熱抽換
    lastJwtAlertAt = 0; // 換新 cookie → 重置告警節流
    console.log('[Bahamut] cookie 經 endpoint 熱更新，觸發同步');

    const sync = await syncBahamutHistory();
    return res.json({
      ok: true,
      jwtExpiresAt: status?.expiresAt || null,
      daysLeft: status ? Math.floor(status.secondsUntilExpiry / 86400) : null,
      sync,
    });
  } catch (e) {
    console.error('[Bahamut] cookie 更新失敗:', e.message);
    return res.status(500).json({ ok: false, message: e.message });
  }
});



// GET /api/anime/history — 公開讀取最近觀看
apiRouter.get('/anime/history', (req, res) => {
  // cap 2000 (DB 約 900 列、之後成長有空間；前端 library 一次拿完 group by anime_sn)
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 2000);
  db.all(
    `SELECT anime_sn, video_sn, title, cover_url, episode, tmdb_id, last_watched_at
     FROM anime_history
     ORDER BY last_watched_at DESC
     LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'success', history: rows });
    },
  );
});

// GET /api/films/recent — 最近看的電影（id auto，依 watched_date DESC）
apiRouter.get('/films/recent', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  db.all(
    `SELECT id, title, watched_date, rating, source, tmdb_id, poster_url, release_year, genres
     FROM film_history
     ORDER BY watched_date DESC NULLS LAST, id DESC
     LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'success', films: rows });
    },
  );
});

// GET /api/tv/recent — 影集，依 series 聚合，每部一筆，附 episode count + 最新觀看日
apiRouter.get('/tv/recent', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  db.all(
    `SELECT
       series_name,
       MAX(watched_date) AS last_watched,
       COUNT(*) AS ep_count,
       MAX(tmdb_id) AS tmdb_id,
       MAX(poster_url) AS poster_url,
       MAX(genres) AS genres,
       MAX(source) AS source
     FROM tv_history
     GROUP BY series_name
     ORDER BY last_watched DESC NULLS LAST
     LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'success', series: rows });
    },
  );
});

// GET /api/watch/stats — 給 Watch 頁面 STATS chip 用
apiRouter.get('/watch/stats', (req, res) => {
  const queries = {
    animeCount: 'SELECT COUNT(DISTINCT anime_sn) AS n FROM anime_history',
    animeEpisodes: 'SELECT COUNT(*) AS n FROM anime_history',
    filmCount: 'SELECT COUNT(*) AS n FROM film_history',
    tvSeriesCount: 'SELECT COUNT(DISTINCT series_name) AS n FROM tv_history',
    tvEpisodes: 'SELECT COUNT(*) AS n FROM tv_history',
  };
  Promise.all(
    Object.entries(queries).map(
      ([k, sql]) =>
        new Promise((resolve) => {
          db.get(sql, (err, row) => resolve([k, err ? 0 : row.n]));
        }),
    ),
  ).then((entries) => res.json({ message: 'success', ...Object.fromEntries(entries) }));
});

/* ── /watch 一生推（watch_favorites）：公開讀取（依語系在地化）+ admin CRUD ── */
const TMDB_LANG = { 'zh-TW': 'zh-TW', 'zh-CN': 'zh-CN', en: 'en-US', ja: 'ja-JP', ko: 'ko-KR' };
const tmdbDetailCache = new Map(); // `${kind}:${id}:${lang}` → { title, poster_url, year }

async function tmdbDetail(kind, id, locale) {
  const lang = TMDB_LANG[locale] || 'zh-TW';
  const key = `${kind}:${id}:${lang}`;
  if (tmdbDetailCache.has(key)) return tmdbDetailCache.get(key);
  if (!TMDB_API_TOKEN) return null;
  try {
    const path = kind === 'tv' ? 'tv' : 'movie';
    const r = await fetch(`https://api.themoviedb.org/3/${path}/${id}?language=${lang}`,
      { headers: { Authorization: `Bearer ${TMDB_API_TOKEN}`, accept: 'application/json' } });
    if (!r.ok) return null;
    const j = await r.json();
    const out = {
      title: j.title || j.name || '',
      poster_url: j.poster_path ? `https://image.tmdb.org/t/p/w342${j.poster_path}` : null,
      year: parseInt((j.release_date || j.first_air_date || '').slice(0, 4), 10) || null,
    };
    tmdbDetailCache.set(key, out);
    return out;
  } catch {
    return null;
  }
}

// GET /api/watch/favorites?locale= — 公開；標題/海報/年份依語系即時補（poster/year 失敗時退回 DB 快照）
apiRouter.get('/watch/favorites', (req, res) => {
  const locale = TMDB_LANG[req.query.locale] ? req.query.locale : 'zh-TW';
  db.all('SELECT * FROM watch_favorites ORDER BY sort_order ASC, id ASC', async (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const out = await Promise.all((rows || []).map(async (f) => {
      const d = await tmdbDetail(f.kind, f.tmdb_id, locale);
      return {
        id: f.id, kind: f.kind, tmdbId: f.tmdb_id, rating: f.rating, quote: f.quote,
        title: d?.title || `#${f.tmdb_id}`,
        poster: d?.poster_url || f.poster_url || null,
        year: d?.year || f.year || null,
        externalUrl: `https://www.themoviedb.org/${f.kind === 'tv' ? 'tv' : 'movie'}/${f.tmdb_id}`,
      };
    }));
    // 不給瀏覽器快取：admin 編輯後會立刻重抓，max-age 會讓重抓命中舊快取（畫面要硬重整才更新）
    res.set('Cache-Control', 'no-store');
    res.json({ message: 'success', favorites: out });
  });
});

// GET /api/watch/tmdb-search?q=&kind=  — admin 選片用（回標題/年份/海報）
apiRouter.get('/watch/tmdb-search', requireAdmin, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const kind = req.query.kind === 'tv' ? 'tv' : 'movie';
  if (!q) return res.json({ message: 'success', results: [] });
  if (!TMDB_API_TOKEN) return res.status(500).json({ error: 'TMDB_API_TOKEN 未設定' });
  try {
    const r = await fetch(
      `https://api.themoviedb.org/3/search/${kind}?query=${encodeURIComponent(q)}&language=zh-TW&include_adult=false`,
      { headers: { Authorization: `Bearer ${TMDB_API_TOKEN}`, accept: 'application/json' } });
    const j = await r.json();
    const results = (j.results || []).slice(0, 8).map((it) => ({
      tmdbId: it.id, kind,
      title: it.title || it.name,
      year: parseInt((it.release_date || it.first_air_date || '').slice(0, 4), 10) || null,
      poster: it.poster_path ? `https://image.tmdb.org/t/p/w185${it.poster_path}` : null,
    }));
    res.json({ message: 'success', results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/watch/favorites  {tmdbId, kind, rating, quote}  — admin 新增（接到清單末尾）
apiRouter.post('/watch/favorites', requireAdmin, async (req, res) => {
  const { tmdbId, kind = 'film', rating = 5, quote = '' } = req.body || {};
  if (!tmdbId) return res.status(400).json({ error: 'tmdbId 必填' });
  const k = kind === 'tv' ? 'tv' : 'film';
  const d = await tmdbDetail(k, tmdbId, 'zh-TW'); // 存一份快照當 fallback
  db.get('SELECT MAX(sort_order) AS m FROM watch_favorites', (e, row) => {
    const order = (row?.m ?? -1) + 1;
    db.run(
      'INSERT INTO watch_favorites (tmdb_id, kind, rating, quote, poster_url, year, sort_order) VALUES (?,?,?,?,?,?,?)',
      [tmdbId, k, Math.max(1, Math.min(5, rating)), String(quote).slice(0, 280), d?.poster_url || null, d?.year || null, order],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'success', id: this.lastID });
      });
  });
});

// PUT /api/watch/favorites/:id  {rating, quote, sort_order}  — admin 編輯
apiRouter.put('/watch/favorites/:id', requireAdmin, (req, res) => {
  const { rating, quote, sort_order } = req.body || {};
  const sets = [], params = [];
  if (rating != null) { sets.push('rating = ?'); params.push(Math.max(1, Math.min(5, rating))); }
  if (quote != null) { sets.push('quote = ?'); params.push(String(quote).slice(0, 280)); }
  if (sort_order != null) { sets.push('sort_order = ?'); params.push(sort_order); }
  if (!sets.length) return res.status(400).json({ error: '無可更新欄位' });
  params.push(req.params.id);
  db.run(`UPDATE watch_favorites SET ${sets.join(', ')} WHERE id = ?`, params, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'success' });
  });
});

// DELETE /api/watch/favorites/:id — admin 刪除
apiRouter.delete('/watch/favorites/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM watch_favorites WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'success' });
  });
});

// 啟動 30 秒後跑首次 sync，之後每 6 小時跑一次
// DISABLE_WATCH_CRON=1 → 關閉（strangler 切換：同步 worker 移交 Rust 時設）
if (!process.env.DISABLE_WATCH_CRON) {
  setTimeout(() => syncBahamutHistory(), 30 * 1000);
  setInterval(() => syncBahamutHistory(), 6 * 60 * 60 * 1000);
}

/* ═════════════════════════════════════════════════════════════
   Trakt sync — going-forward HBO Max / Disney+ / 任何手動 log
   流程：device-auth 拿到 token 後存 db/.trakt-token.json，
   這裡 cron 每天拉 /sync/history 補進 film_history + tv_history
═════════════════════════════════════════════════════════════ */
const TRAKT_TOKEN_FILE = path.join(__dirname, '..', 'db', '.trakt-token.json');
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;
const TRAKT_CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET;

function loadTraktToken() {
  try {
    if (!fs.existsSync(TRAKT_TOKEN_FILE)) return null;
    return JSON.parse(fs.readFileSync(TRAKT_TOKEN_FILE, 'utf-8'));
  } catch (e) {
    console.warn('[Trakt] token file unreadable:', e.message);
    return null;
  }
}

function saveTraktToken(tok) {
  fs.writeFileSync(TRAKT_TOKEN_FILE, JSON.stringify(tok, null, 2));
  fs.chmodSync(TRAKT_TOKEN_FILE, 0o600);
}

const TRAKT_UA = 'koimsurai/1.0 (+https://koimsurai.com)';
async function refreshTraktToken(tok) {
  const r = await fetch('https://api.trakt.tv/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': TRAKT_UA },
    body: JSON.stringify({
      refresh_token: tok.refresh_token,
      client_id: TRAKT_CLIENT_ID,
      client_secret: TRAKT_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`refresh ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const out = {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    scope: j.scope,
    expires_at: (j.created_at + j.expires_in) * 1000,
    created_at: j.created_at * 1000,
  };
  saveTraktToken(out);
  console.log('[Trakt] token refreshed, new expiry', new Date(out.expires_at).toISOString());
  return out;
}

async function getValidTraktToken() {
  let tok = loadTraktToken();
  if (!tok) return null;
  // refresh if < 7 days to expiry (Trakt tokens last 90 days; 7d buffer is plenty)
  if (Date.now() + 7 * 86400_000 >= tok.expires_at) {
    try { tok = await refreshTraktToken(tok); }
    catch (e) { console.error('[Trakt] refresh failed:', e.message); return null; }
  }
  return tok;
}

async function traktGet(tok, pathStr) {
  const r = await fetch(`https://api.trakt.tv${pathStr}`, {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': TRAKT_UA,
      'trakt-api-version': '2',
      'trakt-api-key': TRAKT_CLIENT_ID,
      Authorization: `Bearer ${tok.access_token}`,
    },
  });
  if (!r.ok) throw new Error(`${pathStr} ${r.status}: ${await r.text()}`);
  return { data: await r.json(), pagecount: parseInt(r.headers.get('x-pagination-page-count') || '1', 10) };
}

// Trakt 有時 watched_at 是 epoch（當初批次標記沒給日期）→ 1970，當「無日期」存 NULL
function cleanWatchedDate(raw) {
  const d = (raw || '').slice(0, 10);
  return !d || d <= '1970-01-02' ? null : d;
}

let traktSyncRunning = false;
async function syncTraktHistory() {
  if (traktSyncRunning) { console.log('[Trakt] sync in progress, skip'); return; }
  const tok = await getValidTraktToken();
  if (!tok) { console.log('[Trakt] no token — skip sync (run trakt-device-auth.js to authorize)'); return; }

  traktSyncRunning = true;
  console.log('[Trakt] sync start');
  try {
    let films = 0, episodes = 0;

    // movies: page through /sync/history/movies (Trakt sorts DESC by watched_at)
    for (let page = 1; ; page++) {
      const { data, pagecount } = await traktGet(tok, `/sync/history/movies?page=${page}&limit=100`);
      for (const item of data) {
        const m = item.movie;
        if (!m) continue;
        const watched = cleanWatchedDate(item.watched_at);
        await new Promise((resolve) => {
          db.run(
            `INSERT OR IGNORE INTO film_history (title, watched_date, source, tmdb_id, release_year)
             VALUES (?, ?, 'trakt', ?, ?)`,
            [m.title, watched, m.ids?.tmdb || null, m.year || null],
            () => { films += 1; resolve(); },
          );
        });
      }
      if (page >= pagecount) break;
      await new Promise((r) => setTimeout(r, 300));
    }

    // tv episodes
    for (let page = 1; ; page++) {
      const { data, pagecount } = await traktGet(tok, `/sync/history/episodes?page=${page}&limit=100`);
      for (const item of data) {
        const ep = item.episode;
        const show = item.show;
        if (!ep || !show) continue;
        const watched = cleanWatchedDate(item.watched_at);
        const epLabel = `S${String(ep.season).padStart(2, '0')}E${String(ep.number).padStart(2, '0')}`;
        await new Promise((resolve) => {
          db.run(
            `INSERT OR IGNORE INTO tv_history (series_name, episode_label, watched_date, source, tmdb_id)
             VALUES (?, ?, ?, 'trakt', ?)`,
            [show.title, epLabel, watched, show.ids?.tmdb || null],
            () => { episodes += 1; resolve(); },
          );
        });
      }
      if (page >= pagecount) break;
      await new Promise((r) => setTimeout(r, 300));
    }

    console.log(`[Trakt] sync done: ${films} film rows, ${episodes} tv ep rows scanned`);
  } catch (e) {
    console.error('[Trakt] sync error:', e.message);
  } finally {
    traktSyncRunning = false;
  }
}

// 啟動 90 秒後跑首次（讓 Bahamut sync 先跑），之後每 6 小時跑一次
// DISABLE_WATCH_CRON=1 → 關閉（Trakt 同步已有 Rust 版：server-rs ENABLE_TRAKT_SYNC=1）
if (!process.env.DISABLE_WATCH_CRON) {
  setTimeout(() => syncTraktHistory(), 90 * 1000);
  setInterval(() => syncTraktHistory(), 6 * 60 * 60 * 1000);
}

/* ═════════════════════════════════════════════════════════════
   即時觀看 now-watching（對齊 Spotify now-playing）
   來源：① 動畫瘋瀏覽器擴充 heartbeat（POST /admin/watch/now）
        ② 後台輪詢 Trakt /users/{slug}/watching（TV/電影，需有 scrobbler 餵 Trakt）
   狀態存記憶體、短 TTL；沒 heartbeat / 沒在播就自然過期 → 前端退回「最近看完」
═════════════════════════════════════════════════════════════ */
const NOW_WATCHING_TTL_MS = 90 * 1000; // 兩個 heartbeat 沒來就過期
const TRAKT_POLL_MIN_MS = 25 * 1000;   // /watch/now 被打時，最多每 25 秒問 Trakt 一次（節流）
let nowWatching = null; // { type, title, cover, tmdbId, episode, progressPct, source, externalUrl, startedAt, expiresAt }
let lastTraktPollAt = 0;

function currentNowWatching() {
  return nowWatching && Date.now() < nowWatching.expiresAt ? nowWatching : null;
}
function tmdbUrlFor(type, id) {
  if (!id) return null;
  return `https://www.themoviedb.org/${type === 'movie' ? 'movie' : 'tv'}/${id}`;
}

// 擴充 heartbeat：{ playing, videoSn, title, episode, progressPct }
apiRouter.post('/admin/watch/now', bahamutPushAuth, async (req, res) => {
  const b = req.body || {};
  if (b.playing === false) {
    if (nowWatching?.source === 'bahamut') nowWatching = null; // 只清自己這條，別動 Trakt
    return res.json({ ok: true, cleared: true });
  }
  let title = b.title || null;
  let cover = null;
  let tmdbId = null;
  let episode = b.episode || null;
  // 用 video_sn 反查 anime_history，補上正規標題 / 封面 / tmdb_id
  if (b.videoSn) {
    const row = await new Promise((resolve) =>
      db.get(
        'SELECT anime_sn, title, cover_url, tmdb_id, episode FROM anime_history WHERE video_sn = ? LIMIT 1',
        [b.videoSn],
        (e, r) => resolve(e ? null : r),
      ),
    );
    if (row) {
      title = row.title || title;
      cover = row.cover_url || null;
      tmdbId = row.tmdb_id || null;
      episode = episode || row.episode || null;
    }
  }
  if (!title) return res.status(400).json({ ok: false, message: 'need title or known videoSn' });
  const now = Date.now();
  nowWatching = {
    type: 'anime',
    title,
    cover,
    tmdbId,
    episode,
    progressPct: typeof b.progressPct === 'number' ? Math.max(0, Math.min(100, Math.round(b.progressPct))) : null,
    source: 'bahamut',
    externalUrl: tmdbUrlFor('tv', tmdbId)
      || (b.videoSn ? `https://ani.gamer.com.tw/animeVideo.php?sn=${b.videoSn}` : null),
    startedAt: nowWatching?.source === 'bahamut' && nowWatching.title === title ? nowWatching.startedAt : now,
    expiresAt: now + NOW_WATCHING_TTL_MS,
  };
  res.json({ ok: true });
});

// 公開讀取目前即時觀看
// Trakt 改「按需 + 節流」：只有有人在看 /watch 這頁、且距上次 >25s 才問 Trakt；閒置時完全不打。
// 動畫瘋是 push（heartbeat），最即時，優先採用。
apiRouter.get('/watch/now', async (req, res) => {
  const cur = currentNowWatching();
  if (!(cur && cur.source === 'bahamut') && Date.now() - lastTraktPollAt > TRAKT_POLL_MIN_MS) {
    await pollTraktWatching();
  }
  const w = currentNowWatching();
  if (!w) return res.json({ watching: null });
  const { expiresAt, ...pub } = w;
  res.json({ watching: pub });
});

// ── 後台輪詢 Trakt /watching（TV/電影即時；需 Plex/瀏覽器 scrobbler 餵 Trakt）──
let traktSlug = null;
async function getTraktSlug(tok) {
  if (traktSlug) return traktSlug;
  try {
    const { data } = await traktGet(tok, '/users/settings');
    traktSlug = data?.user?.ids?.slug || null;
  } catch (e) {
    /* ignore */
  }
  return traktSlug;
}
async function pollTraktWatching() {
  lastTraktPollAt = Date.now();
  const tok = await getValidTraktToken();
  if (!tok) return;
  const slug = await getTraktSlug(tok);
  if (!slug) return;
  const clearTrakt = () => { if (nowWatching?.source === 'trakt') nowWatching = null; };
  try {
    const r = await fetch(`https://api.trakt.tv/users/${slug}/watching`, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': TRAKT_UA,
        'trakt-api-version': '2',
        'trakt-api-key': TRAKT_CLIENT_ID,
        Authorization: `Bearer ${tok.access_token}`,
      },
    });
    if (r.status === 204 || r.status === 404 || !r.ok) { clearTrakt(); return; } // 沒在看 → 清掉 Trakt 那條
    const d = await r.json();
    let type = null;
    let title = null;
    let tmdbId = null;
    let episode = null;
    if (d.type === 'movie' && d.movie) {
      type = 'movie';
      title = d.movie.title;
      tmdbId = d.movie.ids?.tmdb || null;
    } else if (d.type === 'episode' && d.show && d.episode) {
      type = 'tv';
      title = d.show.title;
      tmdbId = d.show.ids?.tmdb || null;
      episode = `S${String(d.episode.season).padStart(2, '0')}E${String(d.episode.number).padStart(2, '0')}`;
    } else {
      clearTrakt();
      return;
    }
    const now = Date.now();
    const started = d.started_at ? Date.parse(d.started_at) : now;
    let progressPct = null;
    if (d.started_at && d.expires_at) {
      const total = Date.parse(d.expires_at) - started;
      if (total > 0) progressPct = Math.max(0, Math.min(100, Math.round(((now - started) / total) * 100)));
    }
    nowWatching = {
      type,
      title,
      cover: null,
      tmdbId,
      episode,
      progressPct,
      source: 'trakt',
      externalUrl: tmdbUrlFor(type, tmdbId),
      startedAt: started,
      expiresAt: now + NOW_WATCHING_TTL_MS,
    };
  } catch (e) {
    /* ignore */
  }
}
// 不在背景常駐輪詢；改由 GET /watch/now 按需 + 節流觸發（見上）

/* ═════════════════════════════════════════════════════════════
   Letterboxd RSS — 拉 timo9378 的 diary RSS、塞 film_history
   只能拿到 user 之後手動 log 的 diary entry；watched 清單不在 RSS 裡
═════════════════════════════════════════════════════════════ */
const LETTERBOXD_RSS = 'https://letterboxd.com/timo9378/rss/';
const LETTERBOXD_UA = 'koimsurai/1.0 (+https://koimsurai.com)';

/** 從 Letterboxd RSS <item> 抽我們要的欄位。RSS 簡單，用正則撐住。 */
function parseLetterboxdItem(itemXml) {
  const grab = (tag) => {
    const m = itemXml.match(new RegExp(`<${tag.replace('.', '\\.')}>([\\s\\S]*?)<\\/${tag.replace('.', '\\.')}>`));
    if (!m) return null;
    return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim();
  };
  const title = grab('letterboxd:filmTitle');
  if (!title) return null;
  return {
    title,
    year: parseInt(grab('letterboxd:filmYear') || '', 10) || null,
    watchedDate: grab('letterboxd:watchedDate'), // 'YYYY-MM-DD'
    rating: parseFloat(grab('letterboxd:memberRating') || ''), // 0~5.0, 半顆星可
    tmdbId: parseInt(grab('tmdb:movieId') || '', 10) || null,
  };
}

let letterboxdSyncRunning = false;
async function syncLetterboxdRss() {
  if (letterboxdSyncRunning) { console.log('[Letterboxd] sync in progress, skip'); return; }
  letterboxdSyncRunning = true;
  console.log('[Letterboxd] sync start');
  try {
    const r = await fetch(LETTERBOXD_RSS, { headers: { 'User-Agent': LETTERBOXD_UA } });
    if (!r.ok) throw new Error(`fetch ${r.status}`);
    const xml = await r.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    let added = 0, updated = 0;
    for (const itemXml of items) {
      const parsed = parseLetterboxdItem(itemXml);
      if (!parsed?.title || !parsed?.watchedDate) continue;
      // ON CONFLICT: keep Netflix tmdb_id but bring in rating + letterboxd ID
      await new Promise((resolve) => {
        db.run(
          `INSERT INTO film_history (title, watched_date, rating, source, tmdb_id, release_year)
           VALUES (?, ?, ?, 'letterboxd', ?, ?)
           ON CONFLICT(title, watched_date) DO UPDATE SET
             rating = COALESCE(excluded.rating, film_history.rating),
             tmdb_id = COALESCE(film_history.tmdb_id, excluded.tmdb_id),
             release_year = COALESCE(film_history.release_year, excluded.release_year)`,
          [
            parsed.title,
            parsed.watchedDate,
            Number.isFinite(parsed.rating) ? Math.round(parsed.rating) : null,
            parsed.tmdbId,
            parsed.year,
          ],
          function () {
            if (this.changes > 0) (this.lastID > 0 ? added++ : updated++);
            resolve();
          },
        );
      });
    }
    console.log(`[Letterboxd] sync done: ${items.length} items processed (added/updated)`);
  } catch (e) {
    console.error('[Letterboxd] sync error:', e.message);
  } finally {
    letterboxdSyncRunning = false;
  }
}

// Letterboxd RSS 同步：已停用（電影改走 Trakt，Letterboxd 對電影重複；現有資料不受影響）。
// parseLetterboxdItem / syncLetterboxdRss 保留在上方，想復用就把下面兩行取消註解即可。
// setTimeout(() => syncLetterboxdRss(), 120 * 1000);
// setInterval(() => syncLetterboxdRss(), 4 * 60 * 60 * 1000);

};
