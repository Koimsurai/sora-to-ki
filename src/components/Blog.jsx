import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FaRegHeart, FaHeart, FaRegComment, FaShareAlt, FaRegEye, FaSearch, FaTimes, FaChevronDown } from 'react-icons/fa';
import SEOHead from './SEOHead';
import './Blog.css';

/* ════════════════════════════════════════════════
   動畫 variants
   ════════════════════════════════════════════════ */
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.06, ease: 'easeOut' },
  }),
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

/* ════════════════════════════════════════════════
   NoteCard —  風格文章卡片
   ════════════════════════════════════════════════ */
const NoteCard = React.memo(({ post, index }) => {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likes || 0);

  useEffect(() => {
    const likedPosts = JSON.parse(localStorage.getItem('likedPosts') || '[]');
    if (likedPosts.includes(post.id)) setLiked(true);
  }, [post.id]);

  const handleLike = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const newState = !liked;
    try {
      const endpoint = newState ? 'like' : 'unlike';
      const res = await fetch(`/api/posts/${post.id}/${endpoint}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setLiked(newState);
        setLikeCount(data.likes);
        const stored = JSON.parse(localStorage.getItem('likedPosts') || '[]');
        if (newState) {
          if (!stored.includes(post.id)) localStorage.setItem('likedPosts', JSON.stringify([...stored, post.id]));
        } else {
          localStorage.setItem('likedPosts', JSON.stringify(stored.filter(id => id !== post.id)));
        }
      }
    } catch (err) {
      console.error('Like failed:', err);
    }
  };

  const handleShare = (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(`${window.location.origin}/blog/${post.id}`);
  };

  const excerpt = post.excerpt || post.content?.substring(0, 220).replace(/<[^>]+>/g, '').replace(/[#*`>\-]/g, '') + '...';
  const dateObj = new Date(post.created_at);
  const dayStr = dateObj.getDate();
  const monthStr = dateObj.toLocaleDateString('zh-TW', { month: 'short' });
  const fullDate = dateObj.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <motion.article
      className="note-card"
      custom={index}
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      layout
    >
      {/* 日期指示器 */}
      <div className="note-date-indicator">
        <span className="note-day">{dayStr}</span>
        <span className="note-month">{monthStr}</span>
      </div>

      <div className="note-body">
        {/* 頂部 meta */}
        <div className="note-meta-top">
          <span className="note-full-date">{fullDate}</span>
          {post.category && <span className="note-category">{post.category}</span>}
        </div>

        {/* 標題 */}
        <Link to={`/blog/${post.id}`} className="note-title-link">
          <h2 className="note-title">{post.title}</h2>
        </Link>

        {/* 摘要 */}
        <p className="note-excerpt">{excerpt}</p>

        {/* 標籤 */}
        {post.tags && post.tags.length > 0 && (
          <div className="note-tags">
            {(Array.isArray(post.tags) ? post.tags : post.tags.split(',')).slice(0, 4).map((tag, i) => {
              const name = typeof tag === 'string' ? tag : (tag.name || tag);
              return <span key={i} className="note-tag">#{name}</span>;
            })}
          </div>
        )}

        {/* 底部互動列 */}
        <div className="note-actions">
          <button className={`note-action-btn ${liked ? 'liked' : ''}`} onClick={handleLike}>
            {liked ? <FaHeart /> : <FaRegHeart />}
            <span>{likeCount > 0 ? likeCount : ''}</span>
          </button>
          <Link to={`/blog/${post.id}#comments`} className="note-action-btn" onClick={(e) => e.stopPropagation()}>
            <FaRegComment />
            <span>留言</span>
          </Link>
          <button className="note-action-btn" onClick={handleShare}>
            <FaShareAlt />
            <span>分享</span>
          </button>
          {post.view_count > 0 && (
            <span className="note-views">
              <FaRegEye />
              {post.view_count}
            </span>
          )}
        </div>
      </div>
    </motion.article>
  );
});

/* ════════════════════════════════════════════════
   Blog 主頁面
   ════════════════════════════════════════════════ */
