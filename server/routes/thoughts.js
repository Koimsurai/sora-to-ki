/* 碎念 / 思考 thoughts — 從 index.js 原樣搬出（行為不變）：
   公開 feed / RSS / 單篇、admin CRUD（連結 unfurl、media ref TMDb enrich）、
   讚/倒讚、留言（複用 blog 留言系統的 createComment，由 index.js 注入）。
   由 index.js 注入相依後呼叫：require('./routes/thoughts')({ apiRouter, db, requireAdmin, createComment }) */
const TMDB_API_TOKEN = process.env.TMDB_API_TOKEN;

module.exports = function registerThoughtsRoutes({ apiRouter, db, requireAdmin, createComment }) {
/* ═════════════════════════════════════════════════════════════
   碎念 / 思考 thoughts — 公開 feed + admin CRUD（連結自動 unfurl og）
═════════════════════════════════════════════════════════════ */
const safeParse = (s) => { try { return JSON.parse(s); } catch { return null; } };

// 簡易 unfurl：抓 URL 的 og:title/description/image/site_name（admin 建立連結碎念時用）
async function unfurlUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 6000);
    const r = await fetch(url, {
      signal: ac.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; koimsurai-bot/1.0; +https://koimsurai.com)' },
    }).finally(() => clearTimeout(timer));
    if (!r.ok) return null;
    const html = (await r.text()).slice(0, 200000); // head 夠了
    const og = (prop) => {
      const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'));
      const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
      return (a && a[1]) || (b && b[1]) || null;
    };
    const dec = (s) => (s ? s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'") : s);
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return {
      title: dec(og('og:title') || (titleTag ? titleTag[1].trim() : null)),
      desc: dec(og('og:description') || og('description')),
      image: og('og:image'),
      site: dec(og('og:site_name')) || u.hostname.replace(/^www\./, ''),
    };
  } catch {
    return null;
  }
}

// 公開：列表
apiRouter.get('/thoughts', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '30', 10), 100);
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
  db.all(
    `SELECT t.*, (SELECT COUNT(*) FROM comments c WHERE c.thought_id = t.id AND c.status = 'approved') AS comment_count
       FROM thoughts t ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?`,
    [limit, offset],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const thoughts = (rows || []).map((r) => ({ ...r, edited: !!r.edited, ref: safeParse(r.ref_json) }));
      res.json({ message: 'success', thoughts });
    },
  );
});

// 公開：RSS feed（必須在 /:id 之前註冊，否則 'rss' 會被當成 id）
apiRouter.get('/thoughts/rss', (req, res) => {
  db.all('SELECT * FROM thoughts ORDER BY created_at DESC, id DESC LIMIT 30', (err, rows) => {
    if (err) return res.status(500).send('error');
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const items = (rows || []).map((r) => {
      const link = `https://koimsurai.com/thinking/${r.id}`;
      const ref = safeParse(r.ref_json);
      let desc = r.content || '';
      if (r.ref_type === 'link' && ref) desc += `\n\n🔗 ${ref.title || ''} ${r.ref_url || ''}`;
      else if (r.ref_type === 'media' && ref) desc += `\n\n🎬 ${ref.title || ''}`;
      const pub = new Date(String(r.created_at).replace(' ', 'T') + 'Z').toUTCString();
      return `<item><title>${esc((r.content || '').slice(0, 60))}</title><link>${link}</link><guid>${link}</guid><pubDate>${pub}</pubDate><description>${esc(desc)}</description></item>`;
    }).join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>碎念 · Koimsurai</title><link>https://koimsurai.com/thinking</link><description>想到什麼寫什麼</description>${items}</channel></rss>`;
    res.set('Content-Type', 'application/rss+xml; charset=utf-8').send(xml);
  });
});

// 公開：單篇
apiRouter.get('/thoughts/:id', (req, res) => {
  db.get(
    `SELECT t.*, (SELECT COUNT(*) FROM comments c WHERE c.thought_id = t.id AND c.status = 'approved') AS comment_count
       FROM thoughts t WHERE t.id = ?`, [req.params.id], (err, r) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!r) return res.status(404).json({ error: 'not found' });
    res.json({ message: 'success', thought: { ...r, edited: !!r.edited, ref: safeParse(r.ref_json) } });
  });
});

// 媒體 ref：給 tmdbId + mediaType，抓 TMDb 詳情補成完整卡片資料（/watch 一鍵發用）
async function enrichMediaRef(json) {
  const out = { ...json, source: 'www.themoviedb.org' };
  const mt = json.mediaType === 'movie' ? 'movie' : 'tv';
  out.url = json.tmdbId ? `https://www.themoviedb.org/${mt}/${json.tmdbId}` : null;
  if (TMDB_API_TOKEN && json.tmdbId) {
    try {
      const r = await fetch(`https://api.themoviedb.org/3/${mt}/${json.tmdbId}?language=zh-TW`, {
        headers: { Authorization: `Bearer ${TMDB_API_TOKEN}`, accept: 'application/json' },
      });
      if (r.ok) {
        const d = await r.json();
        out.title = json.title || d.title || d.name || '';
        out.overview = d.overview || '';
        out.rating = d.vote_average ? Number(d.vote_average).toFixed(1) : null;
        out.genres = (d.genres || []).map((g) => g.name).join(', ') || null;
        out.year = (d.release_date || d.first_air_date || '').slice(0, 4) || json.year || null;
        out.poster = json.poster || (d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null);
      }
    } catch { /* 抓不到就用傳入的基本資料 */ }
  }
  return out;
}

