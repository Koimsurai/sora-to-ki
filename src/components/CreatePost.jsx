import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './CreatePost.css';

function CreatePost() {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    const user = prompt("請輸入管理員帳號：");
    const pass = prompt("請輸入管理員密碼：");

    if (!user || !pass) {
      alert("未提供帳號或密碼，無法發佈。");
      return;
    }

    const credentials = btoa(`${user}:${pass}`);

    const newPost = {
      title,
      content, // 將原始內容發送到後端，讓後端處理 HTML 轉換
      tags: tags.split(',').map(tag => tag.trim()).filter(tag => tag), // 過濾空標籤
      author: 'Koimsurai', // 預設作者
      date: new Date().toISOString().split('T')[0],
    };

    try {
      const response = await fetch('/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${credentials}`
        },
        body: JSON.stringify(newPost)
      });

      if (response.ok) {
        alert('文章已成功發佈！');
        navigate('/blog');
      } else {
        const errorData = await response.json();
        alert(`發佈失敗：${errorData.message || '伺服器錯誤或憑證無效'}`);
      }
    } catch (error) {
      console.error('Error creating post:', error);
      alert('發佈過程中發生網路錯誤。');
    }
  };

  return (
    <div className="create-post-container">
      <div className="create-post-wrapper">
        <h1 className="create-post-title">🚀 創建新的太空探索</h1>
        <form onSubmit={handleSubmit} className="create-post-form">
          <div className="form-group">
            <label htmlFor="title">🌟 文章標題</label>
            <input
              type="text"
              id="title"
              placeholder="為您的太空冒險命名..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="content">📝 探索內容</label>
            <textarea
              id="content"
              rows="15"
              placeholder="分享您在宇宙中的發現和見解..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
            ></textarea>
          </div>
          
          <div className="form-group">
            <label htmlFor="tags">🏷️ 探索標籤 (以逗號分隔)</label>
            <input
              type="text"
              id="tags"
              placeholder="例如：React, CSS, 前端開發, 太空技術"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
          
          <div className="form-actions">
            <button type="submit" className="submit-btn">
              ✨ 發射文章
            </button>
            <button 
              type="button" 
              className="cancel-btn"
              onClick={() => navigate('/admin')}
            >
              🔙 返回控制台
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreatePost;
