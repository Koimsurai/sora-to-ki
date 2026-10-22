// 手記列表（星軌天空版）。
// 一欄、少量資訊、寬留白：大標題壓在夜空上，文章清單放在一塊毛玻璃上（字才讀得清楚），
// 依年份分段，每篇只有標題、兩行摘要、日期與分類。最新一篇放大。
// 資料與篩選沿用 Blog.tsx 那一套（queryOptions、lib/blogFilter）。
import { useMemo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FaSearch } from 'react-icons/fa';
import type { PostListItem } from '@koimsurai/api-types';
import { LocaleLink } from '@/i18n/locale-link';
import { useLocale } from '@/hooks/useLocale';
import { filterPosts } from '@/lib/blogFilter';
import { parseServerDate } from '@/lib/serverDate';
import { postsListQueryOptions, blogCategoriesQueryOptions } from '@/data/blogList';
import { useCategoryLabel } from '@/lib/categoryLabel';
import { postPath } from '@/lib/postPath';
import { stripLocalePrefix } from '@/i18n/start-i18n';
import { flightElapsed } from '@/lib/horizon';
import KoimLoader from '@/components/common/KoimLoader';
import NotesGround from './NotesGround';
import './NotesSky.css';

type Post = PostListItem;

/** markdown → 純文字的摘要（同 Blog.tsx 的 NoteCard） */
function plainExcerpt(post: Post): string {
  if (!post.content_preview) return '';
  return post.content_preview
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}\s+|[-*+]\s+|>\s?)/gm, '')
    .replace(/[*`]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 進場與退場跟著土星的飛行走：
 *   進場：從首頁飛過來的話，等鏡頭快抵達，面板才從地裡升上來；直接打開這一頁就照常淡入
 *   退場：卸載的那一刻把整頁複製一份蓋在原地，沉回地底、淡掉——不然換頁時內容是瞬間消失的
 * ready：資料載完、頁面真的畫出來之後才有東西可以動
 */
function useArrival(pageRef: React.RefObject<HTMLDivElement | null>, ready: boolean) {
  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el || !ready) return;
    const elapsed = flightElapsed();
    if (elapsed !== null) {
      el.classList.add('is-arriving');
      el.style.setProperty('--arrive-delay', `${Math.max(0, 1100 - elapsed)}ms`);
    }
    return () => {
      // 開發模式的 StrictMode 會在原地卸載再掛回來：路徑沒變就不是真的離開
      if (stripLocalePrefix(window.location.pathname) === 'blog') return;
      const r = el.getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.className = 'notes-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      const clone = el.cloneNode(true) as HTMLElement;
      clone.classList.remove('is-arriving');
      // 地面不跟著沉（複製出來的 canvas 也是空的）
      clone.querySelector('.notes-ground')?.remove();
      clone.style.position = 'absolute';
      clone.style.top = `${r.top}px`;
      clone.style.left = `${r.left}px`;
      clone.style.width = `${r.width}px`;
      ghost.append(clone);
      document.body.append(ghost);
      // 下一頁的內容是立刻出現的，殘影要在前半段就淡掉，不然兩頁的字會疊在一起
      const sink = ghost.animate(
        [
          { transform: 'translateY(0)', opacity: 1 },
          { transform: 'translateY(10vh)', opacity: 0.25, offset: 0.45 },
          { transform: 'translateY(30vh)', opacity: 0 },
        ],
        { duration: 700, easing: 'cubic-bezier(0.55, 0, 0.85, 0.35)', fill: 'forwards' },
      );
      sink.onfinish = () => ghost.remove();
    };
  }, [pageRef, ready]);
}

export default function NotesSky() {
  const { t } = useTranslation();
  const locale = useLocale();
  const categoryLabel = useCategoryLabel();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const { data: posts = [], isPending } = useQuery(postsListQueryOptions(locale, sortBy));
  const { data: allCategories = [] } = useQuery(blogCategoriesQueryOptions(locale));
  const search = useRouterState({ select: (s) => s.location.search }) as { category?: string; tag?: string };
  const pageRef = useRef<HTMLDivElement | null>(null);

  // 跟 Blog.tsx 同一個理由：已經在 /blog 時再從選單點 ?category= 進來，要跟著換
  /* eslint-disable @eslint-react/set-state-in-effect */
  useEffect(() => {
    if (search.category) setSelectedCategory(search.category);
    if (search.tag) setSelectedTag(search.tag);
  }, [search.category, search.tag]);
  /* eslint-enable @eslint-react/set-state-in-effect */

  const filtered = useMemo(
    () => filterPosts(posts, { searchTerm, selectedTag, selectedCategory }),
    [posts, searchTerm, selectedTag, selectedCategory],
  );
  // 依年份分段（照目前的排序，同一年的放在一起）
  const years = useMemo(() => {
    const out: { year: number; posts: Post[] }[] = [];
    for (const p of filtered) {
      const y = parseServerDate(p.created_at).getFullYear();
      const last = out.at(-1);
      if (last?.year === y) last.posts.push(p);
      else out.push({ year: y, posts: [p] });
    }
    return out;
  }, [filtered]);

  useArrival(pageRef, !isPending);

  if (isPending) return <KoimLoader fullscreen text={t('blog.loading')} />;

  const leadId = filtered[0]?.id;

  return (
    <div className="notes-page" ref={pageRef}>
      <header className="notes-head">
        <h1 className="notes-title">{t('blog.heroTitle')}</h1>
        <p className="notes-desc">記錄技術探索、開發心得與生活碎片。</p>
      </header>

      <div className="notes-panel">
        <div className="notes-bar">
          <div className="notes-cats" role="tablist" aria-label="分類">
            {[{ name: '', post_count: posts.length }, ...allCategories.filter((c) => c.post_count > 0)].map((c) => (
              <button
                key={c.name || 'all'}
                type="button"
                role="tab"
                aria-selected={selectedCategory === c.name}
                className="notes-cat-btn"
                onClick={() => setSelectedCategory(c.name)}
              >
                {c.name ? categoryLabel(c.name) : '全部'}
              </button>
            ))}
          </div>
          <div className="notes-tools">
            <label className="notes-search">
              <FaSearch aria-hidden="true" />
              <input
                type="search"
                aria-label={t('blog.search')}
                placeholder={t('blog.search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </label>
            <select className="notes-sort" aria-label="排序" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {(['newest', 'popular', 'oldest'] as const).map((v) => (
                <option key={v} value={v}>
                  {t(`blog.sort.${v}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {years.length === 0 ? (
          <p className="notes-empty">{t('blog.emptyFiltered')}</p>
        ) : (
          years.map((y) => (
            <section key={y.year} className="notes-year">
              <h2 className="notes-year-label">{y.year}</h2>
              {y.posts.map((p) => {
                const d = parseServerDate(p.created_at);
                const lead = p.id === leadId;
                return (
                  <LocaleLink key={p.id} to={postPath(p)} className={`notes-entry${lead ? ' is-lead' : ''}`}>
                    <div className="notes-entry-main">
                      <h3 className="notes-entry-title">{p.title}</h3>
                      <p className="notes-entry-excerpt">{plainExcerpt(p)}</p>
                    </div>
                    <div className="notes-entry-side">
                      <time dateTime={p.created_at}>
                        {pad(d.getMonth() + 1)}.{pad(d.getDate())}
                      </time>
                      <span>{categoryLabel(p.category)}</span>
                    </div>
                  </LocaleLink>
                );
              })}
            </section>
          ))
        )}
      </div>
      <NotesGround />
    </div>
  );
}
