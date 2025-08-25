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
      <h1 className="create-post-title">新增文章</h1>
      <form onSubmit={handleSubmit} className="create-post-form">
        <div className="form-group">
          <label htmlFor="title">標題</label>
          <input
            type="text"
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="content">內容</label>
          <textarea
            id="content"
            rows="15"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
          ></textarea>
        </div>
        <div className="form-group">
          <label htmlFor="tags">標籤 (以逗號分隔)</label>
          <input
            type="text"
            id="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="例如：React, CSS, Bugfix"
          />
        </div>
        <button type="submit" className="submit-post-button">發佈文章</button>
      </form>
    </div>
  );
}

export default CreatePost;
