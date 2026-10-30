import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { recentPostsFullQueryOptions } from '@/data/blogList';
import { useAdminT } from '@/i18n/admin-i18n';
import AdminLoading from './AdminLoading';
import './AdminPicker.css';

interface LinkablePost {
  id: number | string;
  title?: string;
  excerpt?: string;
  status?: string;
}

interface PostLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (post: LinkablePost) => void;
}

/**
 * 舊文章連結選擇器（C-3）
 * 由 Monaco editor 透過 Cmd/Ctrl+Shift+K 或 toolbar 按鈕觸發。
 * 拉一份 published posts 清單，提供模糊搜尋，點擊後 onSelect(post) 回傳。
 */
const PostLinkModal = ({ isOpen, onClose, onSelect }: PostLinkModalProps) => {
  const { t } = useAdminT();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 文章清單改由 TanStack Query 讀（開啟才抓）；reuse 公開 recentPostsFullQueryOptions(300)。
  const { data: allPosts = [], isFetching: loading } = useQuery({
    ...recentPostsFullQueryOptions(300),
    enabled: isOpen,
  });
  const posts = useMemo(() => allPosts.filter((p) => p.status === 'published' || !p.status), [allPosts]);

  useEffect(() => {
    if (!isOpen) return;
    // 每次開啟清空搜尋字。父層用 Dialog 常駐掛載（不是條件渲染），拿不到「重新 mount
    // 自動重設」的效果；而且這一幀 modal 才剛開始淡入，使用者看不到清空前的舊字。
    // eslint-disable-next-line @eslint-react/set-state-in-effect
    setQuery('');
    // 等 Dialog 動畫掛上再 focus；modal 快速關閉時要清掉，避免殘留計時器
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(focusTimer);
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return posts.slice(0, 50);
    return posts.filter((p) => p.title.toLowerCase().includes(q) || p.excerpt.toLowerCase().includes(q)).slice(0, 50);
  }, [posts, query]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="adm-picker-scrim fixed inset-0 z-10000 flex items-start justify-center pt-[12vh]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="adm-picker w-[min(640px,92vw)]"
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -8, opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="adm-picker-head">
            <label className="adm-prompt adm-grow">
              <Search className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <input
                ref={inputRef}
                type="text"
                placeholder={t('editor.linkModal.searchPlaceholder')}
                aria-label={t('editor.linkModal.searchLabel')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') onClose();
                  if (e.key === 'Enter' && filtered[0]) onSelect(filtered[0]);
                }}
              />
            </label>
            <button type="button" onClick={onClose} className="adm-icon-btn" aria-label={t('editor.linkModal.close')}>
              <X className="size-3.5" />
            </button>
          </div>
          <div className="adm-picker-body max-h-[60vh]">
            {loading && <AdminLoading label={t('editor.linkModal.loading')} />}
            {!loading && filtered.length === 0 && (
              <p className="adm-picker-empty">{query ? t('editor.linkModal.notFound') : t('editor.linkModal.none')}</p>
            )}
            {!loading && filtered.length > 0 && (
              <ul className="adm-picker-list">
                {filtered.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => onSelect(p)} className="adm-picker-item">
                      <span className="adm-picker-item-main">
                        <span className="adm-picker-item-title">{p.title}</span>
                        {p.excerpt && <span className="adm-picker-item-sub">{p.excerpt}</span>}
                      </span>
                      <code className="adm-picker-item-path">/blog/{p.id}</code>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="adm-picker-foot">
            <span>{t('editor.linkModal.foot')}</span>
            <span>{t('editor.linkModal.count', { shown: filtered.length, total: posts.length })}</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PostLinkModal;
