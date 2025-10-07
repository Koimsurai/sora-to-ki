import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import LazyComponent from './LazyComponent';
import { 
  LazySpaceParticles, 
  LazyMeteorShower, 
  LazySpaceShuttle3D,
  SpaceParticlesPlaceholder,
  MeteorShowerPlaceholder,
  SpaceShuttle3DPlaceholder
} from './LazyEffects';
import SpaceHeroBanner from './SpaceHeroBanner';
import ModernCard from './ModernCard';
import SearchAndFilter from './SearchAndFilter';
import Newsletter from './Newsletter';
import './Blog.css';

function Blog() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [postsLoaded, setPostsLoaded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  // 根據 localStorage 或預設值初始化 viewMode
  const [viewMode, setViewMode] = useState(() => {
    const saved = window.localStorage.getItem('blogViewMode');
    return saved || 'timeline';
  });
  const [allTags, setAllTags] = useState([]);
  const [allCategories, setAllCategories] = useState([]);

  useEffect(() => {
    fetchPosts();
    fetchTags();
    fetchCategories();
    
    // 清理函數：組件卸載時重置狀態
    return () => {
      // 重置滾動位置
      window.scrollTo(0, 0);
    };
  }, [sortBy]);
  
  // 組件掛載時確保從頂部開始
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // 使用 useCallback 穩定化回呼函式
  const handleSearchChange = useCallback((e) => {
    setSearchTerm(e.target.value);
  }, []);

  const handleTagSelect = useCallback((tag) => {
    setSelectedTag(tag);
  }, []);

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setSelectedTag('');
  }, []);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/posts?sortBy=${sortBy}&limit=100`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      console.log('API response:', data);
      console.log('Posts array:', data.posts);
      console.log('Posts length:', data.posts ? data.posts.length : 'undefined');
      
      if (data.posts && Array.isArray(data.posts)) {
        const parsedPosts = data.posts.map(post => ({
          ...post,
          tags: post.tags || [],
          summary: post.excerpt || post.content.substring(0, 150).replace(/<[^>]+>/g, '') + '...',
          date: new Date(post.created_at).toLocaleDateString('zh-TW')
        }));
        
        console.log('Parsed posts:', parsedPosts);
        setPosts(parsedPosts);
        setPostsLoaded(true);
      } else {
        console.error('No posts found in response or posts is not an array');
        setError('無法載入文章數據');
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
      setError(`無法載入文章：${error.message}`);
    } finally {
      setLoading(false);
    }
    setPostsLoaded(true);
  };

  const fetchTags = async () => {
    try {
      const response = await fetch('/api/tags');
      const data = await response.json();
      if (data.tags) {
        setAllTags(data.tags);
      }
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/categories');
      const data = await response.json();
      if (data.categories) {
        setAllCategories(data.categories);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const filteredPosts = posts.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         post.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTag = !selectedTag || (Array.isArray(post.tags) 
      ? post.tags.includes(selectedTag) 
      : post.tags && post.tags.split(',').includes(selectedTag));
    const matchesCategory = !selectedCategory || post.category === selectedCategory;
    return matchesSearch && matchesTag && matchesCategory;
  });

  if (loading || !postsLoaded) {
    return (
      <div className="blog-container">
        <div className="loading-container">
          <div className="cosmic-loader">
            <div className="planet"></div>
            <div className="orbit"></div>
          </div>
          <p>正在載入文章...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="blog-container">
        <div className="error-container">
          <div className="error-message">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="blog-container">
      {/* 延遲載入背景粒子效果 */}
      <LazyComponent 
        className="space-particles-wrapper"
        placeholder={<SpaceParticlesPlaceholder />}
        rootMargin="200px"
      >
        <LazySpaceParticles />
      </LazyComponent>
      
      {/* 延遲載入流星雨效果 */}
      <LazyComponent 
        className="meteor-shower-wrapper"
        placeholder={<MeteorShowerPlaceholder />}
        rootMargin="300px"
      >
        <LazyMeteorShower />
      </LazyComponent>
      
      <SpaceHeroBanner>
        {/* 延遲載入 3D 太空梭 */}
        <LazyComponent 
          className="shuttle-wrapper"
          placeholder={<SpaceShuttle3DPlaceholder />}
          rootMargin="100px"
        >
          <LazySpaceShuttle3D />
        </LazyComponent>
      </SpaceHeroBanner>
      <div className="blog-content-section">
        <div className="blog-main-content">
          <div className="blog-header">
            <h2 className="blog-section-title">最新探索</h2>
            <p className="blog-section-subtitle">發現宇宙的無限可能</p>
          </div>

          <SearchAndFilter
            searchTerm={searchTerm}
            setSearchTerm={handleSearchChange}
            selectedTag={selectedTag}
            setSelectedTag={handleTagSelect}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            sortBy={sortBy}
            setSortBy={setSortBy}
            viewMode={viewMode}
            setViewMode={mode => {
              setViewMode(mode);
              window.localStorage.setItem('blogViewMode', mode);
            }}
            allTags={allTags}
            allCategories={allCategories}
          />

          {filteredPosts.length === 0 ? (
            <div className="no-posts">
              <div className="empty-state-container">
                <div className="empty-state-animation">
                  <div className="floating-elements">
                    <div className="element element-1">✨</div>
                    <div className="element element-2">🚀</div>
                    <div className="element element-3">⭐</div>
                    <div className="element element-4">🌟</div>
                  </div>
                  <div className="empty-state-icon">
                    <svg viewBox="0 0 24 24" fill="none">
                      <circle cx="11" cy="11" r="8" />
                      <path d="M21 21l-4.35-4.35" />
                    </svg>
                  </div>
                </div>
                <h3 className="empty-state-title">
                  {searchTerm || selectedTag ? '找不到相關文章' : '暫無文章'}
                </h3>
                <p className="empty-state-description">
                  {searchTerm || selectedTag 
                    ? '嘗試調整搜索條件或瀏覽其他類別的文章' 
                    : '目前沒有文章，請稍後再來查看精彩內容'}
                </p>
                {(searchTerm || selectedTag) && (
                  <div className="empty-state-actions">
                    <button 
                      className="clear-filters-btn"
                      onClick={clearFilters}
                    >
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M3 6h18" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                      清除篩選條件
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {viewMode === 'card' && (
                <div className="blog-posts-feed">
                  {filteredPosts.map((post, index) => (
                    <ModernCard key={post.id} post={post} index={index} />
                  ))}
                </div>
              )}
              {viewMode === 'list' && (
                <div className="blog-posts-list">
                  {filteredPosts.map((post, index) => (
                    <ListViewCard key={post.id} post={post} index={index} />
                  ))}
                </div>
              )}
              {viewMode === 'timeline' && (
                <div className="blog-posts-timeline">
                  {filteredPosts.length > 0 ? (
                    <TimelineView posts={filteredPosts} key={`timeline-${filteredPosts.length}`} />
                  ) : (
                    <div className="timeline-empty">
                      <p>暫無文章可顯示於時間軸</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <BlogSidebar 
          posts={posts}
          allTags={allTags}
          filteredPostsLength={filteredPosts.length}
        />
      </div>
    </div>
  );
}

// 使用 React.memo 優化側邊欄組件，防止不必要的重渲染
const BlogSidebar = React.memo(({ posts, allTags, filteredPostsLength }) => {
  const featuredPosts = React.useMemo(() => posts.slice(0, 5), [posts]);
  
  return (
    <aside className="blog-sidebar">
      <div className="sidebar-widget">
        <h3 className="widget-title">✨ 精選文章</h3>
        <ul className="featured-posts-list">
          {featuredPosts.map(post => (
            <li key={post.id}>
              <Link to={`/blog/${post.id}`}>{post.title}</Link>
            </li>
          ))}
        </ul>
      </div>
      
      <div className="sidebar-widget">
        <h3 className="widget-title">📊 文章統計</h3>
        <div className="stats-container">
          <div className="stat-item">
            <span className="stat-number">{posts.length}</span>
            <span className="stat-label">總文章數</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">{allTags.length}</span>
            <span className="stat-label">標籤數量</span>
          </div>
          <div className="stat-item">
            <span className="stat-number">{filteredPostsLength}</span>
            <span className="stat-label">當前顯示</span>
          </div>
        </div>
      </div>

      <div className="sidebar-widget">
        <Newsletter />
      </div>

      <QuickNavigation />
    </aside>
  );
});

// 完全靜態的快速導航組件
const QuickNavigation = React.memo(() => (
  <div className="sidebar-widget">
    <h3 className="widget-title">🚀 快速導航</h3>
    <div className="quick-nav">
      <Link to="/" className="nav-link">
        <span className="nav-icon">🏠</span>
        <span>首頁</span>
      </Link>
      <Link to="/portfolio" className="nav-link">
        <span className="nav-icon">💼</span>
        <span>作品集</span>
      </Link>
      <Link to="/about" className="nav-link">
        <span className="nav-icon">👨‍💻</span>
        <span>關於我</span>
      </Link>
      <Link to="/contact" className="nav-link">
        <span className="nav-icon">📧</span>
        <span>聯絡我</span>
      </Link>
    </div>
  </div>
));

// 列表視圖卡片組件 - 統一樣式
const ListViewCard = React.memo(({ post, index }) => {
  return (
    <Link to={`/blog/${post.id}`} className="list-view-item" style={{ animationDelay: `${index * 0.05}s` }}>
      <div className="list-view-content">
        <div className="list-view-meta">
          <div className="meta-left">
            <span className="list-view-author">{post.author || '匿名作者'}</span>
            <span className="meta-separator">•</span>
            <span className="list-view-date">{post.date}</span>
          </div>
          {post.view_count > 0 && (
            <span className="list-view-views">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              {post.view_count}
            </span>
          )}
        </div>
        <h3 className="list-view-title">{post.title}</h3>
        <p className="list-view-summary">{post.summary}</p>
        {post.category && (
          <span className="list-view-category">{post.category}</span>
        )}
        {post.tags && post.tags.length > 0 && (
          <div className="list-view-tags">
            {(Array.isArray(post.tags) ? post.tags : post.tags.split(',')).slice(0, 4).map((tag, i) => (
              <span key={i} className="list-view-tag">#{tag}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
});

// 時間軸視圖組件
const TimelineView = React.memo(({ posts }) => {
  // 按年月分組
  const groupedPosts = React.useMemo(() => {
    const groups = {};
    posts.forEach(post => {
      const date = new Date(post.created_at);
      const year = date.getFullYear();
      const month = date.getMonth();
      const key = `${year}-${month}`;
      
      if (!groups[key]) {
        groups[key] = {
          year,
          month,
          monthName: date.toLocaleDateString('zh-TW', { month: 'long' }),
          posts: []
        };
      }
      groups[key].posts.push(post);
    });
    
    return Object.values(groups).sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.month - a.month;
    });
  }, [posts]);

  return (
    <div className="timeline-container">
      {groupedPosts.map((group, groupIndex) => (
        <div key={`${group.year}-${group.month}`} className="timeline-group" style={{ animationDelay: `${groupIndex * 0.1}s` }}>
          <div className="timeline-date-marker">
            <div className="timeline-year">{group.year}</div>
            <div className="timeline-month">{group.monthName}</div>
          </div>
          <div className="timeline-posts">
            {group.posts.map((post, postIndex) => (
              <Link 
                key={post.id} 
                to={`/blog/${post.id}`} 
                className="timeline-item"
                style={{ animationDelay: `${(groupIndex * 0.1) + (postIndex * 0.05)}s` }}
              >
                <div className="timeline-dot" />
                <div className="timeline-content">
                  <div className="timeline-header">
                    <h3 className="timeline-title">{post.title}</h3>
                    <span className="timeline-date-small">{post.date}</span>
                  </div>
                  <p className="timeline-summary">{post.summary}</p>
                  {post.category && (
                    <span className="timeline-category">{post.category}</span>
                  )}
                  <div className="timeline-tags">
                    {(Array.isArray(post.tags) ? post.tags : post.tags.split(',')).slice(0, 3).map((tag, i) => (
                      <span key={i} className="timeline-tag">#{tag}</span>
                    ))}
                  </div>
                  {post.view_count > 0 && (
                    <div className="timeline-meta">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      {post.view_count} 次瀏覽
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
});

export default Blog;
