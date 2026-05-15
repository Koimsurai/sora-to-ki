import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import './Unsubscribe.css';

const PHASE = {
  loading: 'loading',
  confirm: 'confirm',
  pending: 'pending',
  done: 'done',
  error: 'error',
};

function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [phase, setPhase] = useState(PHASE.loading);
  const [subscriber, setSubscriber] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setPhase(PHASE.error);
      setError('連結缺少 token，請點電子報底部的退訂連結。');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/newsletter/by-token/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setPhase(PHASE.error);
          setError(data.error || '連結無效或已過期。');
          return;
        }
        setSubscriber(data);
        // Already unsubscribed → just show the "done" state.
        setPhase(data.status === 'unsubscribed' ? PHASE.done : PHASE.confirm);
      } catch (e) {
        if (cancelled) return;
        setPhase(PHASE.error);
        setError(e.message || '無法連線到伺服器。');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleConfirm = async () => {
    setPhase(PHASE.pending);
    try {
      const res = await fetch('/api/newsletter/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '退訂失敗');
      }
      setPhase(PHASE.done);
    } catch (e) {
      setPhase(PHASE.error);
      setError(e.message || '退訂失敗');
    }
  };

  return (
    <div className="unsubscribe-shell">
      <div className="unsubscribe-card">
        <Link to="/" className="unsubscribe-brand">✦ Koimsurai</Link>

        {phase === PHASE.loading && (
          <p className="unsubscribe-status">驗證連結中…</p>
        )}

        {phase === PHASE.confirm && subscriber && (
          <>
            <h1 className="unsubscribe-title">確認退訂?</h1>
            <p className="unsubscribe-body">
              你正在用 <span className="unsubscribe-email">{subscriber.email}</span> 退訂 Koimsurai 電子報。
              <br />
              退訂後，未來新文章不會再寄到你的信箱。
            </p>
            <div className="unsubscribe-actions">
              <button
                type="button"
                className="unsubscribe-btn unsubscribe-btn--danger"
                onClick={handleConfirm}
              >
                確認退訂
              </button>
              <Link to="/" className="unsubscribe-btn unsubscribe-btn--ghost">
                算了，留下來
              </Link>
            </div>
          </>
        )}

        {phase === PHASE.pending && (
          <p className="unsubscribe-status">處理中…</p>
        )}

        {phase === PHASE.done && (
          <>
            <h1 className="unsubscribe-title">已退訂 ✓</h1>
            <p className="unsubscribe-body">
              {subscriber?.email && (
                <>
                  <span className="unsubscribe-email">{subscriber.email}</span> 已從訂閱列表中移除。
                  <br />
                </>
              )}
              抱歉沒能繼續陪你，未來想回來隨時都歡迎。
            </p>
            <div className="unsubscribe-actions">
              <Link to="/blog" className="unsubscribe-btn unsubscribe-btn--ghost">
                看看最近的文章 →
              </Link>
            </div>
          </>
        )}

        {phase === PHASE.error && (
          <>
            <h1 className="unsubscribe-title">出了一點問題</h1>
            <p className="unsubscribe-body">{error}</p>
            <div className="unsubscribe-actions">
              <Link to="/" className="unsubscribe-btn unsubscribe-btn--ghost">
                回首頁
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Unsubscribe;
