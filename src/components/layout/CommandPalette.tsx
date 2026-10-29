import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { useLocale, useLocaleNavigate } from '@/hooks/useLocale';
import { useTranslation } from 'react-i18next';
import { recentPostsQueryOptions, blogCategoriesQueryOptions, blogTagsQueryOptions } from '@/data/blogList';
// 頁面：登記表裡的每一頁（首頁、導覽列的每一區、兩個選單），搜尋別名也在登記表裡
import { PAGES } from '@/data/siteSections';
import { useSiteConfig } from '@/data/siteConfig';
import { closeCommandPalette, toggleCommandPalette, useCommandPaletteOpen } from '@/store/commandPaletteStore';
import './CommandPalette.css';
import { useCategoryLabel } from '@/lib/categoryLabel';

export default function CommandPalette() {
  const categoryLabel = useCategoryLabel();
  const { t } = useTranslation();
  // 開關狀態在 store 裡而不是這裡：手機沒有 ⌘K，404 頁需要一顆按鈕打得開它。
  // 理由見 store/commandPaletteStore.ts。
  const open = useCommandPaletteOpen();
  const navigate = useLocaleNavigate();
  const navLocale = useLocale();
  // 站台設定關掉的頁面不列
  const disabled = useSiteConfig().disabled_pages;
  const pages = useMemo(() => PAGES.filter((p) => !disabled.includes(p.key)), [disabled]);

  // ⌘K / Ctrl+K 開關
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      } else if (e.key === 'Escape') {
        closeCommandPalette();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // 首次打開才載入（enabled: open，降低首屏成本）；三源改吃共用 query 快取。
  const { data: postsData = [] } = useQuery({ ...recentPostsQueryOptions(200, navLocale), enabled: open });
  const { data: categories = [] } = useQuery({ ...blogCategoriesQueryOptions(navLocale), enabled: open });
  const { data: tags = [] } = useQuery({ ...blogTagsQueryOptions(navLocale), enabled: open });
  const posts = useMemo(() => postsData.filter((p) => p.status === 'published' || !p.status), [postsData]);

  const go = (path: string) => {
    closeCommandPalette();
    void navigate(path);
  };

  const postItems = useMemo(() => posts.slice(0, 50), [posts]);

  if (!open) return null;

  return (
    // 用 e.target === e.currentTarget 判斷「點在遮罩本身」，而不是靠內層 div
    // stopPropagation 擋冒泡：後者等於在一個非互動元素上掛 onClick，只為了
    // 攔事件。改掉之後內層那層純事件管線的 onClick 可以整個拿掉。
    // 點遮罩關閉是滑鼠的便利路徑，不是唯一出口：cmdk 原生處理 Escape，
    // 輸入框也在焦點序列內。遮罩本身不該進 Tab 序列（那反而多一個空的停留點）
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events,jsx-a11y/no-static-element-interactions
    <div
      className="cmdk-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeCommandPalette();
      }}
    >
      <div className="cmdk-wrap">
        <Command label={t('commandPalette.label')} shouldFilter>
          <div className="cmdk-input-row">
            <span className="cmdk-prompt" aria-hidden="true">
              &gt;
            </span>
            {/* 命令面板一開就該能直接打字——autoFocus 正是使用者預期，少了它反而要多按一次 Tab */}
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <Command.Input placeholder={t('commandPalette.placeholder')} autoFocus />
            <kbd className="cmdk-kbd">ESC</kbd>
          </div>

          <Command.List className="cmdk-list">
            <Command.Empty className="cmdk-empty">{t('commandPalette.empty')}</Command.Empty>

            <Command.Group heading={t('commandPalette.groups.pages')}>
              {pages.map((p) => {
                const label = p.key === 'home' ? t('commandPalette.home') : t(`siteNav.${p.key}`);
                return (
                  <Command.Item key={p.to} value={`${label} ${p.keywords} ${p.to}`} onSelect={() => go(p.to)}>
                    <i className="cmdk-dot" aria-hidden="true" />
                    <span>{label}</span>
                    <span className="cmdk-meta">{p.caps}</span>
                  </Command.Item>
                );
              })}
            </Command.Group>

            {postItems.length > 0 && (
              <Command.Group heading={t('commandPalette.groups.posts')}>
                {postItems.map((p) => (
                  <Command.Item
                    key={`post-${p.id}`}
                    value={`${p.title} ${p.excerpt} ${p.tags.join(' ')} ${p.category ?? ''}`}
                    onSelect={() => go(`/blog/${p.id}`)}
                  >
                    <i className="cmdk-dot" aria-hidden="true" />
                    <span className="cmdk-truncate">{p.title}</span>
                    {p.category && <span className="cmdk-meta">{categoryLabel(p.category)}</span>}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {categories.length > 0 && (
              <Command.Group heading={t('commandPalette.groups.categories')}>
                {categories.map((c) => (
                  <Command.Item
                    key={`cat-${c.name}`}
                    value={`category ${c.name} ${categoryLabel(c.name)}`}
                    onSelect={() => go(`/blog?category=${encodeURIComponent(c.name)}`)}
                  >
                    <i className="cmdk-dot" aria-hidden="true" />
                    <span>{categoryLabel(c.name)}</span>
                    {
                      <span className="cmdk-meta">
                        {c.post_count} {t('blog.postCount')}
                      </span>
                    }
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {tags.length > 0 && (
              <Command.Group heading={t('commandPalette.groups.tags')}>
                {tags.slice(0, 30).map((tag) => {
                  // blogTagsQueryOptions 的 Tag 是 string | {name} union（對齊 Blog 頁）
                  const name = typeof tag === 'object' ? tag.name : tag;
                  return (
                    <Command.Item
                      key={`tag-${name}`}
                      value={`tag ${name}`}
                      onSelect={() => go(`/blog?tag=${encodeURIComponent(name)}`)}
                    >
                      <i className="cmdk-dot" aria-hidden="true" />
                      <span>{name}</span>
                      <span className="cmdk-meta">#</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}
          </Command.List>

          <div className="cmdk-footer">
            <span>
              <kbd>↑↓</kbd> {t('commandPalette.keys.move')}
            </span>
            <span>
              <kbd>↵</kbd> {t('commandPalette.keys.open')}
            </span>
            <span>
              <kbd>⌘K</kbd> {t('commandPalette.keys.toggle')}
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}
