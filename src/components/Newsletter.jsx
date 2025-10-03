import React, { useState } from 'react';
import './Newsletter.css';

const Newsletter = () => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState(''); // 'success', 'error', 'loading'
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, name }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('success');
        setMessage('訂閱成功！感謝您的訂閱 ✨');
        setEmail('');
        setName('');
      } else {
        setStatus('error');
        setMessage(data.error || '訂閱失敗，請稍後再試');
      }
    } catch (error) {
      setStatus('error');
      setMessage('網路錯誤，請稍後再試');
      console.error('Newsletter subscription error:', error);
    }
  };

  return (
    <div className="newsletter-container">
      <div className="newsletter-card">
        <div className="newsletter-header">
          <div className="newsletter-icon">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <h3 className="newsletter-title">訂閱電子報</h3>
          <p className="newsletter-description">
            獲取最新文章更新與技術分享，直接送到您的信箱 📬
          </p>
        </div>

        <form onSubmit={handleSubmit} className="newsletter-form">
          <div className="form-group">
            <input
              type="text"
              placeholder="您的名字（選填）"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="newsletter-input"
              disabled={status === 'loading'}
            />
          </div>
          
          <div className="form-group">
            <input
              type="email"
              placeholder="您的電子郵件 *"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="newsletter-input"
              required
              disabled={status === 'loading'}
            />
          </div>

          <button 
            type="submit" 
            className={`newsletter-submit ${status}`}
            disabled={status === 'loading'}
          >
            {status === 'loading' ? (
              <>
                <span className="spinner"></span>
                訂閱中...
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
                訂閱電子報
              </>
            )}
          </button>

          {message && (
            <div className={`newsletter-message ${status}`}>
              {status === 'success' && (
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              )}
              {status === 'error' && (
                <svg viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              )}
              <span>{message}</span>
            </div>
          )}
        </form>

        <div className="newsletter-footer">
          <p className="newsletter-note">
            ✨ 我們重視您的隱私，不會分享您的資訊
          </p>
        </div>
      </div>
    </div>
  );
};

export default Newsletter;
