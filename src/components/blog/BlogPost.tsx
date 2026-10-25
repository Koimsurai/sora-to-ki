import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouterState, useNavigate, ClientOnly } from '@tanstack/react-router';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { LocaleLink } from '@/i18n/locale-link';
import { useLocale } from '@/hooks/useLocale';
import {
  postDetailQueryOptions,
  recentPostsQueryOptions,
  postsByTagQueryOptions,
  postReactionsQueryOptions,
  seriesQueryOptions,
} from '@/data/blogList';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import type { ExcerptLink, PostDetailResponse, PostListItem, ReactionRow } from '@koimsurai/api-types';
import remarkGfm from 'remark-gfm';
import { remarkAlert } from 'remark-github-blockquote-alert';
import KoimLoader from '@/components/common/KoimLoader';
import rehypeRaw from 'rehype-raw';
import { highlightCode } from '@/lib/mdx/shikiHighlight';
import { langEmoji } from '@/lib/langEmoji';
import { CodeBody } from '@/components/mdx/CodeSurface';
// 圖表整套（渲染、工具列、主題／版面切換、全螢幕、mermaid+ELK 的延遲載入）在 MermaidBlock.tsx。
// 這裡只是把它掛進 ReactMarkdown 的元件表——mermaid 那顆 lib 由 MermaidBlock 自己動態載入，
// 沒有圖的文章連 import 都不會觸發。
import { MermaidBlock, MermaidStatic } from './MermaidBlock';
import { MermaidSvgContext } from '@/contexts/mermaidSvgs';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation, Trans } from 'react-i18next';
import ArticleComments from './ArticleComments';
import { FontLine, LangLine } from './ArticleControls';
import ReactionSky from './ReactionSky';
import { BlogImage } from '@/components/blog/BlogImage';
// BlogPost.css：Tier-2 後本元件直接 SSR（不再靠 BlogPostPage fallback）→ CSS 由這裡匯入。
// 本元件是路由 eager import（進 /blog/$id 路由 chunk），故 CSS 進「文章路由 chunk」而非全域
// index.css（首頁等非文章頁不會白背這 2600+ 行）。
import '@/components/common/article-shell.css';
import './BlogPost.css';
import './ArticleFrame.css';
import SignatureSVG from '@/components/common/SignatureSVG';
import { LinkCard } from '@/components/common/LinkCard';
import { LinkHoverPreview } from '@/components/common/LinkHoverPreview';
import { Modal, ModalTitle } from '@/components/common/Modal';
import { MdxContent } from '@/components/mdx/MdxContent';
// slugify / extractHeadings / computeReadTime：與 BlogPostPage（SSR fallback）共用同一份，
// 確保 heading anchor id / TOC / 閱讀時間兩邊逐字一致。
import { slugify, extractHeadings, computeReadTime } from '@/lib/mdx/blogContent';
// 標題拆解、閱讀進度、scroll-spy 的挑選邏輯——純函式，抽出去才測得到（見該檔說明）。
import { splitTitle } from '@/lib/blogReading';
import { dotDate, parseServerDate } from '@/lib/serverDate';
import ArticleSummary from './ArticleSummary';
import OrbitToc from './OrbitToc';
import { peekRetune, setRetune, useRetune } from './useRetune';
import { useCategoryLabel, useTagLabel } from '@/lib/categoryLabel';
import { postPath, postShareUrl } from '@/lib/postPath';
import { lookup } from '@/lib/tableLookup';

/// `GET /api/posts/:id` 的成功回應（型別由後端 Rust struct 生成），外加 client 端自己算的
/// `date`（由 created_at 依語系格式化，見下方 setPost）。API 不回傳 date。
/// 該端點的 404 走另一組 JSON（只有 message / locale / available_locales），
/// 呼叫端用 `data.message === 'success'` 擋掉，所以這裡只描述成功形狀。
type Post = PostDetailResponse & { date?: string };

interface Heading {
  id: string;
  text: string;
  level: number;
}

/**
 * 「sidebar 文章連結」附帶 hover preview 行為
 * 因為要在 map iteration 內呼叫 hook，必須抽成子元件
 */
const PreviewablePostLink = React.memo(
  ({
    post,
    className,
    children,
    viewTransition,
    style,
    current,
  }: {
    post: { id: number | string; slug?: string | null; title: string };
    className?: string;
    children?: React.ReactNode;
    viewTransition?: boolean;
    style?: React.CSSProperties;
    current?: boolean;
  }) => {
    // hover 預覽卡已移除（連同 article-preview 那整套）——側欄只是純連結。
    // current 也走同一個 <a>（只換 class）：若「目前這篇」改渲 <span>，換文章時該列的元素類型
    // 由 a→span，React 必定卸載重掛 → 新 DOM 節點 → 進場動畫重播 = 使用者看到「被點的那列
    // 整組消失再跑一次」。維持同型別才能讓 React 重用節點、只有真正新露出的列才播動畫。
    return (
      <LocaleLink
        to={postPath(post)}
        className={className}
        title={post.title}
        viewTransition={viewTransition}
        style={style}
        aria-current={current ? 'page' : undefined}
      >
        {children}
      </LocaleLink>
    );
  },
);
PreviewablePostLink.displayName = 'PreviewablePostLink';

/* ── helpers ── */

/* 標題「主標：副標」拆分（display 用）：第一個全形「：」或半形「: 」切開，前面主標、後面副標。
   兩側都要有內容才拆，否則整串當主標。SEO 的 document title / og:title 仍用完整 post.title
   （搜尋結果要完整描述性標題），這裡只影響頁面上 h1 的呈現。 */

/* 安全地把 React children 攤平成純文字（避免 String(obj) → [object Object]） */
const nodeText = (node: React.ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (React.isValidElement(node)) {
    const p = node.props as { children?: React.ReactNode };
    return nodeText(p.children);
  }
  return '';
};

/* ── 閱讀字體 ── */
/* 選項的 id 在 blog/ArticleControls 的 FONT_OPTIONS、顯示名在語系檔的 blog.fontNames（各語系配的字不同）；
   字體棧在 index.css（--blog-font-<id> 指向 --serif／--sans／--kai／--modern，各語系各一支，全是按頁裁字）——
   偏好必須在 paint 之前套用（見 __root.tsx 的 pre-paint script），而那段只能碰 CSS。
   新增字體：FONT_OPTIONS 加 id、語系檔加名字、index.css 加 --blog-font-<id> 與 html[data-blog-font=...]；
   要是新的一種字，還要在 lib/serifSubset 的 FontStyle 與伺服器的 FONTS 表、scripts/fetch-serif-font.mjs 各加一份 */
const DEFAULT_BLOG_FONT = 'noto-serif';
/** 舊版後端沒有 excerpt_links 欄位時給的空陣列（固定一份，摘要才不會每次重切） */
const NO_LINKS: readonly ExcerptLink[] = [];

/* ══════════════════════════
   CodeBlock
   ══════════════════════════ */
// 這些語言的 fenced code 改渲染成「終端機視窗」而非一般 code block。
const TERMINAL_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'console', 'terminal', 'shellsession', 'shellscript']);

