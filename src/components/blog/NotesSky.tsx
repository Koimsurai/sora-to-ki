// 手記列表（星軌天空版）：印在夜空照片上的字。
// 頁首 → 分類分頁＋搜尋／排序 → 左邊月份索引、右邊三種密度交錯：
// 最新一篇的大卡、兩欄卡片、更早的緊湊列表。每篇用自己的星座（PostGlyph）當封面。
// 資料與篩選沿用 Blog.tsx 那一套（queryOptions、lib/blogFilter）。
import { useMemo, useState, useEffect } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FaSearch, FaTimes } from 'react-icons/fa';
import type { PostListItem } from '@koimsurai/api-types';
import { LocaleLink } from '@/i18n/locale-link';
import { useLocale } from '@/hooks/useLocale';
import { filterPosts, groupPostsByMonth } from '@/lib/blogFilter';
import { parseServerDate } from '@/lib/serverDate';
import { postsListQueryOptions, blogTagsQueryOptions, blogCategoriesQueryOptions } from '@/data/blogList';
import { useCategoryLabel, useTagLabel } from '@/lib/categoryLabel';
import { postPath } from '@/lib/postPath';
import KoimLoader from '@/components/common/KoimLoader';
import PostGlyph from './PostGlyph';
import './NotesSky.css';

type Post = PostListItem;

