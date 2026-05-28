import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import './Unsubscribe.css';

const PHASE = {
  loading: 'loading',
  confirm: 'confirm',
  pending: 'pending',
  done: 'done',
  error: 'error',
};

function Unsubscribe() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [phase, setPhase] = useState(PHASE.loading);
  const [subscriber, setSubscriber] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) {
      setPhase(PHASE.error);
      setError(t('unsubscribe.missingToken'));
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
          setError(data.error || t('unsubscribe.invalidLink'));
          return;
        }
        setSubscriber(data);
        // Already unsubscribed → just show the "done" state.
        setPhase(data.status === 'unsubscribed' ? PHASE.done : PHASE.confirm);
      } catch (e) {
        if (cancelled) return;
        setPhase(PHASE.error);
        setError(e.message || t('unsubscribe.noServer'));
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
        throw new Error(data.error || t('unsubscribe.unsubscribeFailed'));
      }
      setPhase(PHASE.done);
    } catch (e) {
      setPhase(PHASE.error);
      setError(e.message || t('unsubscribe.unsubscribeFailed'));
    }
  };

  return (
    <div className="unsubscribe-shell">
      <div className="unsubscribe-card">
        <Link to="/" className="unsubscribe-brand">✦ Koimsurai</Link>

        {phase === PHASE.loading && (
          <p className="unsubscribe-status">{t('unsubscribe.verifying')}</p>
        )}

        {phase === PHASE.confirm && subscriber && (
          <>
            <h1 className="unsubscribe-title">{t('unsubscribe.confirmTitle')}</h1>
            <p className="unsubscribe-body">
              <Trans i18nKey="unsubscribe.bodyConfirm" values={{ email: subscriber.email }} components={{ em: <span className="unsubscribe-email" /> }} />
            </p>
            <div className="unsubscribe-actions">
              <button
                type="button"
                className="unsubscribe-btn unsubscribe-btn--danger"
                onClick={handleConfirm}
              >
                {t('unsubscribe.btnConfirm')}
              </button>
              <Link to="/" className="unsubscribe-btn unsubscribe-btn--ghost">
                {t('unsubscribe.btnKeep')}
              </Link>
            </div>
          </>
        )}

        {phase === PHASE.pending && (
          <p className="unsubscribe-status">{t('unsubscribe.processing')}</p>
        )}

        {phase === PHASE.done && (
          <>
            <h1 className="unsubscribe-title">{t('unsubscribe.successTitle')}</h1>
            <p className="unsubscribe-body">
              {subscriber?.email && (
                <>
                  <Trans i18nKey="unsubscribe.bodyDoneEmail" values={{ email: subscriber.email }} components={{ em: <span className="unsubscribe-email" /> }} />
                  <br />
                </>
              )}
              {t('unsubscribe.bodyDoneFarewell')}
            </p>
            <div className="unsubscribe-actions">
              <Link to="/blog" className="unsubscribe-btn unsubscribe-btn--ghost">
                {t('unsubscribe.viewLatest')}
              </Link>
            </div>
          </>
        )}

        {phase === PHASE.error && (
          <>
            <h1 className="unsubscribe-title">{t('unsubscribe.errorTitle')}</h1>
            <p className="unsubscribe-body">{error}</p>
            <div className="unsubscribe-actions">
              <Link to="/" className="unsubscribe-btn unsubscribe-btn--ghost">
                {t('unsubscribe.btnBackHome')}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Unsubscribe;