// 非原文語系的文章：頂部掛「AI 翻譯、未經人工審校」提示（站長無法人工審日/韓等語法）。
// 文字用目標語言寫（提示會出現在該語系頁），連回原文（source_language，走不帶 prefix 的規範路徑）。
const AI_TRANSLATION_NOTICE: Record<string, { label: string; text: string; original: string }> = {
  en: {
    label: 'AI TRANSLATION',
    text: 'AI-translated from the original (Traditional Chinese) — not human-reviewed, so wording may be imperfect.',
    original: 'View original',
  },
  ja: {
    label: 'AI 翻訳',
    text: 'この記事は原文（繁体字中国語）からのAI翻訳です。人手による校正はしていないため、表現に不自然さが残る場合があります。',
    original: '原文を見る',
  },
  ko: {
    label: 'AI 번역',
    text: '이 글은 원문(번체 중국어)의 AI 번역본이며, 사람이 검수하지 않아 표현이 어색할 수 있습니다.',
    original: '원문 보기',
  },
  'zh-CN': {
    label: 'AI 翻译',
    text: '本文由原文（繁体中文）AI 翻译，未经人工审校，措辞可能不够自然。',
    original: '查看原文',
  },
};

// 後台編輯器預覽（PostPreview）也重用這批 → export，讓預覽跟前台同一套渲染（shiki/mermaid/terminal）。
export const CodeBlock = ({
  node: _node,
  inline,
  className,
  children,
  ...props
}: {
  node?: unknown;
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) => {
  const { t } = useTranslation();
  const [isCopied, setIsCopied] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match ? match[1] : 'text';
  const codeText = nodeText(children).replace(/\n$/, '');

  // 自動偵測 mermaid 圖表：有 language tag 或內容以 mermaid 關鍵字開頭
  const isMermaid =
    lang === 'mermaid' ||
    (!inline &&
      (lang === 'text' || !match) &&
      /^(---|graph\s|flowchart\s|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|sankey)/m.test(
        codeText.trim(),
      ));

  // Shiki lazy 反白 — 渲染後 idle 才開始，載入前先顯示 plain pre
  useEffect(() => {
    if (inline || isMermaid || !match) return;
    let cancelled = false;
    // lib.dom 宣告 requestIdleCallback 必存在，舊版 Safari 實際沒有 → 可選型別讓守衛誠實。
    // Window 是 [Global] 介面，解構後直接呼叫不會 Illegal invocation（同 AppShell 手法）。
    const ric = (window as Partial<Window>).requestIdleCallback;
    // 排程 handle 要接住：只靠 cancelled 旗標的話，unmount 後 callback 仍會跑完
    // 整個 highlightCode（shiki 反白不便宜），只是把結果丟掉。取消掉才是真的省。
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (ric) {
      idleId = ric(
        () => {
          void run();
        },
        { timeout: 1500 },
      );
    } else {
      timeoutId = setTimeout(() => {
        void run();
      }, 80);
    }
    function run() {
      return highlightCode(codeText, lang)
        .then((html) => {
          if (!cancelled) setHighlighted(html);
        })
        .catch(() => {
          /* fallback 留 plain pre */
        });
    }
    return () => {
      cancelled = true;
      if (idleId !== undefined) (window as Partial<Window>).cancelIdleCallback?.(idleId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [codeText, lang, inline, isMermaid, match]);

  if (!inline && isMermaid) {
    // mermaid 用 react-zoom-pan-pinch（render 期碰 window，非 SSR-safe）→ 只把這個島包 ClientOnly。
    // fallback 是固定高 .mm-sandbox 空殼（CSS height:420px）→ SSR 佔位穩定、client 接手渲染圖時不 reflow。
    return (
      <ClientOnly fallback={<MermaidStatic code={codeText} />}>
        <MermaidBlock code={codeText} />
      </ClientOnly>
    );
  }

  const handleCopy = () => {
    void navigator.clipboard.writeText(codeText).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  if (!inline && match) {
    // 終端機類語言 → 渲染成終端機視窗（紅黃綠燈 + 無行號），跟一般 code block 明確區隔。唯讀。
    if (TERMINAL_LANGS.has(lang)) {
      return (
        <div className="terminal-block">
          <div className="terminal-bar">
            <span className="terminal-glyph" aria-hidden>
              ❯_
            </span>
            <span className="terminal-title">{lang}</span>
            <button onClick={handleCopy} className="copy-button">
              {isCopied ? t('blog.codeCopied') : t('blog.codeCopy')}
            </button>
          </div>
          <div className="terminal-body">
            {highlighted ? (
              // shiki 高亮的可信 HTML（作者內容 + shiki）
              // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
              <div className="shiki-output" dangerouslySetInnerHTML={{ __html: highlighted }} />
            ) : (
              <pre className="shiki-fallback">
                <code>{codeText}</code>
              </pre>
            )}
            <div className="terminal-cursor-line" aria-hidden>
              <span className="terminal-prompt-sym">❯</span>
              <span className="terminal-cursor" />
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="code-block-wrapper">
        <div className="code-block-header">
          <span className="language-name">
            <span className="language-emoji" aria-hidden>
              {langEmoji(lang)}
            </span>
            {lang}
          </span>
          <button onClick={handleCopy} className="copy-button">
            {isCopied ? t('blog.codeCopied') : t('blog.codeCopy')}
          </button>
        </div>
        <CodeBody highlighted={highlighted} code={codeText} />
      </div>
    );
  }
  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
};

/* ══════════════════════════
   Custom paragraph — detect standalone link lines for LinkCard
   ══════════════════════════ */
export const CustomParagraph = ({
  children,
  node: _node,
  ...props
}: { children?: React.ReactNode; node?: unknown } & React.HTMLAttributes<HTMLParagraphElement>) => {
  // Children.toArray 一般不建議（會遮蔽 key、鼓勵去操作 children），但這裡是
  // markdown 渲染器：要判斷「這個段落是不是只有一個裸連結」才能決定換成 LinkCard，
  // 除了檢查 children 結構沒有別的辦法——react-markdown 就是這樣把節點交給我們的。
  // eslint-disable-next-line @eslint-react/no-children-to-array
  const childArray = React.Children.toArray(children);

  const extractFirstUrlFromText = (text: string | null | undefined) => {
    if (!text) return null;
    // Capture URL while trimming common trailing wrappers like ")" or "]".
    const match = /https?:\/\/[^\s<>)\]]+/i.exec(text);
    return match ? match[0] : null;
  };

  // 遞迴取得所有子文字內容
  const getText = (node: React.ReactNode): string => {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(getText).join('');
    if (React.isValidElement(node)) {
      const p = node.props as { children?: React.ReactNode };
      if (p.children) return getText(p.children);
    }
    return '';
  };

  // 從 children 中找出所有 <a> 元素
  const findLinks = (arr: React.ReactNode[]): React.ReactElement[] => {
    const links: React.ReactElement[] = [];
    arr.forEach((child) => {
      if (React.isValidElement(child) && (child.props as { href?: string }).href) links.push(child);
    });
    return links;
  };

  // 可嵌入的連結類型
  const isEmbeddableLink = (href: string) => {
    try {
      const u = new URL(href);
      const host = u.hostname.replace('www.', '');
      return (
        host.includes('youtube.com') ||
        host.includes('youtu.be') ||
        host.includes('bilibili.com') ||
        host.includes('b23.tv') ||
        host.includes('spotify.com') ||
        host.includes('koimsurai.com')
      );
    } catch {
      return false;
    }
  };

  // 單一子元素 — 可能是純文字 URL 或 <a> 連結
  if (childArray.length === 1) {
    const child = childArray[0];

    // 純文字 URL
    if (typeof child === 'string') {
      const trimmed = child.trim();
      if (/^https?:\/\/\S+$/.test(trimmed)) {
        return <LinkCard href={trimmed} />;
      }

      const textUrl = extractFirstUrlFromText(trimmed);
      if (textUrl && isEmbeddableLink(textUrl)) {
        return (
          <div className="link-card-with-text">
            <p {...props}>{child}</p>
            <LinkCard href={textUrl} />
          </div>
        );
      }
    }

    // ReactMarkdown <a> 元素（remarkGfm autolink 或 markdown 連結）
    if (React.isValidElement(child) && (child.props as { href?: string }).href) {
      const cprops = child.props as { href: string; children?: React.ReactNode };
      const href = cprops.href;
      const text = getText(cprops.children).trim();
      // Allow cards for embeddable links even when markdown link text is custom.
      if (isEmbeddableLink(href) || text === href || text === '' || href.includes(text) || text.includes(href)) {
        return <LinkCard href={href} />;
      }
    }
  }

  // 多子元素 — 檢查是否包含可嵌入的連結（如「【標題】 url」格式）
  if (childArray.length >= 2) {
    const links = findLinks(childArray);
    const embeddableLink = links.find((link) => isEmbeddableLink((link.props as { href?: string }).href ?? ''));

    if (embeddableLink) {
      const href = (embeddableLink.props as { href: string }).href;
      // 取得非連結部分的文字
      const textParts = childArray.filter((c) => c !== embeddableLink);
      const hasText = textParts.some((c) => {
        const t = typeof c === 'string' ? c.trim() : getText(c).trim();
        return t.length > 0;
      });

      if (hasText) {
        // 有文字描述 — 顯示文字 + 嵌入卡片
        return (
          <div className="link-card-with-text">
            <p {...props}>{textParts}</p>
            <LinkCard href={href} />
          </div>
        );
      } else {
        return <LinkCard href={href} />;
      }
    }
  }

  return <p {...props}>{children}</p>;
};

/* ══════════════════════════
   回應（文末的星座，blog/ReactionSky）的資料
   ══════════════════════════ */

/**
 * 回應的狀態（各 emoji 的數量 + 自己按過哪些 + toggle），存在 `post_reactions`。
 * 文章頁持有一份、傳給文末的星座（blog/ReactionSky）；同一個狀態只能有一個持有者，
 * 各自呼叫的話 `mine`（各自的 useState）會分岔。
 *
 * 不 export：手記列表刻意不用它，否則一頁十幾篇會各發一個 /reactions 請求；
 * 那邊的數字走 `PostListItem.heart_count`。而 export 非元件的東西會破壞這個
 * 檔案的 fast refresh（oxlint react/only-export-components）。
 */
function useReactions(postId: string | number) {
  const queryClient = useQueryClient();
  const reactionsKey = postReactionsQueryOptions(postId).queryKey;
  // 反應數改由 Query 讀；counts 由列表 derive。toggle 走 setQueryData optimistic +
  // 伺服器回真值再校正（對齊舊的 optimistic → 校正流程）。mine 仍是 localStorage 本地態。
  const { data: reactions = [] } = useQuery(postReactionsQueryOptions(postId));
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    reactions.forEach((r) => {
      map[r.emoji] = r.count;
    });
    return map;
  }, [reactions]);
  // SSR-safe：初始空 Set（server 無 localStorage），掛載後才讀本地已按過的 reactions → 不 mismatch。
  const [mine, setMine] = useState<Set<string>>(() => new Set<string>());
  useEffect(() => {
    // localStorage 在 server 上不存在 → 只能在 effect 讀（同 Comments 的說明）
    try {
      // eslint-disable-next-line @eslint-react/set-state-in-effect
      setMine(new Set<string>(JSON.parse(localStorage.getItem(`reactions:${postId}`) ?? '[]') as string[]));
    } catch {
      /* localStorage 不可用就維持空 */
    }
  }, [postId]);

  const patchCount = useCallback(
    (emoji: string, resolve: (prev: number) => number) => {
      queryClient.setQueryData<ReactionRow[]>(reactionsKey, (old) => {
        const list = old ?? [];
        const idx = list.findIndex((r) => r.emoji === emoji);
        if (idx >= 0) {
          const next = list.slice();
          next[idx] = { ...next[idx], count: Math.max(0, resolve(next[idx].count)) };
          return next;
        }
        return [...list, { emoji, count: Math.max(0, resolve(0)) }];
      });
    },
    [queryClient, reactionsKey],
  );

  const toggle = useCallback(
    (emoji: string) => {
      const has = mine.has(emoji);
      const delta = has ? -1 : 1;
      // optimistic
      patchCount(emoji, (c) => c + delta);
      setMine((prev) => {
        const next = new Set(prev);
        if (has) next.delete(emoji);
        else next.add(emoji);
        try {
          localStorage.setItem(`reactions:${postId}`, JSON.stringify([...next]));
        } catch {
          /* localStorage 不可用就略過 */
        }
        return next;
      });
      fetch(`/api/posts/${postId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji, delta }),
      })
        .then((r) => r.json() as Promise<{ count?: number }>)
        .then((data) => {
          const count = data.count;
          if (typeof count === 'number') patchCount(emoji, () => count);
        })
        .catch(() => {
          /* 失敗就保持 optimistic 結果 */
        });
    },
    [mine, postId, patchCount],
  );

  return { counts, mine, toggle };
}

/* ══════════════════════════
   SeriesNav — 系列文導覽（若文章屬於某系列）
   ══════════════════════════ */
const SeriesNav = React.memo(({ seriesName, currentId }: { seriesName: string; currentId: string | number }) => {
  const { t } = useTranslation();
  const { data: posts = [] } = useQuery({ ...seriesQueryOptions(seriesName), enabled: !!seriesName });
  if (!seriesName || posts.length === 0) return null;
  const currentIdx = posts.findIndex((p) => String(p.id) === String(currentId));
  return (
    <aside className="series-nav" aria-label={`系列文：${seriesName}`}>
      <header className="series-nav-header">
        <span className="series-nav-label">{t('blog.seriesLabel')}</span>
        {/* 同上：這塊 aside 排在文章 h1 之後，用 h4 會跳級 */}
        <h2 className="series-nav-name">{seriesName}</h2>
        <span className="series-nav-progress">
          共 {posts.length} 篇 · 你正在讀第 {currentIdx >= 0 ? currentIdx + 1 : '?'} 篇
        </span>
      </header>
      <ol className="series-nav-list">
        {posts.map((p, i) => {
          const isCurrent = String(p.id) === String(currentId);
          return (
            <li key={p.id} className={`series-nav-item${isCurrent ? ' is-current' : ''}`}>
              <span className="series-nav-num">{p.series_order ?? i + 1}</span>
              {isCurrent ? (
                <span className="series-nav-title">{p.title}</span>
              ) : (
                <PreviewablePostLink post={p} className="series-nav-title" viewTransition>
                  {p.title}
                </PreviewablePostLink>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
});
SeriesNav.displayName = 'SeriesNav';

/* ══════════════════════════
   PrevNextNav — 文章底部上/下一篇導覽
   ══════════════════════════ */
const PrevNextNav = React.memo(({ currentId }: { currentId: string | number }) => {
  const { t } = useTranslation();
  const navLocale = useLocale();
  const { data: allPosts = [] } = useQuery(recentPostsQueryOptions(200, navLocale));
  const { prev, next } = useMemo<{ prev: PostListItem | null; next: PostListItem | null }>(() => {
    const published = allPosts.filter((p) => p.status === 'published' || !p.status);
    const sorted = [...published].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const idx = sorted.findIndex((p) => String(p.id) === String(currentId));
    if (idx === -1) return { prev: null, next: null };
    return {
      prev: idx > 0 ? sorted[idx - 1] : null,
      next: idx < sorted.length - 1 ? sorted[idx + 1] : null,
    };
  }, [allPosts, currentId]);

  if (!prev && !next) return null;

  return (
    <nav className="prev-next-nav" aria-label="上一篇與下一篇">
      {prev ? (
        <LocaleLink to={postPath(prev)} className="prev-next-card prev-next-prev" viewTransition>
          <span className="prev-next-label">← {t('blog.prevPost')}</span>
          <span className="prev-next-title">{prev.title}</span>
        </LocaleLink>
      ) : (
        <span className="prev-next-placeholder" />
      )}
      {next ? (
        <LocaleLink to={postPath(next)} className="prev-next-card prev-next-next" viewTransition>
          <span className="prev-next-label">{t('blog.nextPost')} →</span>
          <span className="prev-next-title">{next.title}</span>
        </LocaleLink>
      ) : (
        <span className="prev-next-placeholder" />
      )}
    </nav>
  );
});

/** 附近的文章與同分類的文章：從最近 200 篇（上下篇導覽那份快取）依時間排序後開視窗 */
function useNearbyPosts(currentId: string | number, postCategory?: string) {
  const navLocale = useLocale();
  const { data: allPosts = [] } = useQuery(recentPostsQueryOptions(200, navLocale));
  return useMemo(() => {
    const sorted = [...allPosts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const currentIndex = sorted.findIndex((p) => String(p.id) === String(currentId));
    if (currentIndex === -1) return { nearby: [] as PostListItem[], sameCategory: [] as PostListItem[], maxLen: 1 };
    // 顯示範圍：最新→往前6、第2新→7、其後→以當前為中心前後各4（不滿則另一側補）
    let start;
    let end;
    if (currentIndex === 0) {
      start = 0;
      end = Math.min(sorted.length, 6);
    } else if (currentIndex === 1) {
      start = 0;
      end = Math.min(sorted.length, 7);
    } else {
      const half = 4;
      start = Math.max(0, currentIndex - half);
      end = Math.min(sorted.length, currentIndex + half + 1);
      if (currentIndex - start < half) end = Math.min(sorted.length, end + (half - (currentIndex - start)));
      if (end - currentIndex - 1 < half) start = Math.max(0, start - (half - (end - currentIndex - 1)));
    }
    return {
      nearby: sorted.slice(start, end),
      sameCategory: postCategory
        ? sorted.filter((p) => p.category === postCategory && String(p.id) !== String(currentId)).slice(0, 5)
        : [],
      // 舊版後端的列表沒有字數：當成 0，左欄那排線就一樣長（不然長度會算成 NaN、整排線看不見）
      maxLen: Math.max(1, ...sorted.map((p) => Number(p.content_length) || 0)),
    };
  }, [allPosts, currentId, postCategory]);
}

/* ══════════════════════════
   PostsNav — 左欄：附近的文章。平常收成一排細線（每篇一條，長短照文章長度），滑過才展開成標題；
   換文章時清單照原本的方式滑動（新露出的列才進場）
   ══════════════════════════ */
const PostsNav = React.memo(({ currentId, postCategory }: { currentId: string | number; postCategory?: string }) => {
  const { t } = useTranslation();
  const categoryLabel = useCategoryLabel();
  const { nearby, maxLen } = useNearbyPosts(currentId, postCategory);
  if (!nearby.length) return null;
  return (
    <nav className="ar-side" aria-label={t('blog.nearbyNav')}>
      <ol>
        <AnimatePresence initial={false}>
          {nearby.map((p) => {
            const isCurrent = String(p.id) === String(currentId);
            const len = 10 + 26 * Math.sqrt(Math.min(1, (Number(p.content_length) || maxLen * 0.3) / maxLen));
            return (
              <motion.li
                key={p.id}
                layout
                initial={false}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
                className={isCurrent ? 'is-on' : undefined}
              >
                <PreviewablePostLink
                  post={p}
                  current={isCurrent}
                  className="ar-side-a"
                  style={{ '--len': `${len.toFixed(1)}px` } as React.CSSProperties}
                >
                  <i aria-hidden="true" />
                  <span>{splitTitle(p.title).main}</span>
                </PreviewablePostLink>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
      {postCategory && (
        <p className="ar-side-cat">
          <span>{t('blog.inColumn')}</span>
          {categoryLabel(postCategory)}
        </p>
      )}
    </nav>
  );
});
PostsNav.displayName = 'PostsNav';

/** 文末：同一個分類的其他文章 */
const SameCategory = ({ currentId, postCategory }: { currentId: string | number; postCategory?: string }) => {
  const { t } = useTranslation();
  const categoryLabel = useCategoryLabel();
  const { sameCategory } = useNearbyPosts(currentId, postCategory);
  if (!postCategory || !sameCategory.length) return null;
  return (
    <section className="ar-same">
      <p className="ar-label">{t('blog.sameCategory', { name: categoryLabel(postCategory) })}</p>
      <ul>
        {sameCategory.map((p) => (
          <li key={p.id}>
            <time dateTime={p.created_at} suppressHydrationWarning>
              {dotDate(parseServerDate(p.created_at), true)}
            </time>
            <PreviewablePostLink post={p}>{splitTitle(p.title).main}</PreviewablePostLink>
          </li>
        ))}
      </ul>
    </section>
  );
};

/**
 * 頁首的標籤：點一個標籤，底下就地展開「同標這個標籤的其他文章」（最多五篇），再點一次收起來。
 * 不換頁、不去手記頁篩選（手記頁刻意不做標籤篩選，那會破壞星軌的版面）
 */
const TagShelf = ({
  tags,
  currentId,
  label,
}: {
  tags: string[];
  currentId: number;
  label: (name: string) => string;
}) => {
  const { t } = useTranslation();
  const locale = useLocale();
  const [open, setOpen] = useState<string | null>(null);
  const { data: posts = [], isFetching } = useQuery({
    ...postsByTagQueryOptions(open ?? '', locale),
    enabled: open !== null,
  });
  const others = posts.filter((p) => String(p.id) !== String(currentId)).slice(0, 5);
  return (
    <>
      <div className="ar-tags">
        {tags.map((name) => (
          <button
            key={name}
            type="button"
            aria-expanded={open === name}
            onClick={() => setOpen(open === name ? null : name)}
          >
            #{label(name)}
          </button>
        ))}
      </div>
      {open !== null && (
        <section className="ar-same ar-tag-shelf" key={open}>
          <p className="ar-label">{t('blog.sameTag', { name: label(open) })}</p>
          {others.length ? (
            <ul>
              {others.map((p) => (
                <li key={p.id}>
                  <time dateTime={p.created_at} suppressHydrationWarning>
                    {dotDate(parseServerDate(p.created_at), true)}
                  </time>
                  <PreviewablePostLink post={p}>{splitTitle(p.title).main}</PreviewablePostLink>
                </li>
              ))}
            </ul>
          ) : (
            !isFetching && <p className="ar-tag-none">{t('blog.sameTagNone')}</p>
          )}
        </section>
      )}
    </>
  );
};

/* ══════════════════════════
   SubscribeModal
   訂閱狀態存在 localStorage 的 KOIM_NEWSLETTER key 裡，
   {email, name, ts} 結構。重複打開 modal 會自動偵測，
   顯示「已訂閱」狀態而不是再來一次表單。
   ══════════════════════════ */
const NEWSLETTER_LS_KEY = 'koim_newsletter_subscriber';

function readSubscriberLS() {
  try {
    const raw = localStorage.getItem(NEWSLETTER_LS_KEY);
    return raw ? (JSON.parse(raw) as { email?: string; name?: string }) : null;
  } catch {
    return null;
  }
}
function writeSubscriberLS(value: unknown) {
  try {
    localStorage.setItem(NEWSLETTER_LS_KEY, JSON.stringify(value));
  } catch {
    /* localStorage blocked */
  }
}
function clearSubscriberLS() {
  try {
    localStorage.removeItem(NEWSLETTER_LS_KEY);
  } catch {
    /* localStorage blocked */
  }
}

const SubscribeModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [message, setMessage] = useState('');
  const [subscribed, setSubscribed] = useState<{ email?: string; name?: string } | null>(() => readSubscriberLS());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });
      const data = (await res.json()) as { error?: string };
      if (res.ok) {
        setStatus('success');
        setMessage(t('newsletter.successWithEmoji'));
        const record = { email, name, ts: Date.now() };
        writeSubscriberLS(record);
        setSubscribed(record);
        setEmail('');
        setName('');
        setTimeout(() => onClose(), 1800);
      } else {
        setStatus('error');
        setMessage(data.error ?? t('newsletter.errorGeneric'));
      }
    } catch {
      setStatus('error');
      setMessage(t('newsletter.errorNetwork'));
    }
  };

  const handleUnsubscribe = async () => {
    if (!subscribed?.email) return;
    if (!window.confirm(t('newsletter.unsubConfirmJs', { email: subscribed.email }))) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/newsletter/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: subscribed.email }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? t('newsletter.unsubFailed'));
      }
      clearSubscriberLS();
      setSubscribed(null);
      setStatus('success');
      setMessage(t('newsletter.unsubDone'));
    } catch (e) {
      setStatus('error');
      setMessage(e instanceof Error ? e.message : t('newsletter.unsubFailed'));
    }
  };

  // 跟朋友頁的申請表同一套：直角細框、宋體標題、等寬小字的欄位名、底線輸入框、細框的送出鈕
  return (
    <Modal onClose={onClose} overlayClassName="subscribe-overlay" fade>
      <motion.div
        className="subscribe-modal"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        <button type="button" className="subscribe-close" onClick={onClose} aria-label={t('common.close')} />

        {subscribed ? (
          /* ── 已訂閱 ── */
          <>
            <ModalTitle className="subscribe-title">{t('newsletter.confirmedTitle')}</ModalTitle>
            <p className="subscribe-lead">
              <Trans
                i18nKey="newsletter.alreadyBody"
                values={{ email: subscribed.email }}
                components={{ em: <span className="subscribe-email" /> }}
              />{' '}
              {t('newsletter.nextNotice')}
            </p>
            <div className="subscribe-actions">
              <button type="button" className="subscribe-submit" onClick={onClose}>
                {t('newsletter.okBtn')}
              </button>
              <button
                type="button"
                className="subscribe-quiet"
                onClick={() => {
                  void handleUnsubscribe();
                }}
                disabled={status === 'loading'}
              >
                {status === 'loading' ? t('newsletter.unsubProcessing') : t('newsletter.unsubBtn')}
              </button>
            </div>
            {message && <output className={'subscribe-msg ' + status}>{message}</output>}
          </>
        ) : (
          /* ── 訂閱表單 ── */
          <>
            <ModalTitle className="subscribe-title">{t('newsletter.title')}</ModalTitle>
            <p className="subscribe-lead">{t('newsletter.subscribeIntro')}</p>
            <form
              onSubmit={(e) => {
                void handleSubmit(e);
              }}
              className="subscribe-form"
              toolname="subscribe_newsletter"
              tooldescription="訂閱 koimsurai 電子報，有新文章時以 email 通知"
            >
              <label className="subscribe-field">
                <span>{t('newsletter.fieldName')}</span>
                <input
                  type="text"
                  name="name"
                  autoComplete="name"
                  toolparamdescription="訂閱者暱稱（選填）"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={status === 'loading'}
                />
              </label>
              <label className="subscribe-field">
                <span>{t('newsletter.fieldEmail')}</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  toolparamdescription="訂閱用的 email 地址"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={status === 'loading'}
                />
              </label>
              <button type="submit" className="subscribe-submit" disabled={status === 'loading'}>
                {status === 'loading' ? t('newsletter.processing') : t('newsletter.subscribe')}
              </button>
            </form>
            {message && <output className={'subscribe-msg ' + status}>{message}</output>}
            <p className="subscribe-privacy">{t('newsletter.privacy')}</p>
          </>
        )}
      </motion.div>
    </Modal>
  );
};

/* ═══════════════════════════════════
   Toast — 短暫提示
   ═══════════════════════════════════ */
const Toast = ({ message, onDone }: { message: React.ReactNode; onDone: () => void }) => {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <motion.div
      className="blog-toast"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
    >
      {message}
    </motion.div>
  );
};

/* URL prefix mapping — 必須與後端 LOCALE_URL_PREFIX 一致 */
const LOCALE_URL_PREFIX: Record<string, string> = { 'zh-TW': '', 'zh-CN': '/zh-cn', en: '/en', ja: '/ja', ko: '/ko' };
const LOCALE_TO_DATE_LOCALE: Record<string, string> = {
  'zh-TW': 'zh-TW',
  'zh-CN': 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP',
  ko: 'ko-KR',
};

function parseLocaleFromPath(pathname: string) {
  // 不分大小寫：站上的網址是 /zh-CN/，這裡原本只認小寫的 /zh-cn/——直接打開（或從分享的連結進來）
  // 簡中文章時抓的是繁中原文，也沒有 AI 翻譯的提示；只有在頁面上切語系時才對
  const path = pathname.toLowerCase();
  if (path.startsWith('/en/blog/')) return 'en';
  if (path.startsWith('/zh-cn/blog/')) return 'zh-CN';
  if (path.startsWith('/ja/blog/')) return 'ja';
  if (path.startsWith('/ko/blog/')) return 'ko';
  return 'zh-TW';
}

function postPathForLocale(id: string | number | undefined, locale: string, sourceLang: string) {
  // 原文永遠走不帶 prefix 的規範路徑（與後端 postUrlForLocale 一致）
  if (locale === sourceLang) return `/blog/${id}`;
  return `${LOCALE_URL_PREFIX[locale] || ''}/blog/${id}`;
}

/* ═══════════════════════════════════
   BlogPost — 文章內頁
   ═══════════════════════════════════ */
function BlogPost() {
  const { t } = useTranslation();
  const tagLabel = useTagLabel();
  const categoryLabel = useCategoryLabel();
  const navLocale = useLocale();
  const [copied, setCopied] = useState(false);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  // SSR-safe：初始用預設（server 無 localStorage），掛載後才讀本地偏好 → 首次 client render 與 SSR 一致、不 mismatch。
  // 只驅動 FontSwitcher 的「目前選中」標記；實際字體由 html[data-blog-font] + CSS 變數決定。
  const [currentFont, setCurrentFont] = useState(DEFAULT_BLOG_FONT);
  const contentRef = useRef<HTMLDivElement>(null);
  /** OrbitToc 掛上來的「讓某一章亮起來」，摘要的關鍵句滑過時呼叫 */
  const tocPingRef = useRef<((id: string | null) => void) | null>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const { id = '' } = useParams({ strict: false });
  const location = useRouterState({ select: (s) => s.location });
  const navigate = useNavigate();
  const pathLocale = useMemo(() => parseLocaleFromPath(location.pathname), [location.pathname]);

  // 主文改由 TanStack Query 讀：route loader 已 ensureQueryData 預取 → SSR baked、
  // hydrate 讀同一份快取，不再重打 API。placeholderData 保留上一篇資料做平滑過渡（不閃白）。
  // date 是 client 依語系格式化的衍生欄位（API 不回傳）。
  const {
    data: postData,
    isPending,
    isPlaceholderData,
    error: queryError,
  } = useQuery({
    ...postDetailQueryOptions(id, pathLocale),
    placeholderData: keepPreviousData,
  });
  const post = useMemo<Post | null>(() => {
    if (!postData) return null;
    const dateLocale = LOCALE_TO_DATE_LOCALE[postData.locale] ?? 'zh-TW';
    return {
      ...postData,
      // timeZone 固定 Asia/Taipei → server(UTC) 與 client 同一天、同 weekday，不 hydration mismatch。
      date: new Date(postData.created_at).toLocaleDateString(dateLocale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        timeZone: 'Asia/Taipei',
      }),
    };
  }, [postData]);
  const loading = isPending;
  const error = queryError ? (queryError instanceof Error ? queryError.message : 'Post not found') : null;

  const handleFontChange = useCallback((fontId: string) => {
    setCurrentFont(fontId);
    localStorage.setItem('blogFont', fontId);
    // 立刻套用：pre-paint script 只在整頁載入時跑，SPA 內切換字體要自己改 attribute
    document.documentElement.setAttribute('data-blog-font', fontId);
  }, []);

  // 掛載後補讀偏好——只為了讓 FontSwitcher 標對「目前選中」那一項。
  // 字體本身已經由 __root.tsx 的 pre-paint script 寫進 html[data-blog-font] 在首屏套好了，
  // 所以這裡 setState 不再造成任何版面變動（原本它會讓整篇文章重排 → CLS）。
  useEffect(() => {
    const stored = localStorage.getItem('blogFont');
    // 使用者偏好存在 localStorage，server 讀不到（同 Comments 的說明）
    // eslint-disable-next-line @eslint-react/set-state-in-effect
    if (stored) setCurrentFont(stored);
  }, []);

  /* heading components */
  const createHeading = useCallback((level: number) => {
    return ({
      children,
      node: _node,
      ...props
    }: {
      children?: React.ReactNode;
      node?: unknown;
      [key: string]: unknown;
    }) => {
      const Tag = 'h' + level;
      const text = nodeText(children);
      const hid = slugify(text);
      // hover 時字後面浮出 # 錨點連結（點了複製/跳到該段）。
      return React.createElement(
        Tag,
        { id: hid, ...props },
        children,
        React.createElement(
          'a',
          { href: '#' + hid, className: 'heading-anchor', 'aria-label': '本段錨點連結', tabIndex: -1 },
          '#',
        ),
      );
    };
  }, []);

  const headingComponents = useMemo(
    () => ({ h1: createHeading(1), h2: createHeading(2), h3: createHeading(3), h4: createHeading(4) }),
    [createHeading],
  );

  // MDX 文章的基礎元素 override：與 markdown 管線共用同一批元件（shiki 高亮、mermaid、
  // 連結卡、圖片燈箱、標題錨點）→ MDX 文不比 markdown 文遜。傳給 MdxContent。
  const mdxBaseComponents = useMemo(
    () => ({
      code: CodeBlock,
      // MDX 把 block code 包 <pre>，但 CodeBlock 自出 .code-block-wrapper（div）→ pre 透傳避免 div-in-pre。
      pre: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
      p: CustomParagraph,
      img: ({ src, alt, ...rest }: { src?: string; alt?: string }) => <BlogImage src={src} alt={alt} {...rest} />,
      a: ({ href, children, ...rest }: { href?: string; children?: React.ReactNode }) => {
        const h = typeof href === 'string' ? href : '';
        if (!h || h.startsWith('#'))
          return (
            <a href={h} {...rest}>
              {children}
            </a>
          );
        return (
          <LinkHoverPreview href={h} className={(rest as { className?: string }).className}>
            {children}
          </LinkHoverPreview>
        );
      },
      ...headingComponents,
    }),
    [headingComponents],
  );

  /* ── 換文章才捲頂（初次掛載/重整不搶捲動，交給 scrollRestoration 還原）──
     否則 reload 時序會變成：首幀頂端 → scrollRestoration 還原到原位 → 這裡又 smooth 捲頂，
     使用者看到「上→下→上」。用 ref 記前一個 key，只有真的換文章（key 變）才捲頂。 */
  // 切語系（帶 keepScroll）不捲：blog/useRetune 會放回讀者原本那一章
  const keepScroll = location.state.keepScroll === true;
  const prevScrollKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = `${id}:${pathLocale}`;
    // 整欄是原地換掉的（見下面的 is-swapped），直接回到頂端；慢慢捲會從新文章的中段一路刷上去
    if (prevScrollKeyRef.current !== null && prevScrollKeyRef.current !== key && !keepScroll) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    prevScrollKeyRef.current = key;
  }, [id, pathLocale, keepScroll]);

  /* ── 成功載入一篇：增加瀏覽數（每次載入新文章打一次）── */
  useEffect(() => {
    if (!postData?.id) return;
    // 刻意不用 AbortController：瀏覽數是 fire-and-forget，使用者讀完隨即跳頁正是常態，
    // 中止等於把要記的那一筆丟掉。sendBeacon 就是為這種卸載期送出設計的，
    // 後端 post_view 只吃 Path(id)、不讀 body，空 POST 即可。
    // 佇列滿時會回 false，那一筆就放掉——瀏覽數不值得為此再開一條 fetch。
    navigator.sendBeacon('/api/posts/' + postData.id + '/view');
  }, [postData?.id]);

  /* 註：原本這裡有「preview commit 過來自動 scroll 到使用者讀到那段」的邏輯，
       試了 ratio、文字匹配、比例對應好幾輪，preview 跟 BlogPost 渲染差異太大
       （contain-intrinsic-size / 欄寬 / 行高 / Shiki 非同步），找不到 100% 對的對應位置。
       最後決定拔掉 — 預覽是「快速瀏覽」，commit 進文章就從頂端讀，介面比較誠實。
       sessionStorage 順手清掉避免舊資料殘留。 */
  useEffect(() => {
    try {
      sessionStorage.removeItem('__koim_anchor');
    } catch {
      /* ignore */
    }
  }, []);

  /* ── 回應（文末的星座）── */
  const { counts: reactionCounts, mine: myReactions, toggle: toggleReaction } = useReactions(post?.id ?? id);

  /* ── 排版優化：CJK-Latin 自動加空格 + 腳註 hover 浮窗 ── */
  useEffect(() => {
    if (!post?.content || !contentRef.current) return;
    const root = contentRef.current;

    // 1) 中英文之間的空隙：支援 text-autospace 的瀏覽器由 CSS 處理（article-shell.css），
    //    其他的才載 pangu 往 DOM 裡插空白，略過 code/pre 區塊以免破壞範例
    if (!CSS.supports('text-autospace', 'normal')) {
      void import('pangu')
        .then(({ default: pangu }) => {
          root.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th').forEach((el) => {
            if (el.closest('pre') || el.closest('code')) return;
            (pangu as unknown as { spacingElementByNode: (node: Node) => void }).spacingElementByNode(el);
          });
        })
        .catch(() => {
          /* pangu 失敗不影響閱讀 */
        });
    }
    requestAnimationFrame(() => {
      // 2) 腳註 hover 浮窗：把腳註內容寫到 ref 連結的 data-fn-content
      try {
        const fnMap = new Map<string, string>();
        root.querySelectorAll('.footnotes li[id^="user-content-fn-"], .footnotes li[id^="fn-"]').forEach((li) => {
          const id = li.id;
          const clone = li.cloneNode(true) as Element;
          clone
            .querySelectorAll('a.data-footnote-backref, a[href^="#user-content-fnref"], a[href^="#fnref"]')
            .forEach((a) => a.remove());
          const text = clone.textContent.trim().replace(/\s+/g, ' ').slice(0, 320);
          fnMap.set(id, text);
        });
        root.querySelectorAll('sup a[data-footnote-ref], sup a.footnote-ref').forEach((a) => {
          const href = a.getAttribute('href') ?? '';
          const targetId = href.replace(/^#/, '');
          const text = fnMap.get(targetId);
          if (text) a.setAttribute('data-fn-content', text);
        });
      } catch {
        /* 腳註處理失敗就忽略 */
      }
    });
  }, [post?.content]);

  /* ── Copy protection ── */
  useEffect(() => {
    const preventCopy = (e: ClipboardEvent) => {
      const sel = window.getSelection();
      if (sel?.anchorNode) {
        const parent = sel.anchorNode.parentElement;
        if (parent?.closest('.code-block-wrapper')) return;
      }
      e.preventDefault();
      e.clipboardData?.setData('text/plain', '此內容受版權保護，禁止複製。\n原文連結：' + window.location.href);
    };
    document.addEventListener('copy', preventCopy);
    return () => {
      document.removeEventListener('copy', preventCopy);
    };
  }, []);

  /* ── Share handlers ── */
  // SSR-safe：server 無 window（只在 share 按鈕 handler 用到、不進 DOM，故 SSR 給空 origin 不影響 hydration）。
  // 用 canonical slug ＋語系前綴（postShareUrl），不要用路由參數 id：那可能是數字 id 或舊 slug。
  const shareUrl = postShareUrl(post ?? { id }, navLocale, typeof window !== 'undefined' ? window.location.origin : '');
  const shareTitle = post?.title ?? '';

  const handleCopyLink = () => {
    void navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleNativeShare = () => {
    // 同 Blog.tsx：lib.dom 宣告 share 必存在，桌面 Firefox 沒有 → 用可選型別讓守衛誠實。
    const nav: Partial<Navigator> = navigator;
    if (nav.share) {
      void nav.share({ title: shareTitle, url: shareUrl }).catch(() => {
        /* ignore */
      });
    } else {
      handleCopyLink();
    }
  };

  /* ── Read time（與 fallback 共用同一算法）── */
  const readTime = useMemo(() => computeReadTime(post?.content ?? ''), [post?.content]);

  /* ── Extract headings：同步 useMemo（不再 useEffect 延遲）→ 第一幀 TOC 就有值、
        scroll-spy 也能更早啟動；與 fallback 共用 extractHeadings，anchor id 逐字一致 ── */
  const headings = useMemo<Heading[]>(() => extractHeadings(post?.content ?? ''), [post?.content]);

  // 切語系換過來的：放回讀者原本那一章，再從畫面頂端往下掃一次（blog/useRetune）
  useRetune(post?.id ?? -1, colRef, contentRef, headings);

  // 從一篇換到另一篇（左欄、同標籤、同專欄、內文裡的站內連結）：不走全站轉場（TransitionLayer 放行），
  // 這裡原地換——新的那一欄淡入、往上浮一點。第一次載入不演，那時有換頁轉場在接
  const shownIdRef = useRef<number | null>(null);
  const shownId = post?.id ?? null;
  useEffect(() => {
    if (shownId === null) return;
    const before = shownIdRef.current;
    shownIdRef.current = shownId;
    const page = pageRef.current;
    if (before === null || before === shownId || !page) return;
    page.classList.add('is-swapped');
    const timer = window.setTimeout(() => page.classList.remove('is-swapped'), 900);
    return () => window.clearTimeout(timer);
  }, [shownId]);

  /* ════════ Loading ════════ */
  if (loading) {
    return (
      <div className="blog-post-container loading">
        <div className="blog-post-dim-overlay" />
        <KoimLoader fullscreen text="從星際載入文章" />
      </div>
    );
  }

  /* ════════ Error ════════ */
  if (error || !post) {
    const isLocaleMissing = error === 'LOCALE_NOT_AVAILABLE';
    return (
      <div className="blog-post-container error">
        <div className="blog-post-dim-overlay" />
        <div className="error-content">
          <div className="error-icon">🌐</div>
          <h1>{isLocaleMissing ? '此語言版本尚未提供' : '文章航線丟失'}</h1>
          <p>
            {isLocaleMissing
              ? '您請求的語言目前還沒有翻譯版本，可以前往原文頁面閱讀。'
              : '抱歉，我們在宇宙中找不到您要找的文章。'}
          </p>
          {isLocaleMissing ? (
            <LocaleLink to={`/blog/${id}`} className="back-to-blog-link">
              前往原文 →
            </LocaleLink>
          ) : (
            <LocaleLink to="/blog" className="back-to-blog-link">
              ‹ 返回手記
            </LocaleLink>
          )}
        </div>
      </div>
    );
  }

  /* ════════ Main Render ════════ */
  // title/description/og/JSON-LD 由路由 head()（articleMeta + articleJsonLd）出，進 SSR。
  // 舊的 seoDescription/selfPath/alternates/xDefaultPath 只餵已退休的 <SEOHead>，一併移除。
  const postTags: string[] = post.tags;
  const sourceLang = post.source_language;
  const availableLocales = post.available_locales;
  const currentLocale = post.locale;
  // 只有真的有這個語系的譯文提示才顯示；查三次改成查一次
  const translationNotice = lookup(AI_TRANSLATION_NOTICE, currentLocale);
  const titleParts = splitTitle(post.title);

  // 字體吃 CSS 變數而非 state：值由 __root.tsx 的 pre-paint script 從 localStorage 決定，
  // 首屏就是正確字體，不會再有「先用預設 serif 排一次、掛載後整篇重排」的位移。
  //
  // 外框（2026-10 翻新）：內文不動，包在外面的只有一條線——這篇文章自己的星軌（OrbitToc），
  // 它同時是目錄；左邊是附近文章的細線；右側的浮動圓鈕收成文末一行字。
  return (
    <div
      className={`blog-post-container ar-page${isPlaceholderData ? ' is-fetching' : ''}`}
      style={{ fontFamily: 'var(--blog-font)' }}
      ref={pageRef}
    >
      {toastMsg && <Toast key={toastMsg} message={toastMsg} onDone={() => setToastMsg('')} />}

      <OrbitToc
        key={'orbit-' + post.id}
        postId={post.id}
        headings={headings}
        contentRef={contentRef}
        footer={<FontLine current={currentFont} onChange={handleFontChange} />}
        pingRef={tocPingRef}
      />
      <PostsNav currentId={post.id} postCategory={post.category ?? undefined} />

      {/* 換一篇就整欄重掛（標題、摘要、內文、文末）；左欄不重掛，清單自己滑 */}
      <div className="ar-col" ref={colRef} key={post.id}>
        <header className="ar-head">
          <p className="ar-kick">
            <LocaleLink to="/blog">{t('blog.title')}</LocaleLink>
            {post.category && (
              <>
                <span aria-hidden="true">/</span>
                <LocaleLink to="/blog" search={{ category: post.category } as never}>
                  {categoryLabel(post.category)}
                </LocaleLink>
              </>
            )}
          </p>
          <h1>{titleParts.main}</h1>
          {titleParts.sub && <p className="ar-sub">{titleParts.sub}</p>}
          <div className="ar-meta">
            {post.layout_type !== 'column' && (
              <time dateTime={post.created_at} suppressHydrationWarning>
                {dotDate(parseServerDate(post.created_at))}
              </time>
            )}
            <span>{t('blog.minutes', { count: readTime })}</span>
            <span>{t('blog.views', { count: post.view_count })}</span>
            <LangLine
              current={currentLocale}
              from={peekRetune(post.id)?.from}
              source={sourceLang}
              available={availableLocales}
              onSelect={(loc) => {
                const target = postPathForLocale(id, loc, sourceLang); // 已是絕對 locale 路徑,用 href 不再加前綴
                // 記下讀者在哪一章，新語系那頁放回同一個地方（捲動由那邊負責，這裡不要先跳回頂端）
                setRetune(
                  post.id,
                  currentLocale,
                  contentRef.current,
                  headings.map((h) => h.id),
                );
                void navigate({ href: target, resetScroll: false, state: { keepScroll: true } });
              }}
              onUnavailable={(name) => setToastMsg(`「${name}」版本尚未提供`)}
            />
          </div>
          {postTags.length > 0 && <TagShelf tags={postTags} currentId={post.id} label={tagLabel} />}
        </header>

        {/* 非原文語系 → AI 翻譯提示（連回原文） */}
        {currentLocale !== sourceLang && translationNotice && (
          // 跟摘要同一種框（四個角、等寬小字的標頭）：一眼看得出它是附註、不是內文
          <aside className="ar-notice" role="note">
            <div className="ar-notice-hd">
              <i aria-hidden="true" />
              {translationNotice.label}
            </div>
            <p>
              {translationNotice.text}
              <a href={`/blog/${id}`}>{translationNotice.original} →</a>
            </p>
          </aside>
        )}

        {post.excerpt && (
          <ArticleSummary
            // 換一篇或換語系就重新收一次：沿用的話上一篇畫好的底線與逐字的 class 會殘留
            key={`${post.id}-${currentLocale}`}
            excerpt={post.excerpt}
            links={postData?.excerpt_links ?? NO_LINKS}
            headings={headings}
            pingRef={tocPingRef}
          />
        )}

        <article className="post-content drop-cap-first" ref={contentRef}>
          {/* 伺服器預渲染的 mermaid SVG 對照表。CodeBlock 是頂層 export（後台預覽也重用），
              中間又隔著 ReactMarkdown 的內部結構，所以只能走 context。 */}
          <MermaidSvgContext value={postData?.mermaidSvgs ?? {}}>
            {postData?.compiledMdx ? (
              // format='mdx'：server 端已編譯，這裡 runSync 執行成 React 元件（自訂 block +
              // 與 markdown 共用的 code/link/img/heading override）。
              <MdxContent compiled={postData.compiledMdx} baseComponents={mdxBaseComponents} />
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkAlert]}
                rehypePlugins={[rehypeRaw]}
                components={
                  {
                    code: CodeBlock,
                    p: CustomParagraph,
                    img: ({ src, alt, ...rest }) => <BlogImage src={src} alt={alt} {...rest} />,
                    // 行內連結 → hover 預覽卡（資料來自自家 /api/link-preview，不外送給第三方）。
                    // 「整段只有一個連結」那種會先被 CustomParagraph 攔去做 LinkCard 區塊卡，
                    // 所以這裡拿到的都是真正的行內連結。錨點（#foo）不預覽。
                    a: ({ href, children, ...rest }) => {
                      const h = typeof href === 'string' ? href : '';
                      if (!h || h.startsWith('#'))
                        return (
                          <a href={h} {...rest}>
                            {children}
                          </a>
                        );
                      return (
                        <LinkHoverPreview href={h} className={(rest as { className?: string }).className}>
                          {children}
                        </LinkHoverPreview>
                      );
                    },
                    ...headingComponents,
                  } as Components
                }
              >
                {post.content}
              </ReactMarkdown>
            )}
          </MermaidSvgContext>
        </article>
        <SignatureSVG className="blog-signature" />

        {/* 文末：原本右邊的五顆浮動圓鈕收成一行字，接著是反應、系列、上下篇、同分類、留言 */}
        <footer className="ar-end">
          {/* 「喜歡」在下面的星座裡（blog/ReactionSky），這一行只剩分享、訂閱、RSS */}
          <div className="ar-act">
            <button type="button" onClick={handleNativeShare}>
              {copied ? t('blog.shareCopied') : t('blog.share')}
            </button>
            <button type="button" onClick={() => setShowSubscribe(true)}>
              {t('blog.subscribeTitle')}
            </button>
            <a href="/rss" target="_blank" rel="noopener noreferrer">
              RSS
            </a>
            {/* 窄螢幕沒有目錄：字體那一行放在這裡（寬螢幕的在目錄底下） */}
            <FontLine className="ar-font-narrow" current={currentFont} onChange={handleFontChange} />
          </div>
          {/* 回應的狀態只有一個持有者（文章頁）：傳給星座，各自呼叫 useReactions 的話 mine 會分岔 */}
          <ReactionSky counts={reactionCounts} mine={myReactions} toggle={toggleReaction} />
          {post.series_name && <SeriesNav seriesName={post.series_name} currentId={post.id} />}
          <PrevNextNav currentId={post.id} />
          <SameCategory currentId={post.id} postCategory={post.category ?? undefined} />
          <div className="post-extras" id="comments">
            <ArticleComments postId={post.id} allowComments={post.allow_comments} />
          </div>
        </footer>
      </div>

      <AnimatePresence>{showSubscribe && <SubscribeModal onClose={() => setShowSubscribe(false)} />}</AnimatePresence>
    </div>
  );
}

export default BlogPost;
