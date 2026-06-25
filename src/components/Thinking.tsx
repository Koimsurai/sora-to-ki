import { useState, useEffect, useCallback } from 'react';
import { motion, type Variants } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Rss } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import SEOHead from './SEOHead';
import ThoughtCard, { type Thought } from './ThoughtCard';
import './Thinking.css';

/* 碎念 / 思考 feed（接 /api/thoughts）— 路由未公開。
   admin 可在頂端發文（content + 選填連結 → 後端 unfurl）。 */

const API: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

interface Prefill { kind?: string; title?: string }

const listV: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } } };
const cardV: Variants = {
  hidden: { opacity: 0, x: -48 },
  show: { opacity: 1, x: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};
const headReveal = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
};

function Thinking() {
  const { t } = useTranslation();
  const { isAdmin, getToken } = useAuth();
  const [thoughts, setThoughts] = useState<Thought[] | null>(null);
  const [draft, setDraft] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [posting, setPosting] = useState(false);
  const [prefill, setPrefill] = useState<Prefill | null>(null); // 從 /watch 一鍵發帶來的 media

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('thinking_prefill');
      if (raw) { setPrefill(JSON.parse(raw) as Prefill); sessionStorage.removeItem('thinking_prefill'); }
    } catch { /* ignore */ }
  }, []);

  const load = useCallback(() => {
    void fetch(`${API}/thoughts?limit=50`)
      .then((r) => r.json() as Promise<{ thoughts?: Thought[] }>)
      .then((d) => setThoughts(d.thoughts ?? []))
      .catch(() => setThoughts([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!draft.trim() || posting) return;
    setPosting(true);
    try {
      const r = await fetch(`${API}/admin/thoughts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
        body: JSON.stringify({
          content: draft.trim(),
          refUrl: draftUrl.trim() || undefined,
          ref: prefill ? { type: 'media', json: prefill } : undefined,
        }),
      });
      if (r.ok) { setDraft(''); setDraftUrl(''); setPrefill(null); load(); }
    } finally {
      setPosting(false);
    }
  };
  const del = async (id: number) => {
    if (!window.confirm('刪除這則碎念？')) return;
    const r = await fetch(`${API}/admin/thoughts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken() ?? ''}` },
    });
    if (r.ok) load();
  };
  const edit = async (id: number, content: string) => {
    const r = await fetch(`${API}/admin/thoughts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
      body: JSON.stringify({ content }),
    });
    if (r.ok) load();
  };

  return (
    <div className="tk-page">
      <div className="tk-scrim" />
      <SEOHead title={t('thinking.title')} description={t('thinking.subtitle')} path="/thinking" />

      <div className="tk-wrap">
        <motion.header className="tk-header" {...headReveal}>
          <div className="tk-title-row">
            <h1 className="tk-title">{t('thinking.title')}</h1>
            <a className="tk-rss" href={`${API}/thoughts/rss`} target="_blank" rel="noopener noreferrer" aria-label="RSS">
              <Rss size={18} />
            </a>
          </div>
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
            {prefill && (
              <div className="tk-compose-chip">
                <span>🎬 {prefill.kind} · {prefill.title}</span>
                <button onClick={() => setPrefill(null)} aria-label="移除附加">✕</button>
              </div>
            )}
            <div className="tk-compose-row">
              <button className="tk-compose-send" onClick={() => { void submit(); }} disabled={posting || !draft.trim()}>
                {posting ? '發送中…' : '發送'}
              </button>
            </div>
          </div>
        )}

        {thoughts?.length === 0 && <p className="tk-empty">{t('thinking.empty')}</p>}

        {!!thoughts?.length && (
          <motion.ul
            className="tk-feed"
            variants={listV}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-40px' }}
          >
            {thoughts.map((th) => (
              <motion.li className="tk-feed-item" key={th.id} variants={cardV}>
                <ThoughtCard th={th} isAdmin={isAdmin} onDelete={(id) => { void del(id); }} onEdit={(id, content) => { void edit(id, content); }} />
              </motion.li>
            ))}
          </motion.ul>
        )}

        {!!thoughts?.length && (
          <motion.p className="tk-ending" {...headReveal}>{t('thinking.ending')}</motion.p>
        )}
      </div>
    </div>
  );
}

export default Thinking;
