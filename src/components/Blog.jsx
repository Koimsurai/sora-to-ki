import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Blog.css';

function Blog() {
  const [posts, setPosts] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/posts')
      .then(res => res.json())
      .then(data => {
        // The API returns { message: 'success', data: [...] }
        // Also, tags are stored as a JSON string, so we need to parse them.
        const parsedPosts = data.data.map(post => ({
          ...post,
          tags: JSON.parse(post.tags || '[]'),
          summary: post.content.substring(0, 150).replace(/<[^>]+>/g, '') + '...' // Generate summary from content
        }));
        setPosts(parsedPosts);
      })
      .catch(error => console.error('Error fetching posts:', error));
  }, []);

  const handleDelete = async (postId, e) => {
    e.preventDefault(); // Prevent navigation
    e.stopPropagation(); // Stop event bubbling to the card's Link

    const user = prompt("請輸入管理員帳號：");
    const pass = prompt("請輸入管理員密碼：");

    if (!user || !pass) {
      alert("未提供帳號或密碼。");
      return;
    }

    const credentials = btoa(`${user}:${pass}`);

    if (window.confirm('確定要刪除這篇文章嗎？此操作無法復原。')) {
      try {
        const response = await fetch(`/api/posts/${postId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Basic ${credentials}`
          }
        });

        if (response.ok) {
          alert('文章已成功刪除。');
          setPosts(posts.filter(p => p.id !== postId)); // Update state to remove post
        } else {
          const errorData = await response.json();
          alert(`刪除失敗：${errorData.message || '伺服器錯誤'}`);
        }
      } catch (error) {
        console.error('Error deleting post:', error);
        alert('刪除過程中發生錯誤。');
      }
    }
  };


  return (
    <div className="blog-container">
      <div className="blog-header">
        <h1 className="blog-title">學習筆記與工單紀錄</h1>
        <Link to="/blog/create" className="create-post-link">新增文章</Link>
      </div>
      <div className="blog-posts-grid">
        {posts.map(post => (
          <div key={post.id} className="blog-post-card-wrapper">
            <Link to={`/blog/${post.id}`} className="blog-post-card">
              <div className="blog-card-content">
                <h2 className="blog-post-title">{post.title}</h2>
                <p className="blog-post-summary">{post.summary}</p>
                <div className="blog-post-meta">
                  <span>{post.date}</span>
                  <span>by {post.author}</span>
                </div>
                <div className="blog-post-tags">
                  {post.tags.map(tag => (
                    <span key={tag} className="tag">{tag}</span>
                  ))}
                </div>
              </div>
            </Link>
            <button onClick={(e) => handleDelete(post.id, e)} className="delete-post-button">
              刪除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Blog;
