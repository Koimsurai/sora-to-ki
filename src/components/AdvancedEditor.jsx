import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MDEditor from '@uiw/react-md-editor';
import './AdvancedEditor.css';

function AdvancedEditor() {
  const [post, setPost] = useState({
    title: '',
    content: '',
    excerpt: '',
    tags: [],
    status: 'draft'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [tagInput, setTagInput] = useState('');
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  useEffect(() => {
    // 檢查登入狀態
    const token = localStorage.getItem('adminToken');
    if (!token) {
      navigate('/admin/login');
      return;
    }

    // 如果是編輯模式，載入文章資料
    if (isEdit) {
      fetchPost();
    }
  }, [id, isEdit, navigate]);

  const fetchPost = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`/api/posts/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setPost({
          title: data.title,
          content: data.content,
          excerpt: data.excerpt || '',
          tags: data.tags || [],
          status: data.status
        });
        setTagInput(data.tags ? data.tags.join(', ') : '');
      } else if (response.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/admin/login');
      } else {
        setError('無法載入文章資料');
      }
    } catch (error) {
      console.error('載入文章失敗:', error);
      setError('載入文章失敗');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // 處理標籤
    const tags = tagInput
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag);

    // 自動生成摘要（如果沒有提供）
    const excerpt = post.excerpt || post.content.substring(0, 150).replace(/[#*`]/g, '') + '...';

    const postData = {
      ...post,
      tags,
      excerpt
    };

    try {
      const token = localStorage.getItem('adminToken');
      const url = isEdit ? `/api/posts/${id}` : '/api/posts';
      const method = isEdit ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(postData)
      });

      if (response.ok) {
        alert(isEdit ? '文章已更新！' : '文章已創建！');
        navigate('/admin');
      } else if (response.status === 401) {
        localStorage.removeItem('adminToken');
        navigate('/admin/login');
      } else {
        const errorData = await response.json();
        setError(errorData.message || '儲存失敗');
      }
    } catch (error) {
      console.error('儲存文章失敗:', error);
      setError('儲存失敗，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveDraft = () => {
    setPost(prev => ({ ...prev, status: 'draft' }));
    setTimeout(() => {
      document.querySelector('form').dispatchEvent(
        new Event('submit', { cancelable: true, bubbles: true })
      );
    }, 0);
  };

  const handlePublish = () => {
    setPost(prev => ({ ...prev, status: 'published' }));
    setTimeout(() => {
      document.querySelector('form').dispatchEvent(
        new Event('submit', { cancelable: true, bubbles: true })
      );
    }, 0);
  };

  return (
    <div className="advanced-editor">
      <header className="editor-header">
        <h1>{isEdit ? '編輯文章' : '創建新文章'}</h1>
        <div className="header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/admin')}
          >
            返回後台
          </button>
        </div>
      </header>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="editor-form">
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="title">文章標題 *</label>
            <input
              type="text"
              id="title"
              value={post.title}
              onChange={(e) => setPost(prev => ({ ...prev, title: e.target.value }))}
              required
              disabled={isLoading}
              placeholder="輸入文章標題..."
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="excerpt">文章摘要</label>
            <textarea
              id="excerpt"
              value={post.excerpt}
              onChange={(e) => setPost(prev => ({ ...prev, excerpt: e.target.value }))}
              disabled={isLoading}
              placeholder="輸入文章摘要（留空將自動生成）..."
              rows="3"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="tags">標籤</label>
            <input
              type="text"
              id="tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              disabled={isLoading}
              placeholder="輸入標籤，用逗號分隔..."
            />
            <small className="form-hint">例如：JavaScript, React, 教學</small>
          </div>
        </div>

        <div className="form-group">
          <label>文章內容 *</label>
          <div className="markdown-editor-container">
            <MDEditor
              value={post.content}
              onChange={(value) => setPost(prev => ({ ...prev, content: value || '' }))}
              preview="edit"
              height={500}
              data-color-mode="light"
            />
          </div>
        </div>

        <div className="editor-actions">
          <div className="status-info">
            當前狀態: 
            <span className={`status-badge ${post.status}`}>
              {post.status === 'published' ? '已發佈' : '草稿'}
            </span>
          </div>
          
          <div className="action-buttons">
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleSaveDraft}
              disabled={isLoading}
            >
              {isLoading ? '儲存中...' : '儲存草稿'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handlePublish}
              disabled={isLoading}
            >
              {isLoading ? '發佈中...' : '發佈文章'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default AdvancedEditor;
