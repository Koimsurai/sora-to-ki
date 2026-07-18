import { useState, useEffect } from 'react';
import { useLoaderData, useParams } from '@tanstack/react-router';
import { LocaleLink } from '../locale-link';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import KoimLoader from './KoimLoader';
import ThoughtCard, { type Thought } from './ThoughtCard';
import Comments from './Comments';
import './Thinking.css';

const API: string = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

function ThinkingDetail() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }); // 兩種路由（/thinking/$id、/$locale/thinking/$id）共用
  const { isAdmin, getToken } = useAuth();
  // 路由 loader 在 server 端抓好的碎念（兩條路由共用此元件 → strict:false）
  const initial = (useLoaderData({ strict: false }) as { thought?: Thought } | undefined)?.thought;
  const [thought, setThought] = useState<Thought | null | undefined>(initial); // undefined=載入中, null=找不到

  useEffect(() => {
    if (initial) return; // loader 已在 server 端抓好 → 不重打
    void fetch(`${API}/thoughts/${id}`)
      .then((r) => (r.ok ? r.json() as Promise<{ thought: Thought }> : null))
      .then((d) => setThought(d ? d.thought : null))
      .catch(() => setThought(null));
  }, [id]);

  const del = async (tid: number) => {
    if (!window.confirm('刪除這則碎念？')) return;
    await fetch(`${API}/admin/thoughts/${tid}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken() ?? ''}` },
    });
    window.location.href = '/thinking';
  };
  const edit = async (tid: number, content: string) => {
    await fetch(`${API}/admin/thoughts/${tid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
      body: JSON.stringify({ content }),
    });
    void fetch(`${API}/thoughts/${tid}`).then((r) => (r.ok ? r.json() as Promise<{ thought: Thought }> : null)).then((d) => setThought(d ? d.thought : null));
  };

  return (
    <div className="tk-page">
      <div className="tk-scrim" />

      <div className="tk-wrap tk-wrap--detail">
        <LocaleLink to="/thinking" className="tk-back">← {t('thinking.back')}</LocaleLink>

        {thought === undefined && <KoimLoader inline size="sm" />}
        {thought === null && <p className="tk-empty">{t('thinking.notFound')}</p>}

        {thought && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <ThoughtCard th={thought} isAdmin={isAdmin} onDelete={(tid) => { void del(tid); }} onEdit={(tid, content) => { void edit(tid, content); }} detail />
            <div className="tk-comments">
              <Comments postId={thought.id} basePath="thoughts" />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default ThinkingDetail;
