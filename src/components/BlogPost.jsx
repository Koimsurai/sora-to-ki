import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter/dist/esm';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import mermaid from 'mermaid';
import elkLayouts from '@mermaid-js/layout-elk';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import ReactDOM from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FaRegHeart, FaHeart, FaLink, FaRegComment, FaArrowUp,
  FaEnvelope, FaShareAlt, FaRss, FaTimes,
  FaYoutube, FaGithub, FaInstagram, FaExternalLinkAlt,
  FaTwitter, FaFacebook,
} from 'react-icons/fa';
import Comments from './Comments';
import SEOHead from './SEOHead';
import { BlogImage } from './ImageLightbox';
import './BlogPost.css';
import SignatureSVG from './SignatureSVG';

/* ── Mermaid init (with ELK layout) ── */
mermaid.registerLayoutLoaders(elkLayouts);

const MERMAID_THEMES = [
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'default', label: 'Default', icon: '☀️' },
  { value: 'forest', label: 'Forest', icon: '🌲' },
  { value: 'neutral', label: 'Neutral', icon: '⚪' },
  { value: 'base', label: 'Base', icon: '🎨' },
];
const MERMAID_LOOKS = [
  { value: 'neo', label: 'Neo', icon: '💎' },
  { value: 'classic', label: 'Classic', icon: '📐' },
  { value: 'handDrawn', label: 'Hand Drawn', icon: '✏️' },
];
const MERMAID_LAYOUTS = [
  { value: 'dagre', label: 'Hierarchical', icon: '📊' },
  { value: 'elk', label: 'Adaptive', icon: '🌐' },
];
const MERMAID_DIRECTIONS = [
  { value: 'TB', label: 'Top to Bottom', icon: '↓' },
  { value: 'BT', label: 'Bottom to Top', icon: '↑' },
  { value: 'LR', label: 'Left to Right', icon: '→' },
  { value: 'RL', label: 'Right to Left', icon: '←' },
];

/* ── Toolbar SVG Icons ── */
const IconPalette = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="17.5" cy="10.5" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="8.5" cy="7.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="6.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.67 1.5-1.5 0-.4-.15-.74-.42-1.03-.28-.28-.42-.63-.42-1.03 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6C22 6.5 17.52 2 12 2z"/>
  </svg>
);
const IconLook = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);
const IconLayout = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
    <path d="M18 9a9 9 0 0 1-9 9"/>
  </svg>
);
const IconDirection = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="7 8 12 13 17 8"/><polyline points="7 14 12 19 17 14"/>
  </svg>
);
const IconExpand = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
    <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
  </svg>
);

const DARK_THEME_VARS = {
  primaryColor: '#7f5af0',
  primaryTextColor: '#e0e0e0',
  primaryBorderColor: '#7f5af0',
  lineColor: '#7f5af0',
  secondaryColor: '#2cb67d',
  tertiaryColor: 'transparent',
  background: 'transparent',
  mainBkg: 'rgba(127, 90, 240, 0.12)',
  nodeBorder: '#7f5af0',
  clusterBkg: 'transparent',
  clusterBorder: 'rgba(127, 90, 240, 0.3)',
  titleColor: '#e0e0e0',
  edgeLabelBackground: 'rgba(30, 30, 46, 0.9)',
  fontSize: '14px',
};

function parseMermaidFrontmatter(code) {
  const trimmed = code.trim();
  const fm = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!fm) return { config: {}, body: trimmed };
  const yamlBlock = fm[1];
  const config = {};
  let current = null;
  for (const line of yamlBlock.split('\n')) {
    const indent = line.search(/\S/);
    const trimLine = line.trim();
    if (!trimLine || trimLine.startsWith('#')) continue;
    const kv = trimLine.match(/^(\w[\w-]*):\s*(.*)/);
    if (kv) {
      if (indent === 0 || indent === 2) {
        if (kv[2]) { config[kv[1]] = kv[2]; current = null; }
        else { config[kv[1]] = {}; current = kv[1]; }
      } else if (current && typeof config[current] === 'object') {
        config[current][kv[1]] = kv[2];
      }
    }
  }
  return { config, body: trimmed.slice(fm[0].length) };
}

/* ── MermaidDiagram (shared renderer used in inline + fullscreen) ── */
const MermaidDiagram = ({ code, theme, look, layout, direction, onError }) => {
  const containerRef = useRef(null);
  const idRef = useRef(0);

  const parsed = useMemo(() => parseMermaidFrontmatter(code), [code]);

  useEffect(() => {
    if (!containerRef.current) return;
    const id = `mermaid-${Date.now()}-${idRef.current++}`;

    let body = parsed.body;
    body = body.replace(/((?:flowchart|graph)\s+)(?:TB|BT|LR|RL)/, `$1${direction}`);

    let themeVars = theme === 'dark' ? { ...DARK_THEME_VARS } : {};
    if (look === 'neo' && themeVars.clusterBkg) {
      delete themeVars.clusterBkg;
      delete themeVars.clusterBorder;
    }

    const render = async () => {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme,
          look,
          layout,
          themeVariables: themeVars,
          flowchart: { curve: 'basis', useMaxWidth: false },
          securityLevel: 'loose',
        });
        const { svg } = await mermaid.render(id, body);
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          onError?.(null);
        }
      } catch (e) {
        console.warn('Mermaid render error:', e);
        onError?.(e.message || 'Mermaid 渲染失敗');
        const errNode = document.getElementById('d' + id);
        if (errNode) errNode.remove();
      }
    };
    render();
  }, [code, theme, look, layout, direction, parsed.body]);

  return <div className="mermaid-render" ref={containerRef} />;
};

