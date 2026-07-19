import { isValidElement, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkAlert } from 'remark-github-blockquote-alert';
import rehypeRaw from 'rehype-raw';
// 匯入完整文章 CSS：讓這個 SSR/Suspense fallback「就已經是有樣式的文章」——否則首次進文章
// （或冷開 URL hydration）會先閃一下無樣式版（純 sans-serif、markdown 無 prose），才換成
// FullBlogPost。結構鏡像 FullBlogPost 的靜態骨架，換上去時只是加 shiki 反白/mermaid/互動，
// 不再是「整頁重繪」。CSS 進本路由 chunk（非全域），FullBlogPost lazy chunk 共用同一份、不重載。
import '../components/BlogPost.css';
import type { PostDetailResponse } from '@koimsurai/api-types';
import { slugify, computeReadTime, type TocHeading } from '../lib/blogContent';

// SSR fallback 用的文章形狀 = 後端生成的單篇回應（消手寫 interface，對齊 BlogPost 主型別）。
export type PostData = PostDetailResponse;

// 側欄骨架列（shimmer）。寬度陣列 → 每列一根，長短交錯像真實清單。
function SkelBars({ widths, height = 13 }: { widths: number[]; height?: number }) {
  return (
    <>
      {widths.map((w, i) => (
        <div key={`${w}-${i}`} className="bp-skel" style={{ height, width: `${w}%`, margin: '0 0 12px' }} />
      ))}
    </>
  );
}

// 把 react-markdown 的 children 攤平成純文字（與 FullBlogPost 的 nodeText 同邏輯）→ 供 slugify。
const textOf = (node: ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children);
  return '';
};

// heading 元件：給 h1~h4 加上 id=slugify(text)——與 FullBlogPost 的 heading id 用同一支 slugify，
// 故 fallback 的錨點與完整版逐字一致（TOC 連結 hydration 前就能原生跳轉、SEO 也拿到 anchor）。
const mdComponents: Components = {
  h1: ({ children }) => <h1 id={slugify(textOf(children))}>{children}</h1>,
  h2: ({ children }) => <h2 id={slugify(textOf(children))}>{children}</h2>,
  h3: ({ children }) => <h3 id={slugify(textOf(children))}>{children}</h3>,
  h4: ({ children }) => <h4 id={slugify(textOf(children))}>{children}</h4>,
};

// 文章頁「已上樣式」的 SSR / Suspense fallback：title + meta + markdown 內文 baked 進靜態 HTML
// （SEO：爬蟲拿到完整內容），且套用與 FullBlogPost 相同的容器/排版 class → 視覺與完整版一致。
// 互動增強（shiki 程式碼反白、mermaid、複製鈕、閱讀進度）由 <ClientOnly> 的 FullBlogPost 於
// hydration 後補上；TOC 由 loader 算好的 toc 直接渲染（第一幀即真目錄，不需 skeleton）。
export function BlogPostPage({ post, toc = [] }: { post: PostData; toc?: TocHeading[] }) {
  const date = post.created_at ? post.created_at.slice(0, 10) : '';
  // 閱讀時間與 FullBlogPost 共用同一算法 → swap 時「☕ 約 N 分鐘」不跳號。
  const readTime = computeReadTime(post.content);
  const hasToc = toc.length > 0;
  return (
    <div className="blog-post-container">
      <div className="blog-post-dim-overlay" />

      {/* ── Header（鏡像 FullBlogPost 的 .post-header）── */}
      <header className="post-header">
        <h1 className="post-title" data-testid="post-title">{post.title}</h1>
        <div className="post-meta-row">
          {post.layout_type !== 'column' && date && (
            <>
              <span className="meta-tip">⏱ {date}</span>
              <span className="meta-sep">·</span>
            </>
          )}
          {post.author && (
            <>
              <span className="meta-tip meta-author">✦ {post.author}</span>
              <span className="meta-sep">·</span>
            </>
          )}
          <span className="meta-tip">📖 {post.view_count}</span>
          <span className="meta-sep">·</span>
          <span className="meta-tip">❤️ {post.likes}</span>
          <span className="meta-sep">·</span>
          <span className="meta-tip">☕ 約 {readTime} 分鐘</span>
          {post.category && (
            <>
              <span className="meta-sep">·</span>
              <span className="meta-tip">{post.category}</span>
            </>
          )}
          {/* E2E/SEO 用的 locale 標記（隱藏，維持既有 data-testid） */}
          <span data-testid="post-locale" hidden>{post.locale}</span>
        </div>
        {post.tags.length > 0 && (
          <div className="post-tags">
            {post.tags.map((name) => (
              <span key={name} className="tag">#{name}</span>
            ))}
          </div>
        )}
      </header>

      {/* ── Body：三欄佈局。左側欄先出 skeleton（FullBlogPost 載入後替換成文章導覽）；主欄照出
             SSR 內容（SEO）；右側欄由 loader 算好的 toc 直接渲染真目錄。側欄寬固定 → 換上不 reflow。 */}
      <div className="post-body">
        <aside className="post-sidebar-left" aria-hidden="true">
          <nav className="posts-nav">
            <div className="posts-nav-nearby">
              <SkelBars widths={[88, 72, 94, 63, 80]} />
            </div>
          </nav>
        </aside>
        <div className="post-main-column">
          <div className="post-content-wrapper">
            {post.excerpt && (
              <div className="post-ai-summary-inline">
                <div className="ai-summary-top-row">
                  <h4>🔑 關鍵洞察</h4>
                  <span className="ai-badge">✦ AI·GEN</span>
                </div>
                <p>{post.excerpt}</p>
                <div className="ai-summary-fade" />
              </div>
            )}
            {/* 與 FullBlogPost 同 class + 同 heading id；plugins 對齊（gfm/alert/raw），差別只在無 shiki/mermaid 自訂 */}
            <article className="post-content drop-cap-first">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkAlert]} rehypePlugins={[rehypeRaw]} components={mdComponents}>
                {post.content}
              </ReactMarkdown>
            </article>
          </div>
        </div>
        <aside className="post-sidebar-right" aria-hidden={hasToc ? undefined : 'true'}>
          <div className="table-of-contents">
            <div className="toc-header">
              <h3>目錄</h3>
            </div>
            <nav className="toc-nav" style={{ marginTop: '0.75rem' }}>
              {hasToc ? (
                // 原生 <a href="#id">：hydration 前點了走瀏覽器原生跳轉（heading 已帶同款 id）；
                // FullBlogPost 接管後換成 smooth-scroll + scroll-spy。class 對齊完整版 → 視覺一致。
                toc.map((h) => (
                  <a key={h.id} href={`#${h.id}`} className={`toc-item level-${h.level}`} title={h.text}>
                    <span className="toc-bullet" />
                    <span className="toc-text">{h.text}</span>
                  </a>
                ))
              ) : (
                <SkelBars widths={[82, 66, 90, 54, 76, 60, 84]} height={11} />
              )}
            </nav>
          </div>
        </aside>
      </div>
    </div>
  );
}