function Blog() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [allTags, setAllTags] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchPosts();
    fetchTags();
    fetchCategories();
  }, [sortBy]);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/posts?sortBy=${sortBy}&limit=100`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.posts && Array.isArray(data.posts)) {
        setPosts(data.posts.map(p => ({ ...p, tags: p.tags || [] })));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTags = async () => {
    try {
      const res = await fetch('/api/tags');
      const data = await res.json();
      if (data.tags) setAllTags(data.tags);
    } catch (err) { console.error(err); }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      const data = await res.json();
      if (data.categories) setAllCategories(data.categories);
    } catch (err) { console.error(err); }
  };

  const filteredPosts = useMemo(() => {
    return posts.filter(post => {
      const matchSearch = !searchTerm || post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        post.content.toLowerCase().includes(searchTerm.toLowerCase());
      const matchTag = !selectedTag || (Array.isArray(post.tags)
        ? post.tags.includes(selectedTag)
        : post.tags?.split(',').includes(selectedTag));
      const matchCat = !selectedCategory || post.category === selectedCategory;
      return matchSearch && matchTag && matchCat;
    });
  }, [posts, searchTerm, selectedTag, selectedCategory]);

  // 按年月分組
  const groupedPosts = useMemo(() => {
    const groups = {};
    filteredPosts.forEach(post => {
      const d = new Date(post.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!groups[key]) {
        groups[key] = {
          year: d.getFullYear(),
          month: d.getMonth(),
          label: d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' }),
          posts: [],
        };
      }
      groups[key].posts.push(post);
    });
    return Object.values(groups).sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month);
  }, [filteredPosts]);

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setSelectedTag('');
    setSelectedCategory('');
  }, []);

  const featuredPosts = useMemo(() => posts.slice(0, 5), [posts]);
  const maxTagsShow = 10;
  const tagsToShow = tagsExpanded ? allTags : allTags.slice(0, maxTagsShow);

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="blog-page">
        <div className="blog-nebula-bg">
          <div className="nebula-layer blog-nebula-1" />
          <div className="nebula-layer blog-nebula-2" />
          <div className="nebula-layer blog-nebula-3" />
          <div className="blog-nebula-dust" />
        </div>
        <div className="blog-loading">
          <div className="blog-loader" />
          <p>正在載入文章...</p>
        </div>
      </div>
    );
  }

  /* ── Error ── */
  if (error) {
    return (
      <div className="blog-page">
        <div className="blog-nebula-bg">
          <div className="nebula-layer blog-nebula-1" />
          <div className="nebula-layer blog-nebula-2" />
          <div className="nebula-layer blog-nebula-3" />
          <div className="blog-nebula-dust" />
        </div>
        <div className="blog-loading">
          <p>❌ {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="blog-page">
      <SEOHead
        title="手記 · Notes"
        description="楊泰和的技術手記、學習筆記與生活隨筆。涵蓋前端架構、Rust、AI 系統開發等主題。"
        path="/blog"
      />

      {/* ── 星雲背景 ── */}
      <div className="blog-nebula-bg">
        <div className="nebula-layer blog-nebula-1" />
        <div className="nebula-layer blog-nebula-2" />
        <div className="nebula-layer blog-nebula-3" />
        <div className="blog-nebula-dust" />
      </div>

      {/* ── 主內容區 ── */}
      <div className="blog-layout">

        {/* ── 主欄 ── */}
        <main className="blog-main">
          {/* Hero 標題 */}
          <motion.header className="blog-hero" initial="hidden" animate="visible" variants={fadeUp}>
            <h1 className="blog-hero-title">
              <span className="blog-title-gradient">手記</span>
              <span className="blog-title-sub">· Notes</span>
            </h1>
            <p className="blog-hero-desc">
              記錄技術探索、開發心得與生活碎片。每一篇都是當下最真誠的思考。
            </p>
          </motion.header>

          {/* 搜尋列 */}
          <motion.div className="blog-search-bar" variants={fadeUp} initial="hidden" animate="visible" custom={1}>
            <FaSearch className="search-icon" />
            <input
              type="text"
              className="blog-search-input"
              placeholder="搜尋文章..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button className="search-clear" onClick={() => setSearchTerm('')}>
                <FaTimes />
              </button>
            )}
          </motion.div>

          {/* 排序控制 */}
          <motion.div className="blog-sort-row" variants={fadeUp} initial="hidden" animate="visible" custom={2}>
            <div className="sort-pills">
              {[
                { value: 'newest', label: '最新' },
                { value: 'oldest', label: '最舊' },
                { value: 'popular', label: '熱門' },
              ].map(opt => (
                <button
                  key={opt.value}
                  className={`sort-pill ${sortBy === opt.value ? 'active' : ''}`}
                  onClick={() => setSortBy(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="post-count">{filteredPosts.length} 篇文章</span>
          </motion.div>

          {/* 活動篩選 */}
          {(selectedTag || selectedCategory || searchTerm) && (
            <motion.div className="active-filters" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
              {selectedCategory && (
                <span className="active-filter-chip">
                  📁 {selectedCategory}
                  <button onClick={() => setSelectedCategory('')}><FaTimes /></button>
                </span>
              )}
              {selectedTag && (
                <span className="active-filter-chip">
                  🏷️ {selectedTag}
                  <button onClick={() => setSelectedTag('')}><FaTimes /></button>
                </span>
              )}
              {searchTerm && (
                <span className="active-filter-chip">
                  🔍 {searchTerm}
                  <button onClick={() => setSearchTerm('')}><FaTimes /></button>
                </span>
              )}
              <button className="clear-all-btn" onClick={clearFilters}>清除全部</button>
            </motion.div>
          )}

          {/* 文章列表 — 時間流 */}
          {filteredPosts.length === 0 ? (
            <motion.div className="blog-empty" variants={fadeUp} initial="hidden" animate="visible">
              <div className="empty-icon">📝</div>
              <h3>{searchTerm || selectedTag || selectedCategory ? '找不到相關文章' : '暫無文章'}</h3>
              <p>
                {searchTerm || selectedTag || selectedCategory
                  ? '嘗試調整搜索條件或瀏覽其他分類'
                  : '內容正在路上，敬請期待'}
              </p>
              {(searchTerm || selectedTag || selectedCategory) && (
                <button className="empty-clear-btn" onClick={clearFilters}>清除篩選</button>
              )}
            </motion.div>
          ) : (
            <motion.div className="notes-timeline" variants={stagger} initial="hidden" animate="visible">
              {groupedPosts.map((group) => (
                <div key={`${group.year}-${group.month}`} className="timeline-group">
                  <div className="timeline-group-label">{group.label}</div>
                  {group.posts.map((post, i) => (
                    <NoteCard key={post.id} post={post} index={i} />
                  ))}
                </div>
              ))}
            </motion.div>
          )}
        </main>

        {/* ── 側邊欄 ── */}
        <aside className="blog-sidebar">
          {/* 文章統計 */}
          <div className="sidebar-card">
            <h3 className="sidebar-title">📊 統計</h3>
            <div className="stats-grid">
              <div className="stat-cell">
                <span className="stat-num">{posts.length}</span>
                <span className="stat-lbl">文章</span>
              </div>
              <div className="stat-cell">
                <span className="stat-num">{allTags.length}</span>
                <span className="stat-lbl">標籤</span>
              </div>
              <div className="stat-cell">
                <span className="stat-num">{filteredPosts.length}</span>
                <span className="stat-lbl">篩選結果</span>
              </div>
            </div>
          </div>

          {/* 分類 */}
          {allCategories.length > 0 && (
            <div className="sidebar-card">
              <h3 className="sidebar-title">📁 分類</h3>
              <div className="category-list">
                <button
                  className={`category-item ${selectedCategory === '' ? 'active' : ''}`}
                  onClick={() => setSelectedCategory('')}
                >
                  全部
                </button>
                {allCategories.map(cat => (
                  <button
                    key={cat.category}
                    className={`category-item ${selectedCategory === cat.category ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat.category)}
                  >
                    {cat.category}
                    <span className="cat-count">{cat.post_count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 標籤雲 */}
          {allTags.length > 0 && (
            <div className="sidebar-card">
              <h3 className="sidebar-title">🏷️ 標籤</h3>
              <div className="tag-cloud">
                <button
                  className={`cloud-tag ${selectedTag === '' ? 'active' : ''}`}
                  onClick={() => setSelectedTag('')}
                >
                  全部
                </button>
                {tagsToShow.map(tag => {
                  const name = typeof tag === 'object' ? tag.name : tag;
                  const count = typeof tag === 'object' ? tag.post_count : '';
                  return (
                    <button
                      key={name}
                      className={`cloud-tag ${selectedTag === name ? 'active' : ''}`}
                      onClick={() => setSelectedTag(name)}
                    >
                      #{name}{count ? ` (${count})` : ''}
                    </button>
                  );
                })}
              </div>
              {allTags.length > maxTagsShow && (
                <button className="tags-toggle" onClick={() => setTagsExpanded(!tagsExpanded)}>
                  {tagsExpanded ? '收起' : `展開全部 (${allTags.length})`}
                  <FaChevronDown className={`toggle-icon ${tagsExpanded ? 'expanded' : ''}`} />
                </button>
              )}
            </div>
          )}

          {/* 精選文章 */}
          {featuredPosts.length > 0 && (
            <div className="sidebar-card">
              <h3 className="sidebar-title">✨ 精選</h3>
              <ul className="featured-list">
                {featuredPosts.map(p => (
                  <li key={p.id}>
                    <Link to={`/blog/${p.id}`} className="featured-link">
                      <span className="featured-text">{p.title}</span>
                      <span className="featured-date">
                        {new Date(p.created_at).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 快速導航 */}
          <div className="sidebar-card">
            <h3 className="sidebar-title">🚀 導航</h3>
            <div className="quick-nav">
              <Link to="/" className="nav-pill">🏠 首頁</Link>
              <Link to="/now" className="nav-pill">📡 現在</Link>
              <Link to="/setup" className="nav-pill">🖥️ 配備</Link>
              <Link to="/journey" className="nav-pill">🛤️ 旅程</Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default Blog;