import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Loader2 } from 'lucide-react';

export const AdminLoginNew = () => {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('adminToken', data.token);
        navigate('/admin/dashboard');
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
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: '#111113' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[rgba(63,63,70,0.5)] bg-[rgba(24,24,27,0.8)]">
            <LayoutDashboard className="h-5 w-5 text-[#a1a1aa]" />
          </div>
          <h1 className="text-xl font-semibold text-[#e4e4e7]">管理後台</h1>
          <p className="mt-1.5 text-sm text-[#71717a]">登入以管理您的內容</p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-[rgba(39,39,42,0.6)] bg-[rgba(24,24,27,0.6)] backdrop-blur-xl p-6 shadow-[0_4px_24px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="mb-5">
            <h2 className="text-base font-medium text-[#e4e4e7]">歡迎回來</h2>
            <p className="mt-1 text-sm text-[#71717a]">輸入您的帳號密碼以登入</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] p-3 text-sm text-[#fca5a5]">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="username" className="text-xs font-medium text-[#a1a1aa]">帳號</label>
              <input
                id="username"
                type="text"
                placeholder="請輸入帳號"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="username"
                className="w-full h-9 rounded-lg border border-[rgba(39,39,42,0.6)] bg-[rgba(24,24,27,0.45)] px-3 text-sm text-[#e4e4e7] placeholder:text-[#52525b] outline-none focus:border-[rgba(82,82,91,0.8)] focus:shadow-[0_0_0_3px_rgba(82,82,91,0.2)] transition-all disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-medium text-[#a1a1aa]">密碼</label>
              <input
                id="password"
                type="password"
                placeholder="請輸入密碼"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="current-password"
                className="w-full h-9 rounded-lg border border-[rgba(39,39,42,0.6)] bg-[rgba(24,24,27,0.45)] px-3 text-sm text-[#e4e4e7] placeholder:text-[#52525b] outline-none focus:border-[rgba(82,82,91,0.8)] focus:shadow-[0_0_0_3px_rgba(82,82,91,0.2)] transition-all disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-9 rounded-lg bg-[rgba(228,228,231,0.12)] border border-[rgba(228,228,231,0.2)] text-sm font-medium text-[#e4e4e7] hover:bg-[rgba(228,228,231,0.18)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ boxShadow: 'none' }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  登入中...
                </>
              ) : (
                '登入'
              )}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-sm text-[#71717a] hover:text-[#a1a1aa] transition-colors bg-transparent border-none shadow-none"
              style={{ background: 'transparent', boxShadow: 'none' }}
            >
              返回首頁
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginNew;
