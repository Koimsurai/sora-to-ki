import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter/dist/esm';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { motion } from 'framer-motion';
import {
  FaRegHeart, FaHeart, FaChevronLeft, FaChevronRight,
  FaLink, FaRegComment,
} from 'react-icons/fa';
import Comments from './Comments';
import Newsletter from './Newsletter';
import SEOHead from './SEOHead';
import './BlogPost.css';

/* ── helpers ── */
const slugify = (text) =>
  text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-\u4e00-\u9fa5]+/g, '')
    .replace(/--+/g, '-');

/* ══════════════════════════════════════════
   CodeBlock — syntax-highlighted code fence
   ══════════════════════════════════════════ */
const CodeBlock = ({ node, inline, className, children, ...props }) => {
  const [isCopied, setIsCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : 'text';
  const codeText = String(children).replace(/\n$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(codeText).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  return !inline && match ? (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="language-name">{lang}</span>
        <button onClick={handleCopy} className="copy-button">
          {isCopied ? '已複製!' : '複製'}
        </button>
      </div>
      <SyntaxHighlighter
        style={vscDarkPlus}
        language={lang}
        PreTag="div"
        customStyle={{
          margin: 0, padding: '2rem',
          background: 'transparent', fontSize: '0.95rem', lineHeight: '1.6',
        }}
        codeTagProps={{
          style: {
            background: 'none', padding: 0,
            fontFamily: "'Fira Code','JetBrains Mono','SF Mono',monospace",
          },
        }}
        {...props}
      >
        {codeText}
      </SyntaxHighlighter>
    </div>
  ) : (
    <code className={className} {...props}>{children}</code>
  );
};

/* ══════════════════════════════════════════
   TableOfContents — sticky sidebar
   ══════════════════════════════════════════ */
const TableOfContents = React.memo(({ headings, activeHeading, readingProgress, tocRef }) => {
  const scrollToHeading = React.useCallback((headingId) => {
    setTimeout(() => {
      const el =
        document.getElementById(headingId) ||
        document.querySelector(`[id="${headingId}"]`) ||
        document.querySelector(`h1[id="${headingId}"],h2[id="${headingId}"],h3[id="${headingId}"],h4[id="${headingId}"]`);
      if (!el) return;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 120, behavior: 'smooth' });
    }, 100);
  }, []);

  return (
    <div className="table-of-contents">
      <div className="toc-header">
        <h3>目錄</h3>
        <div className="reading-progress-circle">
          <svg viewBox="0 0 36 36">
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3"
            />
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none" stroke="var(--post-accent)" strokeWidth="3"
              strokeDasharray={`${readingProgress}, 100`}
            />
          </svg>
          <span className="progress-text">{Math.round(readingProgress)}%</span>
        </div>
      </div>
      <nav className="toc-nav" ref={tocRef}>
        {headings.map((h) => (
          <button
            key={h.id}
            data-heading-id={h.id}
            className={`toc-item level-${h.level} ${activeHeading === h.id ? 'active' : ''}`}
            onClick={() => scrollToHeading(h.id)}
            title={h.text}
          >
            <span className="toc-bullet">•</span>
            <span className="toc-text">{h.text}</span>
          </button>
        ))}
      </nav>
    </div>
  );
});

/* ══════════════════════════════════════════
   BlogPost — 文章內頁
   ══════════════════════════════════════════ */