/** markdown → 純文字的摘要（同 Blog.tsx 的 NoteCard） */
function plainExcerpt(post: Post, max: number): string {
  if (!post.content_preview) return '';
  const text = post.content_preview
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}\s+|[-*+]\s+|>\s?)/gm, '')
    .replace(/[*`]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
  return text.length > max ? `${text.substring(0, max)}…` : text;
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

export default function NotesSky() {
  const { t } = useTranslation();
  const locale = useLocale();
  const categoryLabel = useCategoryLabel();
  const tagLabel = useTagLabel();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const { data: posts = [], isPending } = useQuery(postsListQueryOptions(locale, sortBy));
  const { data: allTags = [] } = useQuery(blogTagsQueryOptions(locale));
  const { data: allCategories = [] } = useQuery(blogCategoriesQueryOptions(locale));
  const search = useRouterState({ select: (s) => s.location.search }) as { category?: string; tag?: string };

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
  const months = useMemo(() => groupPostsByMonth(filtered), [filtered]);
  const reads = useMemo(() => posts.reduce((s, p) => s + p.view_count, 0), [posts]);
  const filtering = Boolean(searchTerm || selectedTag || selectedCategory);

  if (isPending) return <KoimLoader fullscreen text={t('blog.loading')} />;

  const [featured, ...others] = filtered;
  const grid = others.slice(0, 4);
  const rest = groupPostsByMonth(others.slice(4));
  const jump = (key: string) => {
    document.querySelector(`[data-month="${key}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const meta = (p: Post) => {
    const d = parseServerDate(p.created_at);
    return { d, date: ymd(d), key: monthKey(d) };
  };

  return (
    <div className="notes-page">
      <header className="notes-head">
        <h1 className="notes-title">
          {t('blog.heroTitle')}
          <span className="notes-title-en">Notes</span>
        </h1>
        <p className="notes-desc">記錄技術探索、開發心得與生活碎片。每一篇都是當下最真誠的思考。</p>
        <p className="notes-stats">
          <span>
            <b>{posts.length}</b> 篇
          </span>
          <span>
            <b>{allTags.length}</b> 個標籤
          </span>
          <span>
            <b>{reads.toLocaleString('en-US')}</b> 次閱讀
          </span>
        </p>
      </header>

      <div className="notes-bar">
        <div className="notes-tabs" role="tablist" aria-label="分類">
          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === ''}
            className="notes-tab"
            onClick={() => setSelectedCategory('')}
          >
            全部 <span>{posts.length}</span>
          </button>
          {allCategories
            .filter((c) => c.post_count > 0)
            .map((c) => (
              <button
                key={c.name}
                type="button"
                role="tab"
                aria-selected={selectedCategory === c.name}
                className="notes-tab"
                onClick={() => setSelectedCategory(c.name)}
              >
                {categoryLabel(c.name)} <span>{c.post_count}</span>
              </button>
            ))}
        </div>
        <div className="notes-tools">
          <label className="notes-search">
            <FaSearch aria-hidden="true" />
            <input
              type="search"
              placeholder={t('blog.search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </label>
          <div className="notes-sort">
            {(['newest', 'popular', 'oldest'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={sortBy === v}
                className="notes-sort-btn"
                onClick={() => setSortBy(v)}
              >
                {t(`blog.sort.${v}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="notes-body">
        <nav className="notes-rail" aria-label="依月份">
          {months.map((m, i) => (
            <div key={`${m.year}-${m.month}`}>
              {(i === 0 || months[i - 1].year !== m.year) && <div className="notes-rail-year">{m.year}</div>}
              <button type="button" className="notes-rail-month" onClick={() => jump(`${m.year}-${m.month}`)}>
                <span>{m.month + 1} 月</span>
                <span>{m.posts.length}</span>
              </button>
            </div>
          ))}
          {allTags.length > 0 && (
            <div className="notes-rail-tags">
              <div className="notes-rail-year">標籤</div>
              {allTags.slice(0, 14).map((tag) => {
                const name = typeof tag === 'object' ? tag.name : tag;
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={selectedTag === name}
                    className="notes-rail-tag"
                    onClick={() => setSelectedTag(selectedTag === name ? '' : name)}
                  >
                    #{tagLabel(name)}
                  </button>
                );
              })}
            </div>
          )}
        </nav>

        <div className="notes-main">
          {filtering && (
            <div className="notes-filter">
              {[selectedCategory && categoryLabel(selectedCategory), selectedTag && `#${tagLabel(selectedTag)}`, searchTerm]
                .filter(Boolean)
                .join(' · ')}
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedTag('');
                  setSelectedCategory('');
                }}
              >
                <FaTimes aria-hidden="true" /> {t('blog.clearFilters')}
              </button>
            </div>
          )}

          {!featured ? (
            <p className="notes-empty">{filtering ? t('blog.emptyFiltered') : t('blog.emptyNone')}</p>
          ) : (
            <>
              <LocaleLink to={postPath(featured)} className="notes-feature" data-month={meta(featured).key}>
                <div className="notes-feature-text">
                  <div className="notes-meta">
                    <span className="notes-cat">{categoryLabel(featured.category)}</span>
                    <span>{meta(featured).date}</span>
                    <span>{featured.view_count} 次閱讀</span>
                  </div>
                  <h2 className="notes-feature-title">{featured.title}</h2>
                  <p className="notes-feature-excerpt">{plainExcerpt(featured, 160)}</p>
                  <div className="notes-tags">
                    {featured.tags.slice(0, 4).map((tag) => (
                      <span key={tag}>#{tagLabel(tag)}</span>
                    ))}
                  </div>
                </div>
                <PostGlyph seed={featured.slug ?? String(featured.id)} className="notes-feature-glyph" />
              </LocaleLink>

              {grid.length > 0 && (
                <div className="notes-grid">
                  {grid.map((p) => (
                    <LocaleLink key={p.id} to={postPath(p)} className="notes-card" data-month={meta(p).key}>
                      <PostGlyph seed={p.slug ?? String(p.id)} className="notes-card-glyph" />
                      <div className="notes-meta">
                        <span>{meta(p).date}</span>
                        <span>{p.view_count} 次閱讀</span>
                      </div>
                      <h3 className="notes-card-title">{p.title}</h3>
                    </LocaleLink>
                  ))}
                </div>
              )}

              {rest.length > 0 && (
                <div className="notes-rows">
                  {rest.map((g) => (
                    <section key={`${g.year}-${g.month}`} data-month={`${g.year}-${g.month}`}>
                      <h3 className="notes-rows-label">{g.label}</h3>
                      {g.posts.map((p) => (
                        <LocaleLink key={p.id} to={postPath(p)} className="notes-row">
                          <span className="notes-row-date">{meta(p).date.slice(5)}</span>
                          <span className="notes-row-title">{p.title}</span>
                          <span className="notes-row-cat">{categoryLabel(p.category)}</span>
                          <span className="notes-row-reads">{p.view_count}</span>
                        </LocaleLink>
                      ))}
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
