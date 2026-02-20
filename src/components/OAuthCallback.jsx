import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithOAuth } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // provider name
    const provider = state || 'google'; // fallback

    if (!code) {
      setError('登入失敗：未收到授權碼');
      return;
    }

    const redirectUri = `${window.location.origin}/auth/callback`;

    loginWithOAuth(provider, code, redirectUri)
      .then(() => {
        // 回到之前的頁面
        const returnTo = sessionStorage.getItem('oauth_return_to') || '/blog';
        sessionStorage.removeItem('oauth_return_to');
        navigate(returnTo, { replace: true });
      })
      .catch((err) => {
        console.error('OAuth login error:', err);
        setError('登入失敗，請稍後再試');
      });
  }, []);

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: '#fff' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>❌ {error}</p>
          <button onClick={() => navigate('/blog')} style={{ padding: '8px 20px', borderRadius: '8px', background: 'rgba(127,90,240,0.2)', border: '1px solid rgba(127,90,240,0.4)', color: '#c4b5fd', cursor: 'pointer' }}>
            返回手記
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'rgba(255,255,255,0.6)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: '36px', height: '36px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#7f5af0', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
        <p>正在登入...</p>
      </div>
    </div>
  );
}

export default OAuthCallback;
