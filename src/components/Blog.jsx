import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import MeteorShower from './MeteorShower';
import SpaceParticles from './SpaceParticles';
import SpaceHeroBanner from './SpaceHeroBanner';
import BlackHole3D from './BlackHole3D';
import ModernCard from './ModernCard';
import SearchAndFilter from './SearchAndFilter';
import './Blog.css';

function Blog() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [allTags, setAllTags] = useState([]);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/posts');
      
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
          summary: post.content.substring(0, 150).replace(/<[^>]+>/g, '') + '...',
          date: new Date(post.created_at).toLocaleDateString('zh-TW')
        }));
        
        console.log('Parsed posts:', parsedPosts);
        setPosts(parsedPosts);
        
        // 提取所有唯一標籤
        const tags = [...new Set(parsedPosts.flatMap(post => post.tags))];
        setAllTags(tags);
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
  };

  const filteredPosts = posts.filter(post => {
    const matchesSearch = post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         post.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTag = !selectedTag || post.tags.includes(selectedTag);
    return matchesSearch && matchesTag;
  });

  if (loading) {
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
      <SpaceParticles />
      <MeteorShower />
      <SpaceHeroBanner>
        <BlackHole3D className="blog-blackhole-left" isLeftSide={true} />
      </SpaceHeroBanner>
      <div className="blog-content-section">
        <div className="blog-main-content">
          <div className="blog-header">
            <h2 className="blog-section-title">最新探索</h2>
            <p className="blog-section-subtitle">發現宇宙的無限可能</p>
          </div>

          <SearchAndFilter
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            selectedTag={selectedTag}
            setSelectedTag={setSelectedTag}
            allTags={allTags}
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
                      onClick={() => {
                        setSearchTerm('');
                        setSelectedTag('');
                      }}
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
            <div className="blog-posts-feed">
              {filteredPosts.map((post, index) => (
                <ModernCard key={post.id} post={post} index={index} />
              ))}
            </div>
          )}
        </div>
        <aside className="blog-sidebar">
          <div className="sidebar-widget">
            <h3 className="widget-title">✨ 精選文章</h3>
            <ul className="featured-posts-list">
              {posts.slice(0, 5).map(post => (
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
                <span className="stat-number">{filteredPosts.length}</span>
                <span className="stat-label">當前顯示</span>
              </div>
            </div>
          </div>

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
        </aside>
      </div>
    </div>
  );
}

export default Blog;
