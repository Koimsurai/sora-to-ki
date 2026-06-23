import { useState, useEffect, useMemo } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FileText, Hash, Folder, Music, BookOpen, Activity,
  Home, Compass, Camera, Film, Tv, Settings, Search,
} from 'lucide-react';
import './CommandPalette.css';

const STATIC_PAGES = [
  { label: '首頁',    path: '/',          icon: Home,     keywords: 'home index 主頁' },
  { label: '手記',    path: '/blog',      icon: FileText, keywords: 'blog posts 文章 日記' },
  { label: '書櫃',    path: '/bookshelf', icon: BookOpen, keywords: 'books 閱讀 reading' },
  { label: '音樂',    path: '/music',     icon: Music,    keywords: 'music spotify 音樂' },
  { label: '活動',    path: '/activity',  icon: Activity, keywords: 'activity 活動 動態' },
  { label: '軌跡',    path: '/about#journey',   icon: Compass,  keywords: 'journey 旅程 時間線' },
  { label: '留言',    path: '/messages',  icon: Compass,  keywords: 'messages 留言 guestbook contact' },
  { label: '相簿',    path: '/photos',    icon: Camera,   keywords: 'photos 照片 相簿' },
  { label: '影劇',    path: '/cinema',    icon: Film,     keywords: 'cinema movie 影劇' },
  { label: '動漫',    path: '/anime',     icon: Tv,       keywords: 'anime 動畫 動漫' },
  { label: '工作站',  path: '/setup',     icon: Settings, keywords: 'setup 設備' },
];

export default function CommandPalette() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tags, setTags] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const navigate = useNavigate();

  // ⌘K / Ctrl+K 開關
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 首次打開時才載入清單（降低首屏成本）
  useEffect(() => {
    if (!open || loaded) return;
    Promise.all([
      fetch('/api/posts?limit=200').then(r => r.json()).catch(() => ({})),
      fetch('/api/categories').then(r => r.json()).catch(() => ({})),
      fetch('/api/tags').then(r => r.json()).catch(() => ({})),
    ]).then(([postsRes, catsRes, tagsRes]) => {
      const postsList = Array.isArray(postsRes) ? postsRes : (postsRes.posts || []);
      setPosts(postsList.filter(p => p.status === 'published' || !p.status));
      setCategories(catsRes.categories || []);
      setTags(tagsRes.tags || tagsRes || []);
      setLoaded(true);
    }).catch(console.error);
  }, [open, loaded]);

  const go = (path) => { setOpen(false); navigate(path); };

  const postItems = useMemo(() => posts.slice(0, 50), [posts]);

  if (!open) return null;

  return (
    <div className="cmdk-backdrop" onClick={() => setOpen(false)}>
      <div className="cmdk-wrap" onClick={(e) => e.stopPropagation()}>
        <Command label={t('commandPalette.label')} shouldFilter>
          <div className="cmdk-input-row">
            <Search className="cmdk-search-icon" size={16} />
            <Command.Input placeholder={t('commandPalette.placeholder')} autoFocus />
            <kbd className="cmdk-kbd">ESC</kbd>
          </div>

          <Command.List className="cmdk-list">
            <Command.Empty className="cmdk-empty">{t('commandPalette.empty')}</Command.Empty>

            <Command.Group heading={t('commandPalette.groups.pages')}>
              {STATIC_PAGES.map((p) => (
                <Command.Item
                  key={p.path}
                  value={`${p.label} ${p.keywords} ${p.path}`}
                  onSelect={() => go(p.path)}
                >
                  <p.icon size={14} className="cmdk-icon" />
                  <span>{p.label}</span>
                  <span className="cmdk-meta">{p.path}</span>
                </Command.Item>
              ))}
            </Command.Group>

            {postItems.length > 0 && (
              <Command.Group heading={t('commandPalette.groups.posts')}>
                {postItems.map((p) => (
                  <Command.Item
                    key={`post-${p.id}`}
                    value={`${p.title} ${p.excerpt || ''} ${(p.tags || []).join(' ')} ${p.category || ''}`}
                    onSelect={() => go(`/blog/${p.id}`)}
                  >
                    <FileText size={14} className="cmdk-icon" />
                    <span className="cmdk-truncate">{p.title}</span>
                    {p.category && <span className="cmdk-meta">{p.category}</span>}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {categories.length > 0 && (
              <Command.Group heading={t('commandPalette.groups.categories')}>
                {categories.map((c) => (
                  <Command.Item
                    key={`cat-${c.id}`}
                    value={`category ${c.name} ${c.short_description || ''}`}
                    onSelect={() => go(`/blog?category=${encodeURIComponent(c.name)}`)}
                  >
                    <Folder size={14} className="cmdk-icon" />
                    <span>{c.name}</span>
                    {c.post_count != null && <span className="cmdk-meta">{c.post_count} {t('blog.postCount')}</span>}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {tags.length > 0 && (
              <Command.Group heading={t('commandPalette.groups.tags')}>
                {tags.slice(0, 30).map((tag) => (
                  <Command.Item
                    key={`tag-${tag.id || tag.name}`}
                    value={`tag ${tag.name}`}
                    onSelect={() => go(`/blog?tag=${encodeURIComponent(tag.name)}`)}
                  >
                    <Hash size={14} className="cmdk-icon" />
                    <span>{tag.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          <div className="cmdk-footer">
            <span><kbd>↑↓</kbd> 移動</span>
            <span><kbd>↵</kbd> 開啟</span>
            <span><kbd>⌘K</kbd> 切換</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
