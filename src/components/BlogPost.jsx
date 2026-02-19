import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter/dist/esm';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FaRegHeart, FaHeart, FaLink, FaRegComment, FaArrowUp,
  FaEnvelope, FaShareAlt, FaRss, FaTimes,
  FaYoutube, FaGithub, FaInstagram, FaExternalLinkAlt,
} from 'react-icons/fa';
import Comments from './Comments';
import SEOHead from './SEOHead';
import './BlogPost.css';

/* ── helpers ── */
const slugify = (text) =>
  text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-\u4e00-\u9fa5]+/g, '')
    .replace(/--+/g, '-');

/* ── Font Options ── */
const FONT_OPTIONS = [
  { id: 'misans', name: 'MiSans', family: '"MiSans", system-ui, -apple-system, sans-serif' },
  { id: 'lxgw', name: '霞鶩文楷', family: '"LXGW WenKai TC", "LXGW WenKai", cursive' },
  { id: 'noto-serif', name: 'Noto Serif', family: '"Noto Serif SC", "Noto Serif TC", Georgia, serif' },
  { id: 'source-han', name: '思源黑體', family: '"Noto Sans SC", "Noto Sans TC", "Source Han Sans SC", sans-serif' },
];

/* ── Link type detection ── */
const getLinkMeta = (url) => {
  try {
    const u = new URL(url);
    const host = u.hostname.replace('www.', '');
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      let vid = '';
      if (host.includes('youtu.be')) vid = u.pathname.slice(1);
      else vid = u.searchParams.get('v') || '';
      return { type: 'youtube', icon: FaYoutube, color: '#ff0000', label: 'YouTube', thumb: vid ? 'https://img.youtube.com/vi/' + vid + '/mqdefault.jpg' : null, vid };
    }
    if (host.includes('github.com')) {
      const parts = u.pathname.split('/').filter(Boolean);
      const repo = parts.length >= 2 ? parts[0] + '/' + parts[1] : u.pathname;
      return { type: 'github', icon: FaGithub, color: '#fff', label: 'GitHub', desc: repo };
    }
    if (host.includes('instagram.com')) return { type: 'instagram', icon: FaInstagram, color: '#E4405F', label: 'Instagram' };
    if (host.includes('threads.net')) return { type: 'threads', icon: FaExternalLinkAlt, color: '#fff', label: 'Threads' };
    return { type: 'generic', icon: FaExternalLinkAlt, color: 'var(--post-muted)', label: host };
  } catch { return null; }
};

/* ══════════════════════════
   LinkCard — rich link preview
   ══════════════════════════ */
const LinkCard = ({ href }) => {
  const meta = getLinkMeta(href);
  if (!meta) return <a href={href} target="_blank" rel="noopener noreferrer">{href}</a>;
  const Icon = meta.icon;

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={'link-card link-card-' + meta.type}>
      {meta.thumb && (
        <div className="link-card-thumb">
          <img src={meta.thumb} alt="" loading="lazy" />
        </div>
      )}
      <div className="link-card-body">
        <div className="link-card-site">
          <Icon style={{ color: meta.color, fontSize: '1rem' }} />
          <span>{meta.label}</span>
        </div>
        <div className="link-card-url">{meta.desc || href}</div>
      </div>
    </a>
  );
};

/* ══════════════════════════
   CodeBlock
   ══════════════════════════ */
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
        customStyle={{ margin: 0, padding: '2rem', background: 'transparent', fontSize: '0.95rem', lineHeight: '1.6' }}
        codeTagProps={{ style: { background: 'none', padding: 0, fontFamily: "'Fira Code','JetBrains Mono',monospace" } }}
        {...props}
      >
        {codeText}
      </SyntaxHighlighter>
    </div>
  ) : (
    <code className={className} {...props}>{children}</code>
  );
};

/* ══════════════════════════
   Custom paragraph — detect standalone link lines for LinkCard
   ══════════════════════════ */
const CustomParagraph = ({ children, node, ...props }) => {
  const childArray = React.Children.toArray(children);
  if (childArray.length === 1) {
    const child = childArray[0];
    if (typeof child === 'string') {
      const trimmed = child.trim();
      if (/^https?:\/\/\S+$/.test(trimmed)) {
        return <LinkCard href={trimmed} />;
      }
    }
    if (child && child.props && child.props.href) {
      const href = child.props.href;
      const text = typeof child.props.children === 'string' ? child.props.children : '';
      if (text === href || text === '') {
        return <LinkCard href={href} />;
      }
    }
  }
  return <p {...props}>{children}</p>;
};

/* ══════════════════════════
   PostsNav — Left sidebar showing OTHER article titles (-style)
   ══════════════════════════ */
