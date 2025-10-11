import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter/dist/esm';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { motion } from 'framer-motion';
import Comments from './Comments';
import Newsletter from './Newsletter';
import MeteorShower from './MeteorShower';
import './BlogPost.css';

// --- Slugify utility ---
const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w\-\u4e00-\u9fa5]+/g, '') // Allow CJK characters
    .replace(/--+/g, '-'); // Replace multiple - with single -
};

// --- CodeBlock Component for Syntax Highlighting ---
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
          margin: 0,
          padding: '2rem',
          background: 'transparent',
          fontSize: '0.95rem',
          lineHeight: '1.6'
        }}
        codeTagProps={{
          style: {
            background: 'none',
            padding: 0,
            fontFamily: "'Fira Code', 'JetBrains Mono', 'SF Mono', monospace"
          }
        }}
        {...props}
      >
        {codeText}
      </SyntaxHighlighter>
    </div>
  ) : (
    <code className={className} {...props}>
      {children}
    </code>
  );
};

// --- 文章目錄導航組件 ---
const TableOfContents = React.memo(({ headings, activeHeading, readingProgress, tocRef }) => {
  const scrollToHeading = React.useCallback((headingId) => {
    // 使用 setTimeout 確保 DOM 完全渲染
    setTimeout(() => {
      // 嘗試多種方式找到元素
      const element = document.getElementById(headingId) ||
                      document.querySelector(`[id="${headingId}"]`) ||
                      document.querySelector(`h1[id="${headingId}"], h2[id="${headingId}"], h3[id="${headingId}"], h4[id="${headingId}"]`);  
      
      if (!element) return;

      const headerOffset = 120;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;
      
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }, 100);
  }, []);  return (
    <div className="table-of-contents">
      <div className="toc-header">
        <h3>文章目錄</h3>
        <div className="reading-progress-circle">
          <svg viewBox="0 0 36 36">
            <path
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="rgba(255, 255, 255, 0.1)"
              strokeWidth="3"
            />
            <path
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="#38b2ac"
              strokeWidth="3"
              strokeDasharray={`${readingProgress}, 100`}
            />
          </svg>
          <span className="progress-text">{Math.round(readingProgress)}%</span>
        </div>
      </div>
      <nav className="toc-nav" ref={tocRef}>
        {headings.map((heading) => (
          <button
            key={heading.id}
            data-heading-id={heading.id}
            className={`toc-item level-${heading.level} ${activeHeading === heading.id ? 'active' : ''}`}
            onClick={() => scrollToHeading(heading.id)}
            title={heading.text}
          >
            <span className="toc-bullet">•</span>
            <span className="toc-text">{heading.text}</span>
          </button>
        ))}
      </nav>
    </div>
  );
});

