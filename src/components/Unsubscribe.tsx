import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { LocaleLink } from '../locale-link';
import { useTranslation, Trans } from 'react-i18next';
import { subscriberByTokenQueryOptions } from '../newsletterData';
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
  const search = useRouterState({ select: (s) => s.location.search }) as { token?: string };
  const token = search.token;
  // token 驗證讀取改由 TanStack Query（consume 生成 SubscriberByToken）；
  // 退訂 POST 仍是 mutation，用 action 狀態驅動 confirm→pending→done。
  const { data: subscriber, isLoading, isError, error: qError } = useQuery({
    ...subscriberByTokenQueryOptions(token ?? ''),
    enabled: !!token,
  });
  const [action, setAction] = useState<'idle' | 'pending' | 'done' | 'error'>('idle');
  const [actionError, setActionError] = useState('');

  // phase 由 query 狀態 + 使用者動作 derive（動作優先於 query）
  let phase: string;
  if (!token) phase = PHASE.error;
  else if (action === 'pending') phase = PHASE.pending;
  else if (action === 'done') phase = PHASE.done;
  else if (action === 'error') phase = PHASE.error;
  else if (isLoading) phase = PHASE.loading;
  else if (isError) phase = PHASE.error;
  else if (subscriber) phase = subscriber.status === 'unsubscribed' ? PHASE.done : PHASE.confirm;
  else phase = PHASE.loading;

  const error = !token
    ? t('unsubscribe.missingToken')
    : action === 'error'
      ? actionError
      : isError
        ? (qError instanceof Error && qError.message ? qError.message : t('unsubscribe.invalidLink'))
        : '';

  const handleConfirm = async () => {
    setAction('pending');
    try {
      const res = await fetch('/api/newsletter/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? t('unsubscribe.unsubscribeFailed'));
      }
      setAction('done');
    } catch (e) {
      setAction('error');
      setActionError(e instanceof Error ? e.message : t('unsubscribe.unsubscribeFailed'));
    }
  };

  return (
    <div className="unsubscribe-shell">
      <div className="unsubscribe-card">
        <LocaleLink to="/" className="unsubscribe-brand">✦ Koimsurai</LocaleLink>

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
                onClick={() => { void handleConfirm(); }}
              >
                {t('unsubscribe.btnConfirm')}
              </button>
              <LocaleLink to="/" className="unsubscribe-btn unsubscribe-btn--ghost">
                {t('unsubscribe.btnKeep')}
              </LocaleLink>
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
              <LocaleLink to="/blog" className="unsubscribe-btn unsubscribe-btn--ghost">
                {t('unsubscribe.viewLatest')}
              </LocaleLink>
            </div>
          </>
        )}

        {phase === PHASE.error && (
          <>
            <h1 className="unsubscribe-title">{t('unsubscribe.errorTitle')}</h1>
            <p className="unsubscribe-body">{error}</p>
            <div className="unsubscribe-actions">
              <LocaleLink to="/" className="unsubscribe-btn unsubscribe-btn--ghost">
                {t('unsubscribe.btnBackHome')}
              </LocaleLink>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Unsubscribe;
