import { useEffect, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useAuth } from '@/contexts/auth';
import { holdBoot } from '@/store/pageTransition';
import LoginFailed, { type LoginFailure } from './LoginFailed';

// OAuth 落地頁：從 GitHub／Google 授權回來是整頁載入，所以一進來就是開場（點在呼吸、外圈的環照進度畫）。
// 換授權碼的時候讓開場繼續停著（holdBoot），成功就整頁跳回原本那頁：讀者看到的是一段開場接著下一頁的開場，
// 中間沒有另一種載入畫面。失敗了開場才退場，露出 LoginFailed。
// 這一頁自己在登入中什麼都不畫：開場蓋在上面；開場不演的時候（自動化測試）也只是空白一下就跳走。

function OAuthCallback() {
  const search = useRouterState({ select: (s) => s.location.search }) as {
    code?: string;
    state?: string;
    error?: string;
  };
  const { loginWithOAuth, getGitHubAuthUrl, getGoogleAuthUrl } = useAuth();
  const provider = search.state === 'github' ? 'github' : 'google';
  // 網址沒帶 code 是看得出來的事實，不用繞一趟 state；rejected 是登入請求失敗後才知道
  const [rejected, setRejected] = useState(false);
  const failure: LoginFailure | null = !search.code
    ? search.error === 'access_denied'
      ? 'cancelled'
      : 'noCode'
    : rejected
      ? 'rejected'
      : null;

  useEffect(() => {
    const code = search.code;
    if (!code) return;
    const redirectUri = `${window.location.origin}/auth/callback`;
    holdBoot(
      loginWithOAuth(provider, code, redirectUri).then(
        () => {
          const returnTo = sessionStorage.getItem('oauth_return_to') ?? '/blog';
          sessionStorage.removeItem('oauth_return_to');
          window.location.replace(returnTo); // 整頁導回（順便刷新 auth 狀態）
          // 不放開場：頁面正在離開，放了它會在跳走前先退場
          return new Promise<never>(() => undefined);
        },
        (err: unknown) => {
          console.error('OAuth login error:', err);
          setRejected(true);
        },
      ),
    );
    // 刻意只跑一次：OAuth 的 code 是一次性授權碼，effect 重跑等於拿已失效的 code
    // 再送一次登入請求。search/loginWithOAuth 進依賴都會造成這個結果。
    // eslint-disable-next-line @eslint-react/exhaustive-deps
  }, []);

  if (!failure) return null;

  // 再試一次：回原本那個供應者的授權頁（登入前記下的 oauth_return_to 還在，成功後照樣回那一頁）
  const retry = () => {
    const back = `${window.location.origin}/auth/callback`;
    window.location.href =
      provider === 'github' ? `${getGitHubAuthUrl(back)}&state=github` : `${getGoogleAuthUrl(back)}&state=google`;
  };

  return <LoginFailed reason={failure} provider={provider} onRetry={retry} />;
}

export default OAuthCallback;
