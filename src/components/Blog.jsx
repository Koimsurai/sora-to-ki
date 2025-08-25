import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import MeteorShower from './MeteorShower';
import SpaceParticles from './SpaceParticles';
import SpaceHeroBanner from './SpaceHeroBanner';
import BlackHole3D from './BlackHole3D';
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
      
      {/* 將 BlackHole3D 移到 SpaceHeroBanner 內部 */}
      <SpaceHeroBanner>
        <BlackHole3D className="blog-blackhole-left" isLeftSide={true} />
      </SpaceHeroBanner>
      
      <div className="blog-content-section">
        <div className="blog-header">
          <h2 className="blog-section-title">最新探索</h2>
          <p className="blog-section-subtitle">發現宇宙的無限可能</p>
          
          <div className="blog-controls">
            <div className="search-container">
              <div className="search-icon">🔍</div>
              <input
                type="text"
                placeholder="搜尋太空知識..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
            <div className="filter-container">
              <div className="filter-icon">🏷️</div>
              <select
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="tag-filter"
              >
                <option value="">所有類別</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      
      {filteredPosts.length === 0 ? (
        <div className="no-posts">
          <div className="astronaut-icon">🚀</div>
          <h3>暫無文章</h3>
          <p>目前沒有符合條件的文章，請稍後再來查看。</p>
          <div className="debug-info">
            <p>調試信息：</p>
            <p>所有文章數量: {posts.length}</p>
            <p>篩選後文章數量: {filteredPosts.length}</p>
            <p>搜尋條件: "{searchTerm}"</p>
            <p>選擇的標籤: "{selectedTag}"</p>
          </div>
        </div>
      ) : (
        <div className="blog-posts-grid">
          {filteredPosts.map((post, index) => (
            <div 
              key={post.id} 
              className="blog-post-card-wrapper"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <Link to={`/blog/${post.id}`} className="blog-post-card">
                <div className="blog-card-content">
                  <div className="blog-card-icon">
                    {post.tags.includes('React') ? '⚛️' : 
                     post.tags.includes('Docker') ? '🐳' : 
                     post.tags.includes('CSS') ? '🎨' : '🚀'}
                  </div>
                  <h3 className="blog-post-title">{post.title}</h3>
                  <p className="blog-post-summary">{post.summary}</p>
                  <div className="blog-post-meta">
                    <span className="meta-item">
                      <span className="meta-icon">📅</span>
                      {post.date}
                    </span>
                    <span className="meta-item">
                      <span className="meta-icon">👤</span>
                      {post.author}
                    </span>
                  </div>
                  <div className="blog-post-tags">
                    {post.tags.map(tag => (
                      <span key={tag} className="tag">{tag}</span>
                    ))}
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

export default Blog;