const PostsNav = React.memo(({ currentId, postTitle, postCategory }) => {
  const [nearbyPosts, setNearbyPosts] = useState([]);

  useEffect(() => {
    fetch('/api/posts?limit=100')
      .then((r) => r.json())
      .then((data) => {
        const posts = Array.isArray(data) ? data : (data.posts || []);
        if (!posts.length) return;

        const sorted = [...posts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        const currentIdx = sorted.findIndex((p) => String(p.id) === String(currentId));
        if (currentIdx === -1) return;

        const totalPosts = sorted.length;
        let count;
        if (currentIdx === 0) count = 5;
        else if (currentIdx === 1) count = 7;
        else count = 9;
        count = Math.min(count, totalPosts);

        let startIdx = Math.max(0, currentIdx - Math.floor(count / 2));
        let endIdx = startIdx + count;
        if (endIdx > totalPosts) {
          endIdx = totalPosts;
          startIdx = Math.max(0, endIdx - count);
        }

        const slice = sorted.slice(startIdx, endIdx).map((p) => ({
          id: p.id,
          title: p.title,
          year: new Date(p.created_at).getFullYear(),
          isCurrent: String(p.id) === String(currentId),
        }));
        setNearbyPosts(slice);
      })
      .catch(console.error);
  }, [currentId]);

  if (!nearbyPosts.length) return null;

  // Group posts by year for -style display
  const groupedByYear = nearbyPosts.reduce((acc, p) => {
    const y = p.year || '未知';
    if (!acc[y]) acc[y] = [];
    acc[y].push(p);
    return acc;
  }, {});
  const sortedYears = Object.keys(groupedByYear).sort((a, b) => b - a);

  return (
    <nav className="posts-nav">
      <div className="posts-nav-list">
        {sortedYears.map((year) => (
          <div key={year} className="posts-nav-year-group">
            <span className="posts-nav-year">{year}</span>
            {groupedByYear[year].map((p) => (
              p.isCurrent ? (
                <span key={p.id} className="posts-nav-item current" title={p.title}>
                  <span className="posts-nav-indicator">⊙</span>
                  {p.title}
                </span>
              ) : (
                <Link key={p.id} to={'/blog/' + p.id} className="posts-nav-item" title={p.title}>
                  {p.title}
                </Link>
              )
            ))}
          </div>
        ))}
      </div>
      {postCategory && (
        <div className="posts-nav-category" style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <span>此文章收錄於專欄：</span>
          <Link to={'/blog?category=' + encodeURIComponent(postCategory)} className="posts-nav-category-link">{postCategory}</Link>
        </div>
      )}
    </nav>
  );
});

/* ══════════════════════════
   TableOfContents — Right sidebar (TOC with reading progress)
   ══════════════════════════ */
const TableOfContents = React.memo(({ headings, activeHeading, readingProgress, tocRef }) => {
  const scrollToHeading = useCallback((headingId) => {
    setTimeout(() => {
      const el =
        document.getElementById(headingId) ||
        document.querySelector('[id="' + headingId + '"]');
      if (!el) return;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 100, behavior: 'smooth' });
    }, 50);
  }, []);

  return (
    <div className="table-of-contents">
      <div className="toc-header">
        <h3>目錄</h3>
        <div className="reading-progress-circle">
          <svg viewBox="0 0 36 36">
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--post-accent)" strokeWidth="3" strokeDasharray={readingProgress + ', 100'} />
          </svg>
          <span className="progress-text">{Math.round(readingProgress)}%</span>
        </div>
      </div>
      <nav className="toc-nav" ref={tocRef}>
        {headings.map((h) => (
          <button
            key={h.id}
            data-heading-id={h.id}
            className={'toc-item level-' + h.level + (activeHeading === h.id ? ' active' : '')}
            onClick={() => scrollToHeading(h.id)}
            title={h.text}
          >
            <span className="toc-bullet" />
            <span className="toc-text">{h.text}</span>
          </button>
        ))}
      </nav>
      <button className="toc-bottom-link" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
        <FaArrowUp /> 回到文章頂部
      </button>
    </div>
  );
});

/* ══════════════════════════
   SubscribeModal
   ══════════════════════════ */
