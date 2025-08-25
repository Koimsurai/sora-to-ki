import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Comments from './Comments';
import MeteorShower from './MeteorShower';
import BlackHole3D from './BlackHole3D';
import './BlogPost.css';

function BlogPost() {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { id } = useParams();

  useEffect(() => {
    fetch(`/api/posts/${id}`)
      .then(res => {
        if (!res.ok) {
          throw new Error('Post not found');
        }
        return res.json();
      })
      .then(data => {
        console.log('BlogPost API response:', data);
        if (data.message === 'success') {
          const fetchedPost = {
            id: data.id,
            title: data.title,
            content: data.content,
            author: data.author,
            created_at: data.created_at,
            tags: data.tags || [],
            date: new Date(data.created_at).toLocaleDateString('zh-TW')
          };
          setPost(fetchedPost);
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

  if (loading) {
    return (
      <div className="blog-post-container">
        <MeteorShower />
        <BlackHole3D style={{ position: 'fixed', top: '20px', right: '20px', width: '200px', height: '200px', zIndex: 5 }} />
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

  if (error || !post) {
    return (
      <div className="blog-post-container">
        <MeteorShower />
        <BlackHole3D style={{ position: 'fixed', top: '20px', right: '20px', width: '200px', height: '200px', zIndex: 5 }} />
        <div className="error-content">
          <div className="error-icon">🚀</div>
          <h1 className="post-title">文章不存在</h1>
          <p>抱歉，我們找不到您要找的文章。</p>
          <Link to="/blog" className="back-to-blog-link">‹ 返回文章列表</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="blog-post-container">
      <MeteorShower />
      <BlackHole3D style={{ position: 'fixed', top: '20px', right: '20px', width: '200px', height: '200px', zIndex: 5 }} />
      <article className="blog-post-article">
        <header className="post-header">
          <h1 className="post-title">{post.title}</h1>
          <div className="post-meta-info">
            <span className="post-date">📅 {post.date}</span>
            <span className="post-author">👤 {post.author}</span>
          </div>
          <div className="post-tags">
            {post.tags.map(tag => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>
        </header>
        
        <div className="post-content-wrapper">
          <div 
            className="post-content" 
            dangerouslySetInnerHTML={{ __html: post.content }} 
          />
        </div>
        
        <Comments postId={id} />
        
        <footer className="post-footer">
          <Link to="/blog" className="back-to-blog-link">
            <span className="back-icon">‹</span>
            返回文章列表
          </Link>
        </footer>
      </article>
    </div>
  );
}

export default BlogPost;
