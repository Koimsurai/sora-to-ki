import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import SEOHead from './SEOHead';
import KoimLoader from './KoimLoader';
import ThoughtCard from './ThoughtCard';
import Comments from './Comments';
import './Thinking.css';

const API = import.meta.env.VITE_API_URL || '/api';

function ThinkingDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { isAdmin, getToken } = useAuth();
  const [thought, setThought] = useState(undefined); // undefined=載入中, null=找不到

  useEffect(() => {
    fetch(`${API}/thoughts/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setThought(d ? d.thought : null))
      .catch(() => setThought(null));
  }, [id]);

  const del = async (tid) => {
    if (!window.confirm('刪除這則碎念？')) return;
    await fetch(`${API}/admin/thoughts/${tid}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    window.location.href = '/thinking';
  };
  const edit = async (tid, content) => {
    await fetch(`${API}/admin/thoughts/${tid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ content }),
    });
    fetch(`${API}/thoughts/${tid}`).then((r) => (r.ok ? r.json() : null)).then((d) => setThought(d ? d.thought : null));
  };

  return (
    <div className="tk-page">
      <div className="tk-scrim" />
      <SEOHead title={t('thinking.title')} description={thought?.content || t('thinking.subtitle')} path={`/thinking/${id}`} />

      <div className="tk-wrap tk-wrap--detail">
        <Link to="/thinking" className="tk-back">← {t('thinking.back')}</Link>

        {thought === undefined && <KoimLoader inline size="sm" />}
        {thought === null && <p className="tk-empty">{t('thinking.notFound')}</p>}

        {thought && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <ThoughtCard th={thought} isAdmin={isAdmin} onDelete={del} onEdit={edit} detail />
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