function BlogPost() {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [readingProgress, setReadingProgress] = useState(0);
  const [headings, setHeadings] = useState([]);
  const [activeHeading, setActiveHeading] = useState('');
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef(null);
  const tocRef = useRef(null);
  const { id } = useParams();

  /* heading component factory */
  const createHeading = useCallback((level) => {
    return ({ children, ...props }) => {
      const Tag = `h${level}`;
      const text = React.Children.toArray(children).join('');
      const hid = slugify(text);
      return React.createElement(Tag, { id: hid, ...props }, children);
    };
  }, []);

  const headingComponents = useMemo(
    () => ({ h1: createHeading(1), h2: createHeading(2), h3: createHeading(3), h4: createHeading(4) }),
    [createHeading],
  );

  /* ── Fetch post ── */
  useEffect(() => {
    setLoading(true);
    fetch(`/api/posts/${id}`)
      .then((r) => { if (!r.ok) throw new Error('Post not found'); return r.json(); })
      .then((data) => {
        if (data.message === 'success') {
          setPost({
            ...data,
            date: new Date(data.created_at).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' }),
          });
          fetch(`/api/posts/${id}/view`, { method: 'POST' }).catch(console.error);
        } else { throw new Error('Post not found'); }
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [id]);

  /* ── Like state ── */
  useEffect(() => {
    if (!post) return;
    const stored = JSON.parse(localStorage.getItem('likedPosts') || '[]');
    const pid = post.id || parseInt(id);
    if (stored.includes(pid)) setLiked(true);
    setLikeCount(post.likes || 0);
  }, [post, id]);

  /* ── Like handler ── */
  const handleLike = async () => {
    const pid = post.id || parseInt(id);
    const next = !liked;
    try {
      const res = await fetch(`/api/posts/${pid}/${next ? 'like' : 'unlike'}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setLiked(next);
        setLikeCount(data.likes);
        const stored = JSON.parse(localStorage.getItem('likedPosts') || '[]');
        localStorage.setItem(
          'likedPosts',
          JSON.stringify(next ? [...stored.filter((i) => i !== pid), pid] : stored.filter((i) => i !== pid)),
        );
      }
    } catch (e) { console.error('Like failed:', e); }
  };

  /* ── Share handler ── */
  const handleShare = () => {
    navigator.clipboard.writeText(`${window.location.origin}/blog/${id}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  /* ── Read time ── */
  const readTime = useMemo(() => {
    if (!post?.content) return 1;
    const len = post.content.replace(/<[^>]+>/g, '').replace(/[#*`>\-[\]()]/g, '').length;
    return Math.max(1, Math.ceil(len / 500));
  }, [post?.content]);

  /* ── Extract headings ── */
  useEffect(() => {
    if (!post?.content) return;
    const clean = post.content.replace(/```[\s\S]*?```/g, '');
    const re = /^(#{1,4})\s+(.+)$/gm;
    const out = [];
    let m;
    while ((m = re.exec(clean)) !== null) {
      out.push({ id: slugify(m[2].trim()), text: m[2].trim(), level: m[1].length });
    }
    setHeadings(out);
  }, [post?.content]);

  /* ── Scroll / progress ── */
  useEffect(() => {
    if (!post) return;
    let timer = null;
    let lastActive = activeHeading;

    const handleScroll = () => {
      const wh = window.innerHeight;
      const dh = document.documentElement.scrollHeight;
      const st = window.scrollY;
      const scrollable = dh - wh;
      setReadingProgress(scrollable > 0 ? Math.min(100, Math.max(0, (st / scrollable) * 100)) : 0);

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!contentRef.current || !headings.length) return;
        const els = contentRef.current.querySelectorAll('[id]');
        let cur = '';
        let minD = Infinity;
        els.forEach((el) => {
          const t = el.getBoundingClientRect().top;
          if (t <= 200 && t >= -100 && Math.abs(t - 100) < minD) { minD = Math.abs(t - 100); cur = el.id; }
        });
        if (!cur) {
          for (let i = 0; i < els.length; i++) {
            const t = els[i].getBoundingClientRect().top;
            if (t > 0 && t < wh) { cur = els[i].id; break; }
          }
        }
        if (cur && cur !== lastActive) {
          lastActive = cur;
          setActiveHeading(cur);
          if (tocRef.current) {
            const item = tocRef.current.querySelector(`[data-heading-id="${cur}"]`);
            if (item) item.scrollIntoView({ behavior: 'auto', block: 'nearest' });
          }
        }
      }, 200);
    };

    let ticking = false;
    const listener = () => {
      if (!ticking) { window.requestAnimationFrame(() => { handleScroll(); ticking = false; }); ticking = true; }
    };
    window.addEventListener('scroll', listener, { passive: true });
    const init = setTimeout(handleScroll, 500);
    return () => { window.removeEventListener('scroll', listener); clearTimeout(timer); clearTimeout(init); };
  }, [post, headings]);

  /* ── Date parts ── */
  const dateObj = post ? new Date(post.created_at) : null;
  const dayStr = dateObj ? String(dateObj.getDate()) : '';
  const monthYear = dateObj ? dateObj.toLocaleDateString('zh-TW', { year: 'numeric', month: 'short' }) : '';

  /* ════════ Loading ════════ */
  if (loading) {
    return (
      <div className="blog-post-container loading">
        <div className="post-nebula-bg">
          <div className="nebula-layer post-neb-1" />
          <div className="nebula-layer post-neb-2" />
          <div className="nebula-layer post-neb-3" />
          <div className="post-nebula-dust" />
        </div>
        <motion.div className="loading-indicator" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <div className="cosmic-loader"><div className="planet" /><div className="orbit" /></div>
          <p>正在從星際載入文章...</p>
        </motion.div>
      </div>
    );
  }

  /* ════════ Error ════════ */
  if (error || !post) {
    return (
      <div className="blog-post-container error">
        <div className="post-nebula-bg">
          <div className="nebula-layer post-neb-1" />
          <div className="nebula-layer post-neb-2" />
          <div className="nebula-layer post-neb-3" />
          <div className="post-nebula-dust" />
        </div>
        <motion.div className="error-content" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
          <div className="error-icon">🚀</div>
          <h1>文章航線丟失</h1>
          <p>抱歉，我們在宇宙中找不到您要找的文章。</p>
          <Link to="/blog" className="back-to-blog-link">‹ 返回手記</Link>
        </motion.div>
      </div>
    );
  }

  /* ════════ Main Render ════════ */
  return (
    <div className="blog-post-container">
      <SEOHead
        title={post.title}
        description={post.excerpt || post.content?.substring(0, 160).replace(/<[^>]+>/g, '')}
        path={`/blog/${id}`}
      />

      <div className="post-nebula-bg">
        <div className="nebula-layer post-neb-1" />
        <div className="nebula-layer post-neb-2" />
        <div className="nebula-layer post-neb-3" />
        <div className="post-nebula-dust" />
      </div>

      {/* Reading Progress */}
      <div className="reading-progress-bar">
        <motion.div
          className="reading-progress-fill"
          style={{ width: `${readingProgress}%` }}
          initial={{ width: 0 }}
          animate={{ width: `${readingProgress}%` }}
          transition={{ duration: 0.2 }}
        />
      </div>

      {/* ── Header —  open style ── */}
      <motion.header
        className="post-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15 }}
      >
        <div className="post-header-inner">
          <div className="post-date-block">
            <span className="date-day">{dayStr}</span>
            <span className="date-label">{monthYear}</span>
          </div>

          <div className="post-header-text">
            <nav className="post-breadcrumb">
              <Link to="/blog">手記</Link>
              <span className="breadcrumb-sep">/</span>
              <span className="breadcrumb-current">{post.category || 'Article'}</span>
            </nav>

            <h1 className="post-title">{post.title}</h1>

            <div className="post-meta-row">
              <span className="meta-author">✦ {post.author}</span>
              <span className="meta-sep">·</span>
              <span className="meta-date">{post.date}</span>
              <span className="meta-sep">·</span>
              <span className="meta-readtime">約 {readTime} 分鐘</span>
              {post.view_count > 0 && (
                <>
                  <span className="meta-sep">·</span>
                  <span className="meta-views">{post.view_count} 次閱讀</span>
                </>
              )}
            </div>

            {post.tags && post.tags.length > 0 && (
              <div className="post-tags">
                {post.tags.map((tag) => {
                  const name = typeof tag === 'string' ? tag : (tag.name || tag);
                  return <span key={name} className="tag">#{name}</span>;
                })}
              </div>
            )}
          </div>
        </div>
      </motion.header>

      {/* ── Content + Sidebar ── */}
      <motion.main
        className="post-main-content"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      >
        <div className="post-content-wrapper">
          <article className="post-content" ref={contentRef}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={{ code: CodeBlock, ...headingComponents }}
            >
              {post.content}
            </ReactMarkdown>
          </article>

          {/* ── Reaction Bar ── */}
          <div className="post-reaction-bar">
            <button
              className={`reaction-btn like-btn ${liked ? 'active' : ''}`}
              onClick={handleLike}
              title="讚"
            >
              {liked ? <FaHeart /> : <FaRegHeart />}
              {likeCount > 0 && <span className="reaction-count">{likeCount}</span>}
            </button>
            <a href="#comments" className="reaction-btn comment-btn" title="留言">
              <FaRegComment />
            </a>
            <button
              className={`reaction-btn share-btn ${copied ? 'active' : ''}`}
              onClick={handleShare}
              title="複製連結"
            >
              <FaLink />
              {copied && <span className="reaction-toast">已複製!</span>}
            </button>
          </div>
        </div>

        {headings.length > 0 && (
          <motion.aside
            className="post-sidebar"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            <TableOfContents
              headings={headings}
              activeHeading={activeHeading}
              readingProgress={readingProgress}
              tocRef={tocRef}
            />
          </motion.aside>
        )}
      </motion.main>

      {/* ── Newsletter & Comments ── */}
      <div className="post-extras">
        <Newsletter />
        <div id="comments">
          <Comments postId={id} />
        </div>
      </div>

      {/* ── Footer Nav ── */}
      <motion.footer
        className="post-footer"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.7 }}
      >
        <div className="post-footer-nav">
          {parseInt(id) > 1 && (
            <Link to={`/blog/${parseInt(id) - 1}`} className="post-nav-link prev">
              <FaChevronLeft />
              <div className="nav-label"><small>上一篇</small></div>
            </Link>
          )}
          <Link to="/blog" className="back-to-blog-link">返回手記</Link>
          <Link to={`/blog/${parseInt(id) + 1}`} className="post-nav-link next">
            <div className="nav-label"><small>下一篇</small></div>
            <FaChevronRight />
          </Link>
        </div>
      </motion.footer>
    </div>
  );
}

export default BlogPost;
