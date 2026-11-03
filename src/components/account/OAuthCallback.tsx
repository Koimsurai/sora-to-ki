import { useEffect, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/auth';
import KoimLoader from '@/components/common/KoimLoader';
import './OAuthCallback.css';

function OAuthCallback() {
  const { t } = useTranslation();
  const search = useRouterState({ select: (s) => s.location.search }) as { code?: string; state?: string };
  const { loginWithOAuth } = useAuth();
  // 「網址沒帶 code」是純粹從 props 看得出來的事實，不需要繞一趟 state：
  // 原本在 effect 裡 setError，等於先繪一次 loading 畫面、effect 再補繪成錯誤畫面。
  // asyncError 才是真狀態（登入請求失敗後才知道）。
  const [asyncError, setAsyncError] = useState('');
  /** 失敗時「回去」連到哪：登入前記下的那一頁，沒有就首頁 */
  const [back, setBack] = useState('/');
  const error = search.code ? asyncError : t('oauth.errorNoCode');

  useEffect(() => {
    const code = search.code;
    const state = search.state; // provider name
    const provider = state ?? 'google'; // fallback

    if (!code) return;

    const redirectUri = `${window.location.origin}/auth/callback`;

    void loginWithOAuth(provider, code, redirectUri)
      .then(() => {
        // 回到之前的頁面
        const returnTo = sessionStorage.getItem('oauth_return_to') ?? '/blog';
        sessionStorage.removeItem('oauth_return_to');
        window.location.replace(returnTo); // 登入後整頁導回（順便刷新 auth 狀態）
      })
      .catch((err: unknown) => {
        console.error('OAuth login error:', err);
        setBack(sessionStorage.getItem('oauth_return_to') ?? '/');
        setAsyncError(t('oauth.errorGeneric'));
      });
    // 刻意只跑一次：OAuth 的 code 是一次性授權碼，effect 重跑等於拿已失效的 code
    // 再送一次登入請求。search/t/loginWithOAuth 進依賴都會造成這個結果。
    // eslint-disable-next-line @eslint-react/exhaustive-deps
  }, []);

  if (error) {
    // 跟 404、退訂頁同一套（2026-10 翻新）：字靠左，叉號配 --danger，回去的連結是等寬字加點線底線
    return (
      <div className="oauth-shell">
        <p className="oauth-error">
          <b aria-hidden="true">✕</b>
          {error}
        </p>
        <a className="oauth-back" href={back}>
          {t('oauth.back')}
        </a>
      </div>
    );
  }

  return <KoimLoader fullscreen size="lg" text={t('oauth.loggingIn')} />;
}

export default OAuthCallback;
