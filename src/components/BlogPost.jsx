import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
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
        const fetchedPost = data.data;
        // Parse tags from JSON string
        fetchedPost.tags = JSON.parse(fetchedPost.tags || '[]');
        setPost(fetchedPost);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return <div className="blog-post-container"><p>載入中...</p></div>;
  }

  if (error || !post) {
    return (
      <div className="blog-post-container">
        <h1 className="post-title">文章不存在</h1>
        <p>抱歉，我們找不到您要找的文章。</p>
        <Link to="/blog" className="back-to-blog-link">‹ 返回文章列表</Link>
      </div>
    );
  }

  return (
    <div className="blog-post-container">
      <h1 className="post-title">{post.title}</h1>
      <div className="post-meta-info">
        <span>{post.date}</span> | <span>作者：{post.author}</span>
      </div>
      <div className="post-tags">
        {post.tags.map(tag => (
          <span key={tag} className="tag">{tag}</span>
        ))}
      </div>
      <div 
        className="post-content" 
        dangerouslySetInnerHTML={{ __html: post.content }} 
      />
      <Link to="/blog" className="back-to-blog-link">‹ 返回文章列表</Link>
    </div>
  );
}

export default BlogPost;
