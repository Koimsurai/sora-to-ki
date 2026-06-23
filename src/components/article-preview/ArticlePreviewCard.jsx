import { useEffect, useState, useRef, useCallback } from 'react';
import ReactDOM, { flushSync } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkAlert } from 'remark-github-blockquote-alert';
import rehypeRaw from 'rehype-raw';
import { useArticlePreview } from './ArticlePreviewContext';
import { getArticle } from '../../lib/articleCache';
import { BlogImage } from '../ImageLightbox';
import { highlightCode } from '../../lib/shikiHighlight';
import '../BlogPost.css';
import './article-preview.css';

/**
 * Preview 用簡化版 CodeBlock — 跟 BlogPost 的 .code-block-wrapper / .shiki-output 共用樣式，
 * 只是去掉複製按鈕跟 mermaid 處理（preview 看一眼就好）
 */
function PreviewCodeBlock({ inline, className, children, ...props }) {
  const [highlighted, setHighlighted] = useState(null);
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : 'text';
  const codeText = String(children).replace(/\n$/, '');

  // 自動偵測 mermaid — 跟 BlogPost 的 CodeBlock 同邏輯
  const isMermaid = lang === 'mermaid' || (
    !inline && (lang === 'text' || !match) &&
    /^(---|graph\s|flowchart\s|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|sankey)/m.test(codeText.trim())
  );

  useEffect(() => {
    if (inline || !match || isMermaid) return;
    let cancelled = false;
    highlightCode(codeText, lang)
      .then((html) => { if (!cancelled) setHighlighted(html); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [codeText, lang, inline, match, isMermaid]);

  // 預覽不渲染實際 mermaid 圖（mermaid 庫 +1MB，影響首載），顯示 placeholder
  if (!inline && isMermaid) {
    return (
      <div className="article-preview-mermaid-placeholder">
        <span className="article-preview-mermaid-icon">📊</span>
        <span>Mermaid 圖表 · 進入文章後可互動</span>
      </div>
    );
  }

  if (!inline && match) {
    return (
      <div className="code-block-wrapper">
        <div className="code-block-header">
          <span className="language-name">{lang}</span>
        </div>
        {highlighted ? (
          <div className="shiki-output" dangerouslySetInnerHTML={{ __html: highlighted }} />
        ) : (
          <pre className="shiki-fallback"><code>{codeText}</code></pre>
        )}
      </div>
    );
  }
  return <code className={className} {...props}>{children}</code>;
}

/**
 * 預覽卡片
 *  - peek 階段：置中 modal（800×70vh，背景 backdrop-blur）
 *  - commit 階段：卡片 morph 到全文章區大小（top 80px、左右留邊、滿高），
 *    透過 CSS transition 平滑變大；同步把 scroll ratio 傳給 BlogPost route，
 *    BlogPost mount 時還原 window scrollTop，使用者不必重滑
 */
function ArticlePreviewCard() {
  const {
    state,
    previewId,
    dismissPreview,
    scheduleClose,
    cancelClose,
    reportScrollProgress,
    commit,
    reset,
  } = useArticlePreview();

  const navigate = useNavigate();
  const [article, setArticle] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const scrollerRef = useRef(null);
  const cardRef = useRef(null);

  // 點卡片外部（document-level）→ 關。card 內部 stopPropagation 不關
  useEffect(() => {
    if (state !== 'peeking') return;
    const onDocClick = (e) => {
      if (cardRef.current && cardRef.current.contains(e.target)) return;
      dismissPreview();
    };
    // 用 setTimeout 確保 hover 觸發 preview 的同一輪 click 不會立即又關掉
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDocClick);
    }, 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDocClick);
    };
  }, [state, dismissPreview]);

  // ── 取資料 + 重置 scrollTop ──
  // 注意：previewId 變 null 時「不」清 article，讓 AnimatePresence 的 exit 動畫
  // 仍能顯示上一篇內容；下次 hover 新文章再 fetch 取代
  useEffect(() => {
    if (!previewId) {
      setLoadError(false);
      return;
    }
    let cancelled = false;
    setLoadError(false);
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
    getArticle(previewId)
      .then((data) => { if (!cancelled) setArticle(data); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [previewId]);

  useEffect(() => {
    if (article && scrollerRef.current) scrollerRef.current.scrollTop = 0;
  }, [article]);

  // ── scroll progress 監聽 ──
  const handleScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 80) return;
    const ratio = el.scrollTop / maxScroll;
    reportScrollProgress(Math.min(1, Math.max(0, ratio)));
  }, [reportScrollProgress]);

  // ── commit 觸發：單純 navigate 到文章頁，不再做位置還原 ──
  // 以前試過 ratio / element text matching / 比例對應，preview 跟 BlogPost 渲染差異
  // 太大（contain-intrinsic-size / 欄寬 / 行高），找不到 100% 對的對應位置。
  // 拔掉後 user 進文章就是從頂端開始 — 預覽歸預覽，閱讀歸閱讀，介面比較誠實。
  useEffect(() => {
    if (state !== 'committing' || !previewId) return;
    const targetUrl = `/blog/${previewId}`;
    flushSync(() => {
      reset();
      navigate(targetUrl, { state: { fromPreview: true } });
    });
  }, [state, previewId, navigate, reset]);

  // ── 卡片定位 — 統一用 peek style，commit 改靠 exit 動畫消除（不再 morph 撐大） ──
  // 注意：translateX(-50%) 必須走 framer-motion style.x，不可用 transform 字串（會被覆蓋）
  const peekStyle = {
    position: 'fixed',
    top: '12vh',
    left: '50%',
    x: '-50%',
    width: 'min(820px, calc(100vw - 32px))',
    height: '72vh',
  };

  const isVisible = state !== 'idle' && !!previewId;
  // commit 過程的 exit 要瞬間發生（不跑 framer-motion 動畫），讓 View Transition API 接手 morph；
  // 一般 hover 離開的 exit 保留優雅的 blur/shrink/drop
  const isCommittingExit = state === 'committing' || state === 'committed';

  const card = (
    <AnimatePresence>
      {isVisible && (
      <motion.div
        ref={cardRef}
        key="preview-card"
        className={`article-preview-card article-preview-card--${state}`}
        style={peekStyle}
        initial={{ opacity: 0, scale: 0.96, y: 8, filter: 'blur(6px)' }}
        animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
        // commit 路徑：簡單的「放大 + 淡出」感受 hint，避免複雜 morph 造成雙重渲染
        exit={isCommittingExit
          ? { opacity: 0, scale: 1.06, y: -8 }
          : { opacity: 0, scale: 0.94, y: 16, filter: 'blur(10px)' }
        }
        transition={{
          duration: isCommittingExit ? 0.32 : 0.34,
          ease: [0.32, 0.72, 0, 1],
        }}
        onMouseEnter={() => { if (state === 'peeking') cancelClose(); }}
        onMouseLeave={() => { if (state === 'peeking') scheduleClose(); }}
        role="dialog"
        aria-label={article?.title || '文章預覽'}
      >
        <div
          ref={scrollerRef}
          className="article-preview-scroller"
          onScroll={handleScroll}
        >
          {loadError && (
            <div className="article-preview-error">無法載入預覽，請點擊原連結進入。</div>
          )}
          {!loadError && !article && (
            <div className="article-preview-loading">
              <div className="article-preview-loading-dot" />
              <div className="article-preview-loading-dot" />
              <div className="article-preview-loading-dot" />
            </div>
          )}
          {article && (
            <div className="article-preview-content">
              {article.category?.name && (
                <div className="article-preview-meta">{article.category.name}</div>
              )}
              <h1 className="article-preview-title">{article.title}</h1>
              {article.excerpt && (
                <div className="post-ai-summary-inline">
                  <div className="ai-summary-top-row">
                    <h4>🔑 關鍵洞察</h4>
                    <span className="ai-badge">✦ AI·GEN</span>
                  </div>
                  <p>{article.excerpt}</p>
                </div>
              )}
              <article className="post-content article-preview-body-content">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkAlert]}
                  rehypePlugins={[rehypeRaw]}
                  components={{
                    code: PreviewCodeBlock,
                    img: ({ src, alt, ...rest }) => <BlogImage src={src} alt={alt} {...rest} />,
                  }}
                >
                  {article.content || ''}
                </ReactMarkdown>
              </article>
            </div>
          )}
        </div>
        {state === 'peeking' && (
          <button
            type="button"
            className="article-preview-commit-btn"
            onClick={commit}
            aria-label="直接進入文章"
          >
            進入文章 →
          </button>
        )}
      </motion.div>
      )}
    </AnimatePresence>
  );

  return ReactDOM.createPortal(card, document.body);
}

export default ArticlePreviewCard;
