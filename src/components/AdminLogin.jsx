import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './AdminLogin.css';

function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('adminToken', data.token);
        navigate('/admin');
      } else {
        const errorData = await response.json();
        setError(errorData.message || '登入失敗');
      }
    } catch (error) {
      console.error('登入錯誤:', error);
      setError('網路錯誤，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="admin-login">
      <div className="login-container">
        <div className="login-header">
          <h1>🚀 太空指揮中心</h1>
          <p>歡迎回到宇宙管理控制台</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="username">👤 指揮官帳號</label>
            <input
              type="text"
              id="username"
              placeholder="請輸入您的指揮官代號"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">🔐 安全密碼</label>
            <input
              type="password"
              id="password"
              placeholder="請輸入安全驗證密碼"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>

          <button 
            type="submit" 
            className="login-btn"
            disabled={isLoading}
          >
            {isLoading ? '🚀 連接中...' : '🌟 進入控制台'}
          </button>
        </form>

        <div className="login-footer">
          <button 
            type="button"
            className="back-btn"
            onClick={() => navigate('/')}
          >
            回到首頁
          </button>
        </div>
      </div>
    </div>
  );
}

export default AdminLogin;
