import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import SEOHead from './SEOHead';
import './Thinking.css';

/* ──────────────────────────────────────────────────────────────
   碎念 / 思考 — Innei 式短想法 feed（接 /api/thoughts）
   - 路由未公開（不在導覽列）
   - admin 可在頂端發文（content + 選填連結 → 後端 unfurl 出 OG 卡）
   - 待接：詳情頁/評論浮窗/按讚、/watch 一鍵發、blog 引用
─────────────────────────────────────────────────────────────── */

const API = import.meta.env.VITE_API_URL || '/api';
const AUTHOR = 'Koimsurai';

const listV = { hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } } };
const cardV = {
  hidden: { opacity: 0, x: -48 },
  show: { opacity: 1, x: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};
const headReveal = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
};

// sqlite 時間是 UTC（'YYYY-MM-DD HH:MM:SS'）→ 補 Z 再 parse
const toDate = (at) => new Date(String(at).replace(' ', 'T') + (String(at).includes('Z') ? '' : 'Z'));
const relTime = (at) => {
  const d = toDate(at);
  if (Number.isNaN(d.getTime())) return at;
  const sec = (Date.now() - d.getTime()) / 1000;
  if (sec < 60) return '剛剛';
  if (sec < 3600) return `${Math.floor(sec / 60)} 分鐘前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小時前`;
  if (sec < 86400 * 30) return `${Math.floor(sec / 86400)} 天前`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
};
const WK = ['日', '一', '二', '三', '四', '五', '六'];
const fullCh = (at) => {
  const d = toDate(at);
  if (Number.isNaN(d.getTime())) return at;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日星期${WK[d.getDay()]}`;
};

function Thinking() {
  const { t } = useTranslation();
  const { isAdmin, getToken } = useAuth();
  const [thoughts, setThoughts] = useState(null);
  const [draft, setDraft] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(() => {
    fetch(`${API}/thoughts?limit=50`)
      .then((r) => r.json())
      .then((d) => setThoughts(d.thoughts || []))
      .catch(() => setThoughts([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!draft.trim() || posting) return;
    setPosting(true);
    try {
      const r = await fetch(`${API}/admin/thoughts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ content: draft.trim(), refUrl: draftUrl.trim() || undefined }),
      });
      if (r.ok) { setDraft(''); setDraftUrl(''); load(); }
    } finally {
      setPosting(false);
    }
  };
  const del = async (id) => {
    if (!window.confirm('刪除這則碎念？')) return;
    const r = await fetch(`${API}/admin/thoughts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (r.ok) load();
  };

  return (
    <div className="tk-page">
      <div className="tk-scrim" />
      <SEOHead title={t('thinking.title')} description={t('thinking.subtitle')} path="/thinking" />

      <div className="tk-wrap">
        <motion.header className="tk-header" {...headReveal}>
          <h1 className="tk-title">{t('thinking.title')}</h1>
          <p className="tk-subtitle">{t('thinking.subtitle')}</p>
        </motion.header>

        {isAdmin && (
          <div className="tk-compose">
            <textarea
              className="tk-compose-text"
              placeholder="想到什麼，寫一句…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
            />
            <input
              className="tk-compose-url"
              type="text"
              placeholder="貼個連結（選填，自動抓預覽）"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
            />
            <div className="tk-compose-row">
              <button className="tk-compose-send" onClick={submit} disabled={posting || !draft.trim()}>
                {posting ? '發送中…' : '發送'}
              </button>
            </div>
          </div>
        )}

        {thoughts && thoughts.length === 0 && <p className="tk-empty">{t('thinking.empty')}</p>}

        {thoughts && thoughts.length > 0 && (
          <motion.ul
            className="tk-feed"
            variants={listV}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-40px' }}
          >
            {thoughts.map((th) => (
              <motion.li className="tk-card" key={th.id} variants={cardV}>
                <div className="tk-card-head">
                  <span className="tk-author">{AUTHOR}</span>
                  <time className="tk-time" dateTime={th.created_at}>{relTime(th.created_at)}</time>
                  {th.edited && th.updated_at && (
                    <span className="tk-edited" data-edited={`編輯於 ${fullCh(th.updated_at)}`}>（已編輯）</span>
                  )}
                </div>

                <p className="tk-text">{th.content}</p>

                {th.ref_type === 'link' && th.ref && (
                  <a className="tk-embed tk-embed--link tk-linkcard" href={th.ref_url} target="_blank" rel="noopener noreferrer">
                    <div className="tk-embed-info">
                      <h3 className="tk-embed-title">{th.ref.title || th.ref_url}</h3>
                      {th.ref.desc && <p className="tk-embed-desc">{th.ref.desc}</p>}
                      <span className="tk-embed-meta"><span className="tk-embed-site">🌐 {th.ref.site}</span></span>
                    </div>
                    {th.ref.image && <img className="tk-linkcard-img" src={th.ref.image} alt="" loading="lazy" />}
                  </a>
                )}

                {th.ref_type === 'media' && th.ref && (
                  <a className="tk-embed tk-embed--media tk-media" href={th.ref.url || th.ref_url} target="_blank" rel="noopener noreferrer">
                    <div className="tk-embed-info">
                      <span className="tk-embed-kind">{th.ref.kind} · {th.ref.year}</span>
                      <h3 className="tk-embed-title">{th.ref.title}</h3>
                      {th.ref.overview && <p className="tk-embed-desc">{th.ref.overview}</p>}
                      <span className="tk-embed-meta">★ {th.ref.rating} · {th.ref.genres} · {th.ref.source}</span>
                    </div>
                    {th.ref.poster && <img className="tk-media-poster" src={th.ref.poster} alt={th.ref.title} loading="lazy" />}
                  </a>
                )}

                <div className="tk-card-foot">
                  <div className="tk-stats">
                    <span>♡ {th.likes || 0}</span>
                    <span>☷ 0</span>
                  </div>
                  <div className="tk-foot-actions">
                    {isAdmin && <button className="tk-act" onClick={() => del(th.id)}>刪除</button>}
                    <span className="tk-view">查看 →</span>
                  </div>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        )}

        {thoughts && thoughts.length > 0 && (
          <motion.p className="tk-ending" {...headReveal}>{t('thinking.ending')}</motion.p>
        )}
      </div>
    </div>
  );
}

export default Thinking;