const SubscribeModal = ({ onClose }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus('success');
        setMessage('訂閱成功！感謝您的訂閱 ✨');
        setEmail('');
        setName('');
        setTimeout(() => onClose(), 2000);
      } else {
        setStatus('error');
        setMessage(data.error || '訂閱失敗');
      }
    } catch {
      setStatus('error');
      setMessage('網路錯誤，請稍後再試');
    }
  };

  return (
    <motion.div
      className="subscribe-overlay"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="subscribe-modal"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.25 }}
      >
        <button className="subscribe-close" onClick={onClose}><FaTimes /></button>
        <div className="subscribe-header">
          <FaEnvelope className="subscribe-icon" />
          <h3>訂閱電子報</h3>
          <p>獲取最新文章通知，不錯過任何精彩內容。</p>
        </div>
        <form onSubmit={handleSubmit} className="subscribe-form">
          <input type="text" placeholder="名字（選填）" value={name} onChange={(e) => setName(e.target.value)} disabled={status === 'loading'} />
          <input type="email" placeholder="電子郵件 *" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={status === 'loading'} />
          <button type="submit" disabled={status === 'loading'}>
            {status === 'loading' ? '處理中...' : '訂閱'}
          </button>
        </form>
        {message && <p className={'subscribe-msg ' + status}>{message}</p>}
        <p className="subscribe-privacy">我們重視您的隱私，不會分享您的資訊。</p>
      </motion.div>
    </motion.div>
  );
};

/* ══════════════════════════
   FontSwitcher — bottom-right popup
   ══════════════════════════ */
