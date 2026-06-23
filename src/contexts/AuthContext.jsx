import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

const TOKEN_KEY = 'koimsurai_user_token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState({ google: { enabled: false }, github: { enabled: false } });

  // 載入 OAuth 提供者設定
  useEffect(() => {
    fetch('/api/auth/providers')
      .then(r => r.json())
      .then(setProviders)
      .catch(() => {});
  }, []);

  // 恢復 session
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setLoading(false); return; }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(u => setUser(u))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false));
  }, []);

  const getToken = useCallback(() => localStorage.getItem(TOKEN_KEY), []);

  const loginWithOAuth = useCallback(async (provider, code, redirectUri) => {
    const res = await fetch(`/api/auth/${provider}/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirectUri }),
    });
    if (!res.ok) throw new Error('Login failed');
    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  }, []);

  // 產生 OAuth 授權 URL
  const getGoogleAuthUrl = useCallback((redirectUri) => {
    const params = new URLSearchParams({
      client_id: providers.google.clientId || '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }, [providers]);

  const getGitHubAuthUrl = useCallback((redirectUri) => {
    const params = new URLSearchParams({
      client_id: providers.github.clientId || '',
      redirect_uri: redirectUri,
      scope: 'read:user user:email',
    });
    return `https://github.com/login/oauth/authorize?${params}`;
  }, [providers]);

  return (
    <AuthContext.Provider value={{
      user, loading, providers,
      getToken, loginWithOAuth, logout,
      getGoogleAuthUrl, getGitHubAuthUrl,
      isLoggedIn: !!user,
      isAdmin: !!user && (user.role === 'ADMIN' || user.role === 'OWNER'),
      isOwner: !!user && user.role === 'OWNER',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
