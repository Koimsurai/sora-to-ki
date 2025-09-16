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
      <SpaceHeroBanner>
        <BlackHole3D className="blog-blackhole-left" isLeftSide={true} />
      </SpaceHeroBanner>
      <div className="blog-content-section">
        <div className="blog-main-content">
          <div className="blog-header">
            <h2 className="blog-section-title">最新探索</h2>
            <p className="blog-section-subtitle">發現宇宙的無限可能</p>
          </div>

          {filteredPosts.length === 0 ? (
            <div className="no-posts">
              <div className="astronaut-icon">🚀</div>
              <h3>暫無文章</h3>
              <p>目前沒有符合條件的文章，請稍後再來查看。</p>
            </div>
          ) : (
            <div className="blog-posts-feed">
              {filteredPosts.map((post, index) => (
                <div
                  key={post.id}
                  className="blog-post-card-wrapper"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <Link to={`/blog/${post.id}`} className="blog-post-card">
                    <div className="blog-card-content">
                      <div className="blog-post-header">
                        <div className="post-author-info">
                          <div className="author-avatar">
                            {post.author ? post.author.charAt(0).toUpperCase() : 'A'}
                          </div>
                          <span className="author-name">{post.author || '匿名作者'}</span>
                        </div>
                        <span className="post-date">{post.date}</span>
                      </div>
                      <div className="blog-post-body">
                        <h3 className="blog-post-title">{post.title}</h3>
                        <p className="blog-post-summary">{post.summary}</p>
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
        <aside className="blog-sidebar">
          <div className="sidebar-widget">
            <h3 className="widget-title">搜尋文章</h3>
            <div className="search-container">
              <div className="search-icon">🔍</div>
              <input
                type="text"
                placeholder="搜尋..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
            </div>
          </div>
          <div className="sidebar-widget">
            <h3 className="widget-title">精選文章</h3>
            <ul className="featured-posts-list">
              {posts.slice(0, 5).map(post => (
                <li key={post.id}>
                  <Link to={`/blog/${post.id}`}>{post.title}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="sidebar-widget">
            <h3 className="widget-title">標籤</h3>
            <div className="tag-cloud">
              <span
                className={`tag ${selectedTag === '' ? 'active' : ''}`}
                onClick={() => setSelectedTag('')}
              >
                所有類別
              </span>
              {allTags.map(tag => (
                <span
                  key={tag}
                  className={`tag ${selectedTag === tag ? 'active' : ''}`}
                  onClick={() => setSelectedTag(tag)}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default Blog;