const FontSwitcher = ({ currentFont, onFontChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="font-switcher">
      <button className="font-switcher-btn" onClick={() => setIsOpen(!isOpen)} title="切換字型">
        <span>字</span>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="font-switcher-popup"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            {FONT_OPTIONS.map((f) => (
              <button
                key={f.id}
                className={'font-option' + (currentFont === f.id ? ' active' : '')}
                onClick={() => { onFontChange(f.id); setIsOpen(false); }}
                style={{ fontFamily: f.family }}
              >
                {f.name}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ═══════════════════════════════════
   BlogPost — 文章內頁
   ═══════════════════════════════════ */
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
  const [onlineCount] = useState(Math.floor(Math.random() * 3) + 1);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [currentFont, setCurrentFont] = useState(() => localStorage.getItem('blogFont') || 'misans');
  const contentRef = useRef(null);
  const tocRef = useRef(null);
  const { id } = useParams();

  /* Font family memo */
  const fontFamily = useMemo(() => {
    const font = FONT_OPTIONS.find((f) => f.id === currentFont);
    return font ? font.family : FONT_OPTIONS[0].family;
  }, [currentFont]);

  const handleFontChange = useCallback((fontId) => {
    setCurrentFont(fontId);
    localStorage.setItem('blogFont', fontId);
  }, []);

  /* heading components */
  const createHeading = useCallback((level) => {
    return ({ children, ...props }) => {
      const Tag = 'h' + level;
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
    fetch('/api/posts/' + id)
      .then((r) => { if (!r.ok) throw new Error('Post not found'); return r.json(); })
      .then((data) => {
        if (data.message === 'success') {
          setPost({
            ...data,
            date: new Date(data.created_at).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }),
          });
          fetch('/api/posts/' + id + '/view', { method: 'POST' }).catch(console.error);
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

  /* ── Copy protection ── */
  useEffect(() => {
    const preventCopy = (e) => {
      const sel = window.getSelection();
      if (sel && sel.anchorNode) {
        const parent = sel.anchorNode.parentElement;
        if (parent && parent.closest('.code-block-wrapper')) return;
      }
      e.preventDefault();
      e.clipboardData?.setData('text/plain', '此內容受版權保護，禁止複製。\n原文連結：' + window.location.href);
    };
    document.addEventListener('copy', preventCopy);
    return () => { document.removeEventListener('copy', preventCopy); };
  }, []);

  /* ── Like handler ── */
  const handleLike = async () => {
    const pid = post.id || parseInt(id);
    const next = !liked;
    try {
      const res = await fetch('/api/posts/' + pid + '/' + (next ? 'like' : 'unlike'), { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setLiked(next);
        setLikeCount(data.likes);
        const stored = JSON.parse(localStorage.getItem('likedPosts') || '[]');
        localStorage.setItem('likedPosts', JSON.stringify(next ? [...stored.filter((i) => i !== pid), pid] : stored.filter((i) => i !== pid)));
      }
    } catch (e) { console.error('Like failed:', e); }
  };

  /* ── Share handler ── */
  const handleShare = () => {
    navigator.clipboard.writeText(window.location.origin + '/blog/' + id).then(() => {
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

  /* ── Scroll / progress / active heading ── */
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
            const item = tocRef.current.querySelector('[data-heading-id="' + cur + '"]');
            if (item) item.scrollIntoView({ behavior: 'auto', block: 'nearest' });
          }
        }
      }, 150);
    };

    let ticking = false;
    const listener = () => {
      if (!ticking) { window.requestAnimationFrame(() => { handleScroll(); ticking = false; }); ticking = true; }
    };
    window.addEventListener('scroll', listener, { passive: true });
    const init = setTimeout(handleScroll, 500);
    return () => { window.removeEventListener('scroll', listener); clearTimeout(timer); clearTimeout(init); };
  }, [post, headings]);

  /* ════════ Loading ════════ */
  if (loading) {
    return (
      <div className="blog-post-container loading">
        <div className="blog-post-dim-overlay" />
        <div className="loading-indicator">
          <div className="cosmic-loader"><div className="planet" /><div className="orbit" /></div>
          <p>正在從星際載入文章...</p>
        </div>
      </div>
    );
  }

  /* ════════ Error ════════ */
  if (error || !post) {
    return (
      <div className="blog-post-container error">
        <div className="blog-post-dim-overlay" />
        <div className="error-content">
          <div className="error-icon">🚀</div>
          <h1>文章航線丟失</h1>
          <p>抱歉，我們在宇宙中找不到您要找的文章。</p>
          <Link to="/blog" className="back-to-blog-link">‹ 返回手記</Link>
        </div>
      </div>
    );
  }

  /* ════════ Main Render ════════ */
  return (
    <div className="blog-post-container" style={{ fontFamily }}>
      <SEOHead title={post.title} description={post.excerpt || post.content?.substring(0, 160).replace(/<[^>]+>/g, '')} path={'/blog/' + id} />

      {/* Dim overlay over global starfield */}
      <div className="blog-post-dim-overlay" />

      {/* Reading Progress */}
      <div className="reading-progress-bar">
        <div className="reading-progress-fill" style={{ width: readingProgress + '%' }} />
      </div>

      {/* ── Header ── */}
      <header className="post-header">
        <h1 className="post-title">{post.title}</h1>

        <div className="post-meta-row">
          <span className="meta-date">⏱ {post.date}</span>
          <span className="meta-sep">·</span>
          <span className="meta-author">✦ {post.author}</span>
          <span className="meta-sep">·</span>
          <span>📖 {post.view_count || 0}</span>
          <span className="meta-sep">·</span>
          <span>❤️ {likeCount}</span>
          <span className="meta-sep">·</span>
          <span>☕ 約 {readTime} 分鐘</span>
          {post.category && (
            <>
              <span className="meta-sep">·</span>
              <span className="meta-category">{post.category}</span>
            </>
          )}
          <span className="meta-sep">·</span>
          <span className="meta-lang">🌏 中文</span>
          <span className="meta-sep">·</span>
          <span className="meta-online">當前 {onlineCount} 人正在閱讀</span>
        </div>

        {post.tags && post.tags.length > 0 && (
          <div className="post-tags">
            {post.tags.map((tag) => {
              const name = typeof tag === 'string' ? tag : (tag.name || tag);
              return <span key={name} className="tag">#{name}</span>;
            })}
          </div>
        )}
      </header>

      {/* ── Content body: left sidebar + center + right sidebar ── */}
      <div className="post-body">
        {/* Left sidebar — other article titles */}
        <aside className="post-sidebar-left">
          <PostsNav currentId={id} postTitle={post.title} postCategory={post.category} />
        </aside>

        <div className="post-main-column">
          <div className="post-content-wrapper">
            {/* AI Summary — inside card top with gradient fade */}
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

            <article className="post-content drop-cap-first" ref={contentRef}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{ code: CodeBlock, p: CustomParagraph, ...headingComponents }}
              >
                {post.content}
              </ReactMarkdown>
            </article>
          </div>

          {/* ── Comments ── */}
          <div className="post-extras" id="comments">
            <Comments postId={id} />
          </div>
        </div>

        {/* Right sidebar — TOC */}
        {headings.length > 0 && (
          <aside className="post-sidebar-right">
            <TableOfContents headings={headings} activeHeading={activeHeading} readingProgress={readingProgress} tocRef={tocRef} />
          </aside>
        )}
      </div>

      {/* ── Floating side actions (right) ── */}
      <div className="floating-actions">
        <button className={'float-btn' + (liked ? ' active' : '')} onClick={handleLike} title="讚">
          {liked ? <FaHeart /> : <FaRegHeart />}
          {likeCount > 0 && <span>{likeCount}</span>}
        </button>
        <button className={'float-btn' + (copied ? ' shared' : '')} onClick={handleShare} title="分享">
          <FaShareAlt />
        </button>
        <a href="#comments" className="float-btn" title="留言">
          <FaRegComment />
        </a>
        <button className="float-btn" onClick={() => setShowSubscribe(true)} title="訂閱">
          <FaEnvelope />
        </button>
        <a href="/rss" className="float-btn" title="RSS" target="_blank" rel="noopener noreferrer">
          <FaRss />
        </a>
      </div>

      {/* ── Font Switcher (bottom-right) ── */}
      <FontSwitcher currentFont={currentFont} onFontChange={handleFontChange} />

      {/* ── Subscribe Modal ── */}
      <AnimatePresence>
        {showSubscribe && <SubscribeModal onClose={() => setShowSubscribe(false)} />}
      </AnimatePresence>
    </div>
  );
}

export default BlogPost;
