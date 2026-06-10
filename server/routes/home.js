/* 首頁「動態帶」資料 — 一次回傳近期文章 / 碎念 / 留言迴聲 / 年度軌跡，
   以及依語系的每日名言代理（zh 走一言+opencc 轉繁、en 走 ZenQuotes、
   ja 走 meigen.doodlenote、ko 走 korean-advice-open-api）。
   由 index.js 注入相依後呼叫：require('./routes/home')({ apiRouter, db }) */

// ── 每日名言：各語系來源 + 当日快取 + 失敗 fallback ──
const QUOTE_FALLBACKS = {
  'zh-TW': [
    { text: '強大使人快樂。', from: '一拳超人' },
    { text: '迷惘的時候，就選比較難走的那條路。', from: '宮崎駿' },
  ],
  'zh-CN': [
    { text: '强大使人快乐。', from: '一拳超人' },
    { text: '迷惘的时候，就选比较难走的那条路。', from: '宫崎骏' },
  ],
  en: [
    { text: 'Stay hungry. Stay foolish.', from: 'Steve Jobs' },
    { text: 'Simplicity is the ultimate sophistication.', from: 'Leonardo da Vinci' },
  ],
  ja: [
    { text: '夢を見るから、人生は輝く。', from: 'モーツァルト' },
    { text: '止まりさえしなければ、どんなにゆっくりでも進めばよい。', from: '孔子' },
  ],
  ko: [
    { text: '음악은 인간의 내면으로부터 나오는 폭발이다.', from: '베토벤' },
    { text: '천 리 길도 한 걸음부터.', from: '속담' },
  ],
};

let _openccS2T = null;
function s2t(text) {
  try {
    if (!_openccS2T) {
      const OpenCC = require('opencc-js');
      _openccS2T = OpenCC.Converter({ from: 'cn', to: 'tw' });
    }
    return _openccS2T(text);
  } catch {
    return text;
  }
}

async function fetchWithTimeout(url, ms = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'koimsurai.com daily-quote' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

// 各語系抓取器 → 統一回 { text, from }
const QUOTE_SOURCES = {
  // 一言：动画/漫画/文学/诗词/哲学 分類
  zh: async () => {
    const j = await fetchWithTimeout('https://v1.hitokoto.cn/?c=a&c=b&c=d&c=i&c=k');
    const from = [j.from_who, j.from].filter(Boolean).join('「') + (j.from_who && j.from ? '」' : '');
    return { text: j.hitokoto, from: from || j.from || '' };
  },
  en: async () => {
    const j = await fetchWithTimeout('https://zenquotes.io/api/today');
    return { text: j[0].q, from: j[0].a };
  },
  ja: async () => {
    const j = await fetchWithTimeout('https://meigen.doodlenote.net/api/json.php?c=1');
    return { text: j[0].meigen, from: j[0].auther }; // auther 是該 API 自己的拼字
  },
  ko: async () => {
    const j = await fetchWithTimeout('https://korean-advice-open-api.vercel.app/api/advice');
    return { text: j.message, from: j.author };
  },
};

const SUPPORTED_QUOTE_LOCALES = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'];
const quoteCache = new Map(); // key: `${date}|${locale}` → { text, from }

async function getDailyQuote(locale) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${today}|${locale}`;
  if (quoteCache.has(key)) return quoteCache.get(key);

  let quote = null;
  try {
    if (locale === 'zh-TW' || locale === 'zh-CN') {
      const raw = await QUOTE_SOURCES.zh();
      quote = locale === 'zh-TW' ? { text: s2t(raw.text), from: s2t(raw.from) } : raw;
    } else {
      quote = await QUOTE_SOURCES[locale]();
    }
    if (!quote?.text) throw new Error('empty quote');
  } catch (e) {
    console.warn(`[quote] ${locale} 來源失敗（${e.message}），用 fallback`);
    const pool = QUOTE_FALLBACKS[locale] || QUOTE_FALLBACKS['zh-TW'];
    // 用日期挑 fallback，同一天固定同一句
    quote = pool[new Date().getDate() % pool.length];
  }
  quoteCache.set(key, quote);
  // 只保留今天的 key，避免 Map 無限長大
  for (const k of quoteCache.keys()) if (!k.startsWith(today)) quoteCache.delete(k);
  return quote;
}

module.exports = function registerHomeRoutes({ apiRouter, db }) {
  // GET /api/quote/daily?locale=zh-TW — 每日名言（依語系，当日快取）
  apiRouter.get('/quote/daily', async (req, res) => {
    const locale = SUPPORTED_QUOTE_LOCALES.includes(req.query.locale) ? req.query.locale : 'zh-TW';
    const quote = await getDailyQuote(locale);
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ message: 'success', quote });
  });

  // GET /api/home/digest — 首頁動態帶（文章/碎念/迴聲/年度軌跡），60s 快取
  let digestCache = { ts: 0, data: null };
  apiRouter.get('/home/digest', (req, res) => {
    if (digestCache.data && Date.now() - digestCache.ts < 60 * 1000) {
      return res.json({ message: 'success', ...digestCache.data });
    }
    const out = {};
    const tasks = [
      (cb) => db.all(
        `SELECT id, title, category, created_at FROM posts
         WHERE status = 'published' ORDER BY created_at DESC LIMIT 5`,
        (e, rows) => { out.posts = rows || []; cb(e); }),
      (cb) => db.all(
        `SELECT id, substr(content, 1, 120) AS content, ref_type, created_at FROM thoughts
         ORDER BY created_at DESC LIMIT 3`,
        (e, rows) => { out.thoughts = rows || []; cb(e); }),
      (cb) => db.all(
        `SELECT c.id, c.author, substr(c.content, 1, 80) AS content, c.created_at,
                c.post_id, c.thought_id, p.title AS post_title
         FROM comments c LEFT JOIN posts p ON p.id = c.post_id
         WHERE c.status = 'approved' AND c.is_admin = 0
         ORDER BY c.created_at DESC LIMIT 4`,
        (e, rows) => { out.comments = rows || []; cb(e); }),
      (cb) => db.all(
        `SELECT id, title, created_at FROM posts
         WHERE status = 'published' AND created_at >= date('now', 'start of year')
         ORDER BY created_at ASC`,
        (e, rows) => { out.timeline = rows || []; cb(e); }),
    ];
    let pending = tasks.length;
    let failed = false;
    tasks.forEach((t) => t((e) => {
      if (e && !failed) { failed = true; return res.status(500).json({ error: e.message }); }
      if (--pending === 0 && !failed) {
        digestCache = { ts: Date.now(), data: out };
        res.json({ message: 'success', ...out });
      }
    }));
  });
};
