import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import KoimLoader from './KoimLoader';

function OAuthCallback() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithOAuth } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // provider name
    const provider = state || 'google'; // fallback

    if (!code) {
      setError(t('oauth.errorNoCode'));
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
        setError(t('oauth.errorGeneric'));
      });
  }, []);

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: '#fff' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>❌ {error}</p>
          <button onClick={() => navigate('/blog')} style={{ padding: '8px 20px', borderRadius: '8px', background: 'rgba(127,90,240,0.2)', border: '1px solid rgba(127,90,240,0.4)', color: '#c4b5fd', cursor: 'pointer' }}>
{t('nav.notes')}
          </button>
        </div>
      </div>
    );
  }

  // 統一用站內 KoimLoader（不再用獨立的 spinner）
  return <KoimLoader fullscreen size="lg" text={t('oauth.loggingIn')} />;
}

export default OAuthCallback;