// admin：建立（content 必填；可帶 refUrl 連結自動 unfurl，或 ref:{type,url,json}）
apiRouter.post('/admin/thoughts', requireAdmin, async (req, res) => {
  const { content, refUrl, ref } = req.body || {};
  if (!content || !String(content).trim()) return res.status(400).json({ error: 'content required' });
  let refType = null, rUrl = null, refJson = null;
  if (ref && ref.type === 'media' && ref.json) {
    const m = await enrichMediaRef(ref.json);
    refType = 'media'; rUrl = m.url || null; refJson = JSON.stringify(m);
  } else if (ref && ref.type && ref.json) {
    refType = ref.type; rUrl = ref.url || null; refJson = JSON.stringify(ref.json);
  } else if (refUrl) {
    const meta = await unfurlUrl(refUrl);
    refType = 'link'; rUrl = refUrl; refJson = JSON.stringify(meta || {});
  }
  db.run(
    'INSERT INTO thoughts (content, ref_type, ref_url, ref_json) VALUES (?, ?, ?, ?)',
    [String(content).trim(), refType, rUrl, refJson],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'success', id: this.lastID });
    },
  );
});

// admin：編輯（標記 edited + updated_at）
apiRouter.put('/admin/thoughts/:id', requireAdmin, async (req, res) => {
  const { content, refUrl, ref, clearRef } = req.body || {};
  db.get('SELECT * FROM thoughts WHERE id = ?', [req.params.id], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'not found' });
    let refType = row.ref_type, rUrl = row.ref_url, refJson = row.ref_json;
    if (clearRef) { refType = null; rUrl = null; refJson = null; }
    else if (ref && ref.type && ref.json) { refType = ref.type; rUrl = ref.url || null; refJson = JSON.stringify(ref.json); }
    else if (refUrl && refUrl !== row.ref_url) { const meta = await unfurlUrl(refUrl); refType = 'link'; rUrl = refUrl; refJson = JSON.stringify(meta || {}); }
    db.run(
      'UPDATE thoughts SET content = ?, ref_type = ?, ref_url = ?, ref_json = ?, updated_at = CURRENT_TIMESTAMP, edited = 1 WHERE id = ?',
      [content != null ? String(content).trim() : row.content, refType, rUrl, refJson, req.params.id],
      (e) => (e ? res.status(500).json({ error: e.message }) : res.json({ message: 'success' })),
    );
  });
});

// admin：刪除（連同其留言）
apiRouter.delete('/admin/thoughts/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM comments WHERE thought_id = ?', [req.params.id], () => {});
  db.run('DELETE FROM thoughts WHERE id = ?', [req.params.id], (err) =>
    (err ? res.status(500).json({ error: err.message }) : res.json({ message: 'success' })),
  );
});

// thought 留言（複用 blog 同一套留言系統，只是 key 在 thought_id）
apiRouter.get('/thoughts/:id/comments', (req, res) => {
  db.all(
    "SELECT * FROM comments WHERE thought_id = ? AND status = 'approved' ORDER BY created_at ASC",
    [req.params.id],
    (err, rows) => (err ? res.status(400).json({ error: err.message }) : res.json({ message: 'success', comments: rows })),
  );
});
apiRouter.post('/thoughts/:id/comments', (req, res) => createComment(req, res, 'thought_id', req.params.id));

// 讚 / 倒讚：可取消、可切換。前端傳 { prev, next }（''|'like'|'dislike'），後端依差值調整計數。
// 無 per-user 表，信任 client 的 prev（個人站可接受，與留言讚同模型）。
apiRouter.post('/thoughts/:id/react', (req, res) => {
  const { prev, next } = req.body || {};
  const ok = (v) => v === 'like' || v === 'dislike' || v === '' || v == null;
  if (!ok(prev) || !ok(next)) return res.status(400).json({ error: 'bad reaction' });
  const dLike = (next === 'like' ? 1 : 0) - (prev === 'like' ? 1 : 0);
  const dDislike = (next === 'dislike' ? 1 : 0) - (prev === 'dislike' ? 1 : 0);
  db.run(
    'UPDATE thoughts SET likes = MAX(0, likes + ?), dislikes = MAX(0, dislikes + ?) WHERE id = ?',
    [dLike, dDislike, req.params.id],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      db.get('SELECT likes, dislikes FROM thoughts WHERE id = ?', [req.params.id], (e, row) =>
        res.json({ message: 'success', likes: row ? row.likes : 0, dislikes: row ? row.dislikes : 0 }));
    },
  );
});
};