/* ── Toolbar icon menu ── */
const ToolbarMenu = ({ icon, label, value, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);

  return (
    <div className="mm-menu" ref={ref}>
      <button
        className={`mm-menu-trigger${open ? ' mm-menu-trigger--open' : ''}`}
        onClick={() => setOpen(!open)}
        data-tooltip={label}
      >
        {icon}
      </button>
      {open && (
        <div className="mm-menu-dropdown">
          <div className="mm-menu-label">{label}</div>
          {options.map((o) => (
            <button
              key={o.value}
              className={`mm-menu-item ${o.value === value ? 'mm-menu-item--active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.icon && <span className="mm-menu-item-icon">{o.icon}</span>}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Fullscreen Modal ── */
const MermaidFullscreen = ({ code, theme, look, layout, direction, onTheme, onLook, onLayout, onDirection, onClose }) => {
  /* Lock scroll SYNCHRONOUSLY before paint — useLayoutEffect runs before the browser paints */
  useLayoutEffect(() => {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const scrollY = window.scrollY;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    // 強制保持原位置（防止 overflow:hidden 改變 scroll position）
    window.scrollTo(0, scrollY);
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      // 恢復原位置
      window.scrollTo(0, scrollY);
      window.removeEventListener('keydown', esc);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // mount/unmount only — onClose is stable via useCallback

  const [err, setErr] = useState(null);

  return ReactDOM.createPortal(
    <motion.div
      className="mm-fullscreen-overlay"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="mm-fullscreen-container"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      >
        {/* Fullscreen toolbar */}
        <div className="mm-fullscreen-toolbar">
          <div className="mm-toolbar-group">
            <ToolbarMenu icon={IconPalette} label="Theme" value={theme} options={MERMAID_THEMES} onChange={onTheme} />
            <ToolbarMenu icon={IconLook} label="Look" value={look} options={MERMAID_LOOKS} onChange={onLook} />
            <ToolbarMenu icon={IconLayout} label="Layout" value={layout} options={MERMAID_LAYOUTS} onChange={onLayout} />
            <ToolbarMenu icon={IconDirection} label="Direction" value={direction} options={MERMAID_DIRECTIONS} onChange={onDirection} />
          </div>
          <div className="mm-toolbar-right">
            <span className="mm-toolbar-hint">滾輪縮放 · 拖曳平移 · 雙擊還原</span>
            <button className="mm-close-btn" onClick={onClose} title="關閉 (Esc)">✕</button>
          </div>
        </div>
        {/* Canvas */}
        <div className="mm-fullscreen-canvas">
          <TransformWrapper
            initialScale={0.8}
            minScale={0.15}
            maxScale={6}
            centerOnInit
            limitToBounds={false}
            smooth
            wheel={{ step: 0.03, smoothStep: 0.003 }}
            doubleClick={{ mode: 'reset' }}
            panning={{ velocityDisabled: true }}
          >
            <TransformComponent
              wrapperStyle={{ width: '100%', height: '100%' }}
              contentStyle={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '3rem' }}
            >
              {err ? (
                <div className="mermaid-error"><span>⚠ {err}</span></div>
              ) : (
                <MermaidDiagram code={code} theme={theme} look={look} layout={layout} direction={direction} onError={setErr} />
              )}
            </TransformComponent>
          </TransformWrapper>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
};

/* ── MermaidBlock (main entry) ── */
const MermaidBlock = ({ code }) => {
  const [error, setError] = useState(null);
  const [hovered, setHovered] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const parsed = useMemo(() => parseMermaidFrontmatter(code), [code]);
  const initCfg = parsed.config.config || parsed.config;
  const initLayout = (typeof initCfg === 'object' ? initCfg.layout : null) || 'dagre';
  const initTheme = (typeof initCfg === 'object' ? initCfg.theme : null) || 'dark';
  const dirMatch = parsed.body.match(/(?:flowchart|graph)\s+(TB|BT|LR|RL)/);
  const initDir = dirMatch ? dirMatch[1] : 'TB';

  const [theme, setTheme] = useState(initTheme);
  const [look, setLook] = useState('classic');
  const [layout, setLayout] = useState(initLayout);
  const [direction, setDirection] = useState(initDir);

  /* Stable callbacks — 不會因 re-render 產生新參考，避免子元件 effect 被重新觸發 */
  const handleCloseFullscreen = useCallback(() => setFullscreen(false), []);
  const handleSetTheme = useCallback((v) => setTheme(v), []);
  const handleSetLook = useCallback((v) => setLook(v), []);
  const handleSetLayout = useCallback((v) => setLayout(v), []);
  const handleSetDirection = useCallback((v) => setDirection(v), []);

  if (error) {
    return (
      <div className="mermaid-error">
        <span>⚠ Mermaid 圖表解析失敗</span>
        <pre>{code}</pre>
      </div>
    );
  }

  return (
    <>
      <div
        className="mm-sandbox"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Toolbar bar */}
        <div className={`mm-toolbar ${hovered ? 'mm-toolbar--visible' : ''}`}>
          <div className="mm-toolbar-group">
            <ToolbarMenu icon={IconPalette} label="Theme" value={theme} options={MERMAID_THEMES} onChange={setTheme} />
            <ToolbarMenu icon={IconLook} label="Look" value={look} options={MERMAID_LOOKS} onChange={setLook} />
            <ToolbarMenu icon={IconLayout} label="Layout" value={layout} options={MERMAID_LAYOUTS} onChange={setLayout} />
            <ToolbarMenu icon={IconDirection} label="Direction" value={direction} options={MERMAID_DIRECTIONS} onChange={setDirection} />
          </div>
          <span className="mm-toolbar-hint">滾輪縮放 · 拖曳平移</span>
        </div>

        {/* Zoomable canvas */}
        <TransformWrapper
          initialScale={0.65}
          minScale={0.15}
          maxScale={5}
          centerOnInit
          limitToBounds={false}
          smooth
          wheel={{ step: 0.03, smoothStep: 0.003 }}
          doubleClick={{ mode: 'reset' }}
          panning={{ velocityDisabled: true }}
        >
          <TransformComponent
            wrapperStyle={{ width: '100%', height: '100%' }}
            contentStyle={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2rem' }}
          >
            <MermaidDiagram code={code} theme={theme} look={look} layout={layout} direction={direction} onError={setError} />
          </TransformComponent>
        </TransformWrapper>

        {/* Expand button */}
        <button className="mm-expand-btn" onClick={() => setFullscreen(true)} data-tooltip="放大檢視">
          {IconExpand}
        </button>
      </div>

      {/* Fullscreen portal */}
      <AnimatePresence>
        {fullscreen && (
          <MermaidFullscreen
            code={code}
            theme={theme} look={look} layout={layout} direction={direction}
            onTheme={handleSetTheme} onLook={handleSetLook} onLayout={handleSetLayout} onDirection={handleSetDirection}
            onClose={handleCloseFullscreen}
          />
        )}
      </AnimatePresence>
    </>
  );
};

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

      // Better descriptions for common GitHub deep links.
      if (parts.length >= 4 && parts[2] === 'issues') {
        return {
          type: 'github',
          icon: FaGithub,
          color: '#fff',
          label: 'GitHub Issue',
          desc: repo + '#' + parts[3],
        };
      }

      if (parts.length >= 4 && (parts[2] === 'pull' || parts[2] === 'pulls')) {
        return {
          type: 'github',
          icon: FaGithub,
          color: '#fff',
          label: 'GitHub PR',
          desc: repo + '#' + parts[3],
        };
      }

      return { type: 'github', icon: FaGithub, color: '#fff', label: 'GitHub', desc: repo };
    }
    if (host.includes('instagram.com')) return { type: 'instagram', icon: FaInstagram, color: '#E4405F', label: 'Instagram' };
    if (host.includes('threads.net')) return { type: 'threads', icon: FaExternalLinkAlt, color: '#fff', label: 'Threads' };

    // Spotify
    if (host.includes('spotify.com') || host.includes('open.spotify.com')) {
      // Extract Spotify embed URL
      const pathParts = u.pathname.split('/');
      let embedUrl = null;
      if (pathParts.includes('track') || pathParts.includes('album') || pathParts.includes('playlist') || pathParts.includes('episode')) {
        embedUrl = `https://open.spotify.com/embed${u.pathname}`;
      }
      return { type: 'spotify', icon: FaExternalLinkAlt, color: '#1DB954', label: 'Spotify', embedUrl };
    }

    // Bilibili
    if (host.includes('bilibili.com') || host.includes('b23.tv')) {
      let bvid = '';
      const bvMatch = u.pathname.match(/BV\w+/);
      if (bvMatch) bvid = bvMatch[0];
      return { type: 'bilibili', icon: FaExternalLinkAlt, color: '#00A1D6', label: 'Bilibili', bvid };
    }

    // Internal Blog Link Detection
    if (host.includes('koimsurai.com') && u.pathname.startsWith('/blog/')) {
      const id = u.pathname.split('/').pop();
      if (id && id !== 'blog') return { type: 'internal', id };
    }

    // Internal Web Link Detection (non-blog pages)
    if (host.includes('koimsurai.com')) {
      return { type: 'internal-page', icon: FaExternalLinkAlt, color: 'var(--post-accent)', label: '站內連結', path: u.pathname };
    }

    return { type: 'generic', icon: FaExternalLinkAlt, color: 'var(--post-muted)', label: host };
  } catch { return null; }
};

/* ══════════════════════════
   InternalLinkCard — fetch and show preview
   ══════════════════════════ */
const InternalLinkCard = ({ id }) => {
  const [post, setPost] = useState(null);

  useEffect(() => {
    fetch(`/api/posts/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.message === 'success') setPost(data);
      })
      .catch(() => { });
  }, [id]);

  if (!post) return <a href={`/blog/${id}`} target="_blank" rel="noopener noreferrer">/blog/{id}</a>;

  return (
    <Link to={`/blog/${id}`} className="link-card link-card-internal">
      <div className="link-card-body">
        <div className="link-card-site">
          <span style={{ fontSize: '1rem', color: 'var(--post-accent)' }}>✦</span>
          <span>站內文章</span>
        </div>
        <div className="link-card-title">{post.title}</div>
        <div className="link-card-meta">
          <span>{new Date(post.created_at).getFullYear()}</span>
          {post.category && <> · <span>{post.category}</span></>}
        </div>
      </div>
    </Link>
  );
};

/* ══════════════════════════
   LinkCard — rich link preview
   ══════════════════════════ */
const LinkCard = ({ href }) => {
  const meta = getLinkMeta(href);
  if (!meta) return <a href={href} target="_blank" rel="noopener noreferrer">{href}</a>;

  if (meta.type === 'internal') {
    return <InternalLinkCard id={meta.id} />;
  }

  // Spotify embed
  if (meta.type === 'spotify' && meta.embedUrl) {
    return (
      <div className="link-card link-card-spotify">
        <iframe
          src={meta.embedUrl + '?theme=0'}
          width="100%"
          height="152"
          frameBorder="0"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          className="rounded-lg"
          style={{ border: 'none' }}
        />
      </div>
    );
  }

  // Bilibili embed
  if (meta.type === 'bilibili' && meta.bvid) {
    return (
      <div className="link-card link-card-bilibili">
        <div className="link-card-embed-wrapper">
          <iframe
            src={`https://player.bilibili.com/player.html?bvid=${meta.bvid}&high_quality=1&danmaku=0`}
            scrolling="no"
            frameBorder="0"
            allowFullScreen
            loading="lazy"
            className="link-card-bilibili-iframe"
            style={{ border: 'none' }}
          />
        </div>
        <a href={href} target="_blank" rel="noopener noreferrer" className="link-card-embed-link">
          <span style={{ color: '#00A1D6' }}>▶</span> 在 Bilibili 觀看
        </a>
      </div>
    );
  }

  // Internal web page link
  if (meta.type === 'internal-page') {
    return (
      <Link to={meta.path} className="link-card link-card-internal">
        <div className="link-card-body">
          <div className="link-card-site">
            <span style={{ fontSize: '1rem', color: 'var(--post-accent)' }}>✦</span>
            <span>{meta.label}</span>
          </div>
          <div className="link-card-url">{meta.path}</div>
        </div>
      </Link>
    );
  }

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

  // 自動偵測 mermaid 圖表：有 language tag 或內容以 mermaid 關鍵字開頭
  const isMermaid = lang === 'mermaid' || (
    !inline && (lang === 'text' || !match) &&
    /^(---|graph\s|flowchart\s|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|sankey)/m.test(codeText.trim())
  );
  if (!inline && isMermaid) {
    return <MermaidBlock code={codeText} />;
  }

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

  const extractFirstUrlFromText = (text) => {
    if (!text) return null;
    // Capture URL while trimming common trailing wrappers like ")" or "]".
    const match = text.match(/https?:\/\/[^\s<>)\]]+/i);
    return match ? match[0] : null;
  };

  // 遞迴取得所有子文字內容
  const getText = (node) => {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(getText).join('');
    if (node?.props?.children) return getText(node.props.children);
    return '';
  };

  // 從 children 中找出所有 <a> 元素
  const findLinks = (arr) => {
    const links = [];
    arr.forEach(child => {
      if (child?.props?.href) links.push(child);
    });
    return links;
  };

  // 可嵌入的連結類型
  const isEmbeddableLink = (href) => {
    try {
      const u = new URL(href);
      const host = u.hostname.replace('www.', '');
      return host.includes('youtube.com') || host.includes('youtu.be') ||
        host.includes('bilibili.com') || host.includes('b23.tv') ||
        host.includes('spotify.com') ||
        host.includes('koimsurai.com');
    } catch { return false; }
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
    if (child?.props?.href) {
      const href = child.props.href;
      const text = getText(child.props.children).trim();
      // Allow cards for embeddable links even when markdown link text is custom.
      if (isEmbeddableLink(href) || text === href || text === '' || href.includes(text) || text.includes(href)) {
        return <LinkCard href={href} />;
      }
    }
  }

  // 多子元素 — 檢查是否包含可嵌入的連結（如「【標題】 url」格式）
  if (childArray.length >= 2) {
    const links = findLinks(childArray);
    const embeddableLink = links.find(link => isEmbeddableLink(link.props.href));

    if (embeddableLink) {
      const href = embeddableLink.props.href;
      // 取得非連結部分的文字
      const textParts = childArray.filter(c => c !== embeddableLink);
      const hasText = textParts.some(c => {
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
   CategoryTooltipTrigger — hover 顯示分類 tooltip (Portal 到 body)
   ══════════════════════════ */
const CategoryTooltipTrigger = ({ postCategory, categoryInfo, showTooltip, onEnter, onLeave, linkClassName, compact = false }) => {
  const triggerRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (showTooltip && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
      });
    }
  }, [showTooltip]);

  return (
    <span
      ref={triggerRef}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ display: 'inline-block' }}
    >
      <Link
        to={'/blog?category=' + encodeURIComponent(postCategory)}
        className={linkClassName || 'text-sm text-white hover:text-purple-400 transition-colors font-semibold'}
      >
        {postCategory}
      </Link>
      {showTooltip && categoryInfo && ReactDOM.createPortal(
        <div
          className={compact ? 'category-tooltip category-tooltip-compact' : 'category-tooltip'}
          style={{ position: 'absolute', top: pos.top, left: pos.left }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
        >
          {categoryInfo.short_description && (
            <p className="category-tooltip-short">{categoryInfo.short_description}</p>
          )}
          {!compact && categoryInfo.description && (
            <p className="category-tooltip-desc">{categoryInfo.description}</p>
          )}
          {!compact && (
            <div className="category-tooltip-meta">
              {categoryInfo.post_count != null && (
                <span>共 {categoryInfo.post_count} 篇文章</span>
              )}
              {categoryInfo.updated_at && (
                <span>最近更新 {new Date(categoryInfo.updated_at).toLocaleDateString('zh-TW')}</span>
              )}
            </div>
          )}
        </div>,
        document.body
      )}
    </span>
  );
};

/* ══════════════════════════
   PostsNav — Left sidebar showing OTHER article titles (-style)
   ══════════════════════════ */
const PostsNav = React.memo(({ currentId, postTitle, postCategory }) => {
  const [nearbyPosts, setNearbyPosts] = useState([]);
  const [categoryPosts, setCategoryPosts] = useState([]);
  const [categoryInfo, setCategoryInfo] = useState(null);
  const [showCategoryTooltip, setShowCategoryTooltip] = useState(false);

  // 取得分類詳情
  useEffect(() => {
    if (!postCategory) return;
    fetch('/api/categories')
      .then(r => r.json())
      .then(data => {
        const cats = data.categories || [];
        const found = cats.find(c => c.name === postCategory);
        if (found) setCategoryInfo(found);
      })
      .catch(console.error);
  }, [postCategory]);

  useEffect(() => {
    fetch('/api/posts?limit=100')
      .then((r) => r.json())
      .then((data) => {
        const posts = Array.isArray(data) ? data : (data.posts || []);
        if (!posts.length) return;

        // 按時間排序（最新在前）
        const sorted = [...posts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // 找到當前文章的索引位置
        const currentIndex = sorted.findIndex(p => String(p.id) === String(currentId));
        if (currentIndex === -1) return;

        // 計算顯示範圍
        // 最新文章 → 往前 5 篇 (含自身 = 6)
        // 第2新 → 含最新 + 往前取，總共 7 篇
        // 第3新及之後 → 以當前為中心前後各取，總共 9 篇
        let start, end;
        if (currentIndex === 0) {
          // 最新文章
          start = 0;
          end = Math.min(sorted.length, 6);
        } else if (currentIndex === 1) {
          // 第2新
          start = 0;
          end = Math.min(sorted.length, 7);
        } else {
          // 第3新及之後：以當前為中心，前後各4篇
          const half = 4;
          start = Math.max(0, currentIndex - half);
          end = Math.min(sorted.length, currentIndex + half + 1);
          // 如果上方不滿 4 篇，從下方補
          if (currentIndex - start < half) {
            end = Math.min(sorted.length, end + (half - (currentIndex - start)));
          }
          // 如果下方不滿 4 篇，從上方補
          if (end - currentIndex - 1 < half) {
            start = Math.max(0, start - (half - (end - currentIndex - 1)));
          }
        }

        setNearbyPosts(sorted.slice(start, end));

        // 篩選同分類文章
        if (postCategory) {
          const sameCategory = sorted
            .filter(p => p.category === postCategory && String(p.id) !== String(currentId))
            .slice(0, 5);
          setCategoryPosts(sameCategory);
        }
      })
      .catch(console.error);
  }, [currentId, postCategory]);

  return (
    <nav className="posts-nav">
      {/* 附近文章列表 */}
      {nearbyPosts.length > 0 && (
        <div className="posts-nav-nearby">
          {nearbyPosts.map((p) => {
            const isCurrent = String(p.id) === String(currentId);
            return (
              <Link
                key={p.id}
                to={'/blog/' + p.id}
                className={'posts-nav-item text-sm py-1 block transition-colors truncate' + (isCurrent ? ' text-white font-semibold posts-nav-current-item' : ' text-gray-500 hover:text-gray-300')}
                title={p.title}
              >
                {p.title}
              </Link>
            );
          })}
        </div>
      )}

      {/* 此文章收錄於分類 */}
      {postCategory && (
        <div className="posts-nav-category mt-6 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', position: 'relative' }}>
          <span className="text-xs text-gray-600 block mb-1">此文章收錄於專欄：</span>
          <CategoryTooltipTrigger
            postCategory={postCategory}
            categoryInfo={categoryInfo}
            showTooltip={showCategoryTooltip}
            onEnter={() => setShowCategoryTooltip(true)}
            onLeave={() => setShowCategoryTooltip(false)}
          />
        </div>
      )}

      {/* 此專欄其他文章 */}
      {categoryPosts.length > 0 && (
        <div className="posts-nav-list mt-4">
          <span className="text-xs text-gray-600 block mb-2">此專欄的其他文章：</span>
          <div className="flex flex-col gap-1">
            {categoryPosts.map((p) => (
              <Link key={p.id} to={'/blog/' + p.id} className="posts-nav-item text-sm text-gray-500 hover:text-gray-300 transition-colors py-0.5 block truncate" title={p.title}>
                {p.title}
              </Link>
            ))}
          </div>
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
   Toast — 短暫提示
   ═══════════════════════════════════ */
const Toast = ({ message, onDone }) => {
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

/* ═══════════════════════════════════
   LanguageSwitcher — 文章語言切換下拉
   ═══════════════════════════════════ */
const LANG_OPTIONS = [
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en',    label: 'English' },
  { code: 'ja',    label: '日本語' },
];

const LanguageSwitcher = ({ open, setOpen, current, source, available, onSelect, onUnavailable }) => {
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, minWidth: 160 });

  // 外點關閉 + ESC 關閉
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && wrapRef.current.contains(e.target)) return;
      const menu = document.getElementById('blog-lang-menu');
      if (menu && menu.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  // 計算菜單位置（以觸發按鈕為錨點，portal 到 body 避開父層 stacking context）
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const compute = () => {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + window.scrollY + 6,
        left: rect.left + window.scrollX,
        minWidth: Math.max(160, rect.width),
      });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [open]);

  const currentLabel = LANG_OPTIONS.find(o => o.code === current)?.label || current;

  return (
    <span className="meta-lang-switcher" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="lang-trigger"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="lang-icon">🌐</span>
        <span className="lang-code">{currentLabel}</span>
        <span className={`lang-caret ${open ? 'open' : ''}`}>▾</span>
      </button>
      {open && ReactDOM.createPortal(
        <div
          id="blog-lang-menu"
          className="lang-menu"
          role="listbox"
          style={{ position: 'absolute', top: menuPos.top, left: menuPos.left, minWidth: menuPos.minWidth }}
        >
          {LANG_OPTIONS.map(opt => {
            const isSource = opt.code === source;
            const isAvailable = available.includes(opt.code);
            return (
              <button
                key={opt.code}
                type="button"
                role="option"
                aria-selected={opt.code === current}
                className={`lang-item ${isAvailable ? '' : 'disabled'} ${opt.code === current ? 'active' : ''}`}
                onClick={() => {
                  setOpen(false);
                  if (!isAvailable) { onUnavailable(opt.label); return; }
                  if (opt.code === current) return;
                  onSelect(opt.code);
                }}
              >
                <span>{opt.label}</span>
                {isSource && <span className="lang-badge">原文</span>}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </span>
  );
};

/* URL prefix mapping — 必須與後端 LOCALE_URL_PREFIX 一致 */
const LOCALE_URL_PREFIX = { 'zh-TW': '', 'zh-CN': '/zh-cn', 'en': '/en', 'ja': '/ja' };
const LOCALE_TO_DATE_LOCALE = { 'zh-TW': 'zh-TW', 'zh-CN': 'zh-CN', 'en': 'en-US', 'ja': 'ja-JP' };

function parseLocaleFromPath(pathname) {
  if (pathname.startsWith('/en/blog/')) return 'en';
  if (pathname.startsWith('/zh-cn/blog/')) return 'zh-CN';
  if (pathname.startsWith('/ja/blog/')) return 'ja';
  return 'zh-TW';
}

function postPathForLocale(id, locale, sourceLang) {
  // 原文永遠走不帶 prefix 的規範路徑（與後端 postUrlForLocale 一致）
  if (locale === sourceLang) return `/blog/${id}`;
  return `${LOCALE_URL_PREFIX[locale] || ''}/blog/${id}`;
}

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
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [metaCategoryInfo, setMetaCategoryInfo] = useState(null);
  const [showMetaCatTooltip, setShowMetaCatTooltip] = useState(false);
  const [currentFont, setCurrentFont] = useState(() => localStorage.getItem('blogFont') || 'noto-serif');
  const contentRef = useRef(null);
  const tocRef = useRef(null);
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const pathLocale = useMemo(() => parseLocaleFromPath(location.pathname), [location.pathname]);

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
    // 切換文章時不顯示全白 loading，保留舊內容做平滑過渡
    if (!post) setLoading(true);
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    fetch(`/api/posts/${id}?lang=${encodeURIComponent(pathLocale)}`)
      .then((r) => {
        if (r.status === 404) throw new Error('LOCALE_NOT_AVAILABLE');
        if (!r.ok) throw new Error('Post not found');
        return r.json();
      })
      .then((data) => {
        if (data.message === 'success') {
          const dateLocale = LOCALE_TO_DATE_LOCALE[data.locale] || 'zh-TW';
          setPost({
            ...data,
            date: new Date(data.created_at).toLocaleDateString(dateLocale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }),
          });
          setLiked(false);
          fetch('/api/posts/' + id + '/view', { method: 'POST' }).catch(console.error);
        } else { throw new Error('Post not found'); }
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [id, pathLocale]);

  /* ── Like state ── */
  useEffect(() => {
    if (!post) return;
    const stored = JSON.parse(localStorage.getItem('likedPosts') || '[]');
    const pid = post.id || parseInt(id);
    if (stored.includes(pid)) setLiked(true);
    setLikeCount(post.likes || 0);
  }, [post, id]);

  /* ── Category (專欄) info for meta-row hover tooltip ── */
  useEffect(() => {
    if (!post?.category) { setMetaCategoryInfo(null); return; }
    fetch('/api/categories')
      .then(r => r.json())
      .then(data => {
        const cats = data.categories || [];
        const found = cats.find(c => c.name === post.category);
        setMetaCategoryInfo(found || null);
      })
      .catch(console.error);
  }, [post?.category]);

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

  const [showShareMenu, setShowShareMenu] = useState(false);

  /* ── Share handlers ── */
  const shareUrl = window.location.origin + '/blog/' + id;
  const shareTitle = post?.title || '';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setShowShareMenu(false);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleShareTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareTitle)}`, '_blank', 'noopener,noreferrer,width=550,height=420');
    setShowShareMenu(false);
  };

  const handleShareFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank', 'noopener,noreferrer,width=550,height=420');
    setShowShareMenu(false);
  };

  const handleNativeShare = () => {
    if (navigator.share) {
      navigator.share({ title: shareTitle, url: shareUrl }).catch(() => {});
    } else {
      handleCopyLink();
    }
    setShowShareMenu(false);
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
    const isLocaleMissing = error === 'LOCALE_NOT_AVAILABLE';
    return (
      <div className="blog-post-container error">
        <div className="blog-post-dim-overlay" />
        <div className="error-content">
          <div className="error-icon">🌐</div>
          <h1>{isLocaleMissing ? '此語言版本尚未提供' : '文章航線丟失'}</h1>
          <p>{isLocaleMissing ? '您請求的語言目前還沒有翻譯版本，可以前往原文頁面閱讀。' : '抱歉，我們在宇宙中找不到您要找的文章。'}</p>
          {isLocaleMissing ? (
            <Link to={`/blog/${id}`} className="back-to-blog-link">前往原文 →</Link>
          ) : (
            <Link to="/blog" className="back-to-blog-link">‹ 返回手記</Link>
          )}
        </div>
      </div>
    );
  }

  /* ════════ Main Render ════════ */
  const seoDescription = post.excerpt || post.content?.substring(0, 160).replace(/<[^>]+>/g, '').replace(/[#*`>\-\n]/g, '').trim();
  const postTags = Array.isArray(post.tags) ? post.tags : (post.tags ? post.tags.split(',') : []);
  const sourceLang = post.source_language || 'zh-TW';
  const availableLocales = post.available_locales || [sourceLang];
  const currentLocale = post.locale || pathLocale;
  const selfPath = postPathForLocale(id, currentLocale, sourceLang);
  const alternates = availableLocales.map(loc => ({
    locale: loc,
    path: postPathForLocale(id, loc, sourceLang),
  }));
  const xDefaultPath = postPathForLocale(id, sourceLang, sourceLang);

  return (
    <div className="blog-post-container" style={{ fontFamily }}>
      <SEOHead
        title={post.title}
        description={seoDescription}
        path={selfPath}
        image={'/og-image/' + id}
        type="article"
        locale={currentLocale}
        alternates={alternates}
        xDefaultPath={xDefaultPath}
        article={{
          author: post.author || 'Koimsurai',
          datePublished: post.created_at,
          dateModified: post.updated_at || post.created_at,
          tags: postTags,
        }}
      />

      {/* Dim overlay over global starfield */}
      <div className="blog-post-dim-overlay" />

      {/* Reading Progress */}
      <div className="reading-progress-bar">
        <div className="reading-progress-fill" style={{ width: readingProgress + '%' }} />
      </div>

      {/* Toast */}
      {toastMsg && (
        <Toast key={toastMsg} message={toastMsg} onDone={() => setToastMsg('')} />
      )}

      {/* ── Header ── */}
      <AnimatePresence mode="wait">
        <motion.header
          key={'header-' + id}
          className="post-header"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        >
          <h1 className="post-title">{post.title}</h1>

          <div className="post-meta-row">
            {post.layout_type !== 'column' && (
              <>
                <span className="meta-tip" data-tooltip="發布日期">⏱ {post.date}</span>
                <span className="meta-sep">·</span>
              </>
            )}
            <span className="meta-tip meta-author" data-tooltip="作者">✦ {post.author}</span>
            <span className="meta-sep">·</span>
            <span className="meta-tip" data-tooltip="累計閱讀次數">📖 {post.view_count || 0}</span>
            <span className="meta-sep">·</span>
            <span className="meta-tip" data-tooltip="讀者喜歡數">❤️ {likeCount}</span>
            <span className="meta-sep">·</span>
            <span className="meta-tip" data-tooltip="預估閱讀時間">☕ 約 {readTime} 分鐘</span>
            {post.category && (
              <>
                <span className="meta-sep">·</span>
                <span
                  className="meta-category-wrap"
                  onMouseEnter={() => setShowMetaCatTooltip(true)}
                  onMouseLeave={() => setShowMetaCatTooltip(false)}
                >
                  <CategoryTooltipTrigger
                    postCategory={post.category}
                    categoryInfo={metaCategoryInfo}
                    showTooltip={showMetaCatTooltip}
                    onEnter={() => setShowMetaCatTooltip(true)}
                    onLeave={() => setShowMetaCatTooltip(false)}
                    linkClassName="meta-category meta-category-link"
                    compact
                  />
                </span>
              </>
            )}
            <span className="meta-sep">·</span>
            <LanguageSwitcher
              open={langMenuOpen}
              setOpen={setLangMenuOpen}
              current={currentLocale}
              source={sourceLang}
              available={availableLocales}
              onSelect={(loc) => {
                const target = postPathForLocale(id, loc, sourceLang);
                navigate(target);
              }}
              onUnavailable={(name) => setToastMsg(`「${name}」版本尚未提供`)}
            />
          </div>

          {post.tags && post.tags.length > 0 && (
            <div className="post-tags">
              {post.tags.map((tag) => {
                const name = typeof tag === 'string' ? tag : (tag.name || tag);
                return <span key={name} className="tag">#{name}</span>;
              })}
            </div>
          )}
        </motion.header>
      </AnimatePresence>

      {/* ── Content body: left sidebar + center + right sidebar ── */}
      <div className="post-body">
        {/* Left sidebar — other article titles */}
        <aside className="post-sidebar-left">
          <PostsNav currentId={id} postTitle={post.title} postCategory={post.category} />
        </aside>

        <AnimatePresence mode="wait">
          <motion.div
            key={'content-' + id}
            className="post-main-column"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1], delay: 0.05 }}
          >
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
                  components={{
                    code: CodeBlock,
                    p: CustomParagraph,
                    img: ({ src, alt, ...rest }) => <BlogImage src={src} alt={alt} {...rest} />,
                    ...headingComponents,
                  }}
                >
                  {post.content}
                </ReactMarkdown>
              </article>
              <SignatureSVG className="blog-signature" />
            </div>

            {/* ── Comments ── */}
            <div className="post-extras" id="comments">
              <Comments postId={id} />
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Right sidebar — TOC */}
        <AnimatePresence mode="wait">
          {headings.length > 0 && (
            <motion.aside
              key={'toc-' + id}
              className="post-sidebar-right"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1], delay: 0.1 }}
            >
              <TableOfContents headings={headings} activeHeading={activeHeading} readingProgress={readingProgress} tocRef={tocRef} />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* ── Floating side actions (right) ── */}
      <div className="floating-actions">
        <button className={'float-btn' + (liked ? ' active' : '')} onClick={handleLike} title="讚">
          {liked ? <FaHeart /> : <FaRegHeart />}
          {likeCount > 0 && <span>{likeCount}</span>}
        </button>
        <div className="float-btn-wrapper">
          <button
            className={'float-btn' + (copied ? ' shared' : '')}
            onClick={() => setShowShareMenu(!showShareMenu)}
            title="分享"
          >
            <FaShareAlt />
          </button>
          <AnimatePresence>
            {showShareMenu && (
              <motion.div
                className="share-menu"
                initial={{ opacity: 0, x: 10, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
              >
                <button onClick={handleShareTwitter}><FaTwitter /> Twitter</button>
                <button onClick={handleShareFacebook}><FaFacebook /> Facebook</button>
                <button onClick={handleCopyLink}><FaLink /> {copied ? '已複製!' : '複製連結'}</button>
                {navigator.share && (
                  <button onClick={handleNativeShare}><FaShareAlt /> 更多...</button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
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