function BlogPost() {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [readingProgress, setReadingProgress] = useState(0);
  const [headings, setHeadings] = useState([]);
  const [activeHeading, setActiveHeading] = useState('');
  const contentRef = useRef(null);
  const tocRef = useRef(null);
  const { id } = useParams();

  // 創建標題組件
  const createHeading = useCallback((level) => {
    return ({ children, ...props }) => {
      const HeadingTag = `h${level}`;
      const text = React.Children.toArray(children).join('');
      const id = slugify(text);
      return React.createElement(HeadingTag, { id, ...props }, children);
    };
  }, []);
  
  const headingComponents = useMemo(() => ({
    h1: createHeading(1),
    h2: createHeading(2),
    h3: createHeading(3),
    h4: createHeading(4)
  }), [createHeading]);

  useEffect(() => {
    setLoading(true);
    // Fetch post data
    fetch(`/api/posts/${id}`)
      .then(res => {
        if (!res.ok) throw new Error('Post not found');
        return res.json();
      })
      .then(data => {
        if (data.message === 'success') {
          setPost({
            ...data,
            date: new Date(data.created_at).toLocaleDateString('zh-TW', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
          });
          
          // Increment view count
          fetch(`/api/posts/${id}/view`, {
            method: 'POST',
          }).catch(err => console.error('Failed to increment view count:', err));
        } else {
          throw new Error('Post not found');
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  // 從 Markdown 內容提取標題
  useEffect(() => {
    if (!post?.content) return;

    // First, remove code blocks to avoid capturing comments as headings
    const contentWithoutCodeBlocks = post.content.replace(/```[\s\S]*?```/g, '');

    const headingRegex = /^(#{1,4})\s+(.+)$/gm;
    const matches = [];
    let match;

    while ((match = headingRegex.exec(contentWithoutCodeBlocks)) !== null) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = slugify(text);
      matches.push({ id, text, level });
    }

    setHeadings(matches);
  }, [post?.content]);

  // 處理滾動進度和活動標題
  useEffect(() => {
    if (!post) return;

    let debounceTimer = null;
    let lastActiveHeading = activeHeading;

    const handleScroll = () => {
      // 計算閱讀進度
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollableHeight = documentHeight - windowHeight;
      
      if (scrollableHeight > 0) {
        const progress = (scrollTop / scrollableHeight) * 100;
        const clampedProgress = Math.min(100, Math.max(0, progress));
        setReadingProgress(clampedProgress);
      } else {
        setReadingProgress(0);
      }

      // 防抖處理標題檢測，避免閃爍
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        // 檢測當前可見的標題
        if (contentRef.current && headings.length > 0) {
          const headingElements = contentRef.current.querySelectorAll('[id^="heading-"]');
          let currentHeading = '';
          let minDistance = Infinity;
          
          headingElements.forEach((heading) => {
            const rect = heading.getBoundingClientRect();
            // 標題在視窗上半部分時
            if (rect.top <= 200 && rect.top >= -100) {
              const distance = Math.abs(rect.top - 100);
              if (distance < minDistance) {
                minDistance = distance;
                currentHeading = heading.id;
              }
            }
          });
          
          // 如果沒有找到，選擇第一個在視窗內的
          if (!currentHeading && headingElements.length > 0) {
            for (let i = 0; i < headingElements.length; i++) {
              const rect = headingElements[i].getBoundingClientRect();
              if (rect.top > 0 && rect.top < windowHeight) {
                currentHeading = headingElements[i].id;
                break;
              }
            }
          }
          
          // 只在標題真正改變時才更新
          if (currentHeading && currentHeading !== lastActiveHeading) {
            lastActiveHeading = currentHeading;
            setActiveHeading(currentHeading);
            
            // 自動滾動目錄到當前項目（不使用smooth避免干擾）
            if (tocRef.current) {
              const activeItem = tocRef.current.querySelector(`[data-heading-id="${currentHeading}"]`);
              if (activeItem) {
                activeItem.scrollIntoView({ 
                  behavior: 'auto', 
                  block: 'nearest'
                });
              }
            }
          }
        }
      }, 200); // 增加到 200ms 防抖延遲
    };

    // 使用 requestAnimationFrame 優化性能
    let ticking = false;
    const scrollListener = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', scrollListener, { passive: true });
    // 延遲初始調用，確保內容已渲染
    const initTimer = setTimeout(handleScroll, 500);
    
    return () => {
      window.removeEventListener('scroll', scrollListener);
      if (debounceTimer) clearTimeout(debounceTimer);
      clearTimeout(initTimer);
    };
  }, [post, headings]);

  if (loading) {
    return (
      <div className="blog-post-container loading">
        <MeteorShower />
        <motion.div 
          className="loading-indicator"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="cosmic-loader">
            <div className="planet"></div>
            <div className="orbit"></div>
          </div>
          <p>正在從星際載入文章...</p>
        </motion.div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="blog-post-container error">
        <MeteorShower />
        <motion.div 
          className="error-content"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="error-icon">🚀</div>
          <h1>文章航線丟失</h1>
          <p>抱歉，我們在宇宙中找不到您要找的文章。</p>
          <Link to="/blog" className="back-to-blog-link">‹ 返回部落格星系</Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="blog-post-container">
      <MeteorShower />
      
      {/* Reading Progress Bar */}
      <div className="reading-progress-bar">
        <motion.div 
          className="reading-progress-fill"
          style={{ width: `${readingProgress}%` }}
          initial={{ width: 0 }}
          animate={{ width: `${readingProgress}%` }}
          transition={{ duration: 0.2 }}
        />
      </div>
      
      <motion.header 
        className="post-header-redesigned"
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        <div className="header-content">
          <motion.div 
            className="post-meta-info"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <span className="post-date">{post.date}</span>
            {post.tags && post.tags.length > 0 && (
              <span className="meta-divider">|</span>
            )}
            <div className="post-tags">
              {post.tags?.map((tag, index) => {
                const tagName = typeof tag === 'string' ? tag : (tag.name || tag.label || tag);
                return (
                  <motion.span 
                    key={tagName} 
                    className="tag"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, delay: 0.6 + index * 0.1 }}
                  >
                    {tagName}
                  </motion.span>
                );
              })}
            </div>
          </motion.div>
          <motion.h1 
            className="post-title-redesigned"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            {post.title}
          </motion.h1>
          <motion.p 
            className="post-author"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            由 {post.author} 發佈
          </motion.p>
        </div>
      </motion.header>
      
      <motion.main 
        className="post-main-content"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.4 }}
      >
        <div className="post-content-wrapper">
          <div className="post-content" ref={contentRef}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={{
                code: CodeBlock,
                ...headingComponents
              }}
            >
              {post.content}
            </ReactMarkdown>
          </div>
        </div>

        {/* 文章目錄側邊欄 */}
        {headings.length > 0 && (
          <motion.aside
            className="post-sidebar"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
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
        
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.8 }}
      >
        <Newsletter />
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.9 }}
      >
        <Comments postId={id} />
      </motion.div>
      
      <motion.footer 
        className="post-footer"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.9 }}
      >
        <Link to="/blog" className="back-to-blog-link">
          <span className="back-icon">‹</span>
          返回部落格星系
        </Link>
      </motion.footer>
    </div>
  );
}

export default BlogPost;
