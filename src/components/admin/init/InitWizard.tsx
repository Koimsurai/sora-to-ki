import { useEffect, useState, type ReactNode } from 'react';
import { useSearch } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { InitStatus } from '@koimsurai/api-types';

import { useAuth, type User } from '@/contexts/auth';
import { siteConfigQueryOptions } from '@/data/siteConfig';
import { adminLang, useAdminT } from '@/i18n/admin-i18n';
import { apiErrorText } from '@/lib/apiError';
import { jsonAuthHeaders } from '@/lib/authToken';
import { SUPPORTED_LOCALES } from '@/lib/locales';
import { sameTitle } from '@/lib/pageTitle';
import AdminLangSwitch from '../AdminLangSwitch';
import AdminLoading from '../AdminLoading';
import OrbitPreview from '../site/OrbitPreview';
import { IdentityFields, LocaleFields, PageToggles, SiteField } from '../site/SiteFields';
import { TOGGLE_GROUPS, draftOf, siteProblems, type Draft } from '../site/siteDraft';
import OAuthGuide from './OAuthGuide';
import { STEPS, clearSession, readSession, writeSession, type Step } from './initSession';
import './InitWizard.css';

// 初次設定（/admin/init）：還沒有站長的全新站台，從這裡認領站長、選語系、填站名、決定要開哪些頁面。
//
//   設定碼 → 認領站長 → 語言 → 站台 → 頁面 → 完成
//
// 設定碼印在後端的 log（handlers/init.rs），證明你是架站的人。認領要先用 GitHub／Google 登入，
// 所以「站長」排在最前面：認領之後就是站長了，後面三步直接用一般的站台設定 API 存
// （跟後台的站台設定頁同一支），精靈本身不需要另一套寫入的路。欄位也跟站台設定頁共用（site/SiteFields）。
// 左邊是表單，右邊是首頁軌道的示意圖（OrbitPreview），完成那一步換成真的首頁。

type Phase = 'loading' | 'open' | 'closed';

const isAdminRole = (u: User | null) => u?.role === 'OWNER' || u?.role === 'ADMIN';
const ownerOf = (u: User | null) =>
  u ? { name: u.displayName ?? u.display_name ?? u.name ?? u.login ?? '', avatar: u.avatar ?? u.avatar_url } : null;

/** 一開始停在哪一步：還沒有站長就從設定碼或認領開始；已經認領了，接著上次走到的地方 */
function startStep(needed: boolean, user: User | null): Step | null {
  const s = readSession();
  if (needed) return s.code ? 'owner' : 'gate';
  if (!isAdminRole(user) || !s.step) return null;
  return s.step === 'gate' || s.step === 'owner' ? 'lang' : s.step;
}

function PageHead({ kicker, title, latin, lede }: { kicker?: string; title: string; latin: string; lede: string }) {
  return (
    <>
      {kicker && <p className="wz-kicker">{kicker}</p>}
      <div className="wz-h">
        <h1>{title}</h1>
        {!sameTitle(title, latin) && <span lang="en">{latin}</span>}
      </div>
      <p className="wz-lede">{lede}</p>
    </>
  );
}

export default function InitWizard() {
  const { t } = useAdminT();
  const search: { code?: unknown } = useSearch({ strict: false });
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { data: config } = useQuery(siteConfigQueryOptions);
  const [phase, setPhase] = useState<Phase>('loading');
  const [step, setStep] = useState<Step>('gate');
  // 改過才有自己的一份；沒改過就是從現在的站台設定算出來的起點
  const [edited, setEdited] = useState<Draft | null>(() => readSession().draft ?? null);
  // 預設語系先猜站長自己用的語言
  const draft = edited ?? (config ? draftOf(config, adminLang()) : null);
  const [code, setCode] = useState(() => (typeof search.code === 'string' ? search.code : (readSession().code ?? '')));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hot, setHot] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    document.title = t('init.pageTitle');
  }, [t]);

  // 開始之前先問後端：還需不需要初次設定。登入狀態要先確定（認領完的人重新整理會走到這裡）
  useEffect(() => {
    if (auth.loading) return;
    const ac = new AbortController();
    void fetch('/api/init/status', { signal: ac.signal })
      .then((r) => (r.ok ? (r.json() as Promise<InitStatus>) : Promise.reject(new Error(String(r.status)))))
      .then((s) => {
        const first = startStep(s.needed, auth.user);
        if (first) setStep(first);
        setPhase(first ? 'open' : 'closed');
      })
      .catch(() => !ac.signal.aborted && setError(t('init.networkError')));
    return () => ac.abort();
    // 只在登入狀態確定的那一刻決定一次
    // eslint-disable-next-line @eslint-react/exhaustive-deps
  }, [auth.loading]);

  useEffect(() => {
    if (phase === 'open') writeSession({ step, ...(edited ? { draft: edited } : {}) });
  }, [phase, step, edited]);

  const go = (next: Step) => {
    setError('');
    setTouched(false);
    setStep(next);
  };
  const patch = (p: Partial<Draft>) => draft && setEdited({ ...draft, ...p });
  const url = config?.url ?? window.location.origin;

  if (phase === 'loading' || !draft) {
    return error ? <p className="wz-fatal">{error}</p> : <AdminLoading page />;
  }

  // ── 各步 ──

  const checkCode = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/init/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (res.status === 409) setPhase('closed');
      else if (!res.ok) setError(t('init.gate.badCode'));
      else {
        writeSession({ code: code.trim() });
        go('owner');
      }
    } catch {
      setError(t('init.networkError'));
    } finally {
      setBusy(false);
    }
  };

  const claim = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/init/claim', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ code: readSession().code ?? '' }),
      });
      if (res.ok) {
        go('lang');
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      if (body.code === 'bad_code') writeSession({ code: '' });
      setError(t(`init.owner.errors.${body.code ?? 'not_signed_in'}`, { defaultValue: t('init.networkError') }));
    } catch {
      setError(t('init.networkError'));
    } finally {
      setBusy(false);
    }
  };

  const signIn = (provider: 'github' | 'google') => {
    sessionStorage.setItem('oauth_return_to', '/admin/init');
    writeSession({ step: 'owner' });
    const make = provider === 'github' ? auth.getGitHubAuthUrl : auth.getGoogleAuthUrl;
    window.location.assign(`${make(`${window.location.origin}/auth/callback`)}&state=${provider}`);
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/site/config', {
        method: 'PUT',
        headers: jsonAuthHeaders(),
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        setError(apiErrorText(await res.json().catch(() => ({})), t, 'errors', t('init.networkError')));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: siteConfigQueryOptions.queryKey });
      go('done');
    } catch {
      setError(t('init.networkError'));
    } finally {
      setBusy(false);
    }
  };

  const providers = (['github', 'google'] as const).map((p) => ({
    key: p,
    label: p === 'github' ? 'GitHub' : 'Google',
    enabled: auth.providers[p].enabled,
  }));
  const anyEnabled = providers.some((p) => p.enabled);

  let body: ReactNode;
  let foot: ReactNode;

  if (phase === 'closed') {
    body = <PageHead title={t('init.closed.title')} latin={t('init.closed.latin')} lede={t('init.closed.lede')} />;
    foot = (
      <a className="wz-btn wz-btn-go" href="/">
        {t('init.closed.home')}
      </a>
    );
  } else if (step === 'gate') {
    body = (
      <>
        <PageHead
          kicker={t('init.gate.kicker')}
          title={t('init.gate.title')}
          latin={t('init.gate.latin')}
          lede={t('init.gate.lede')}
        />
        <p className="wz-label">{t('init.gate.runOnHost')}</p>
        <pre className="wz-cmd">
          <span className="wz-dim">$ </span>docker compose logs backend-rs | grep setup
        </pre>
        <p className="wz-label">{t('init.gate.logLooksLike')}</p>
        <pre className="wz-cmd wz-cmd-soft">setup: open {url}/admin/init?code=XXXX-XXXX to claim this site</pre>
        <SiteField label={t('init.gate.codeLabel')} error={error}>
          <input
            className="wz-input wz-code"
            value={code}
            autoComplete="off"
            spellCheck={false}
            placeholder="XXXX-XXXX"
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && code.trim() && void checkCode()}
          />
        </SiteField>
        <p className="wz-hint">{t('init.gate.envHint')}</p>
      </>
    );
    foot = (
      <button
        type="button"
        className="wz-btn wz-btn-go"
        disabled={busy || !code.trim()}
        onClick={() => void checkCode()}
      >
        {busy ? t('init.gate.checking') : t('init.gate.start')}
      </button>
    );
  } else if (step === 'owner') {
    const me = auth.user;
    body = (
      <>
        <PageHead title={t('init.owner.title')} latin={t('init.owner.latin')} lede={t('init.owner.lede')} />
        {me ? (
          <div className="wz-me">
            {me.avatar && <img src={me.avatar} alt="" width={36} height={36} />}
            <div>
              <p className="wz-label">{t('init.owner.signedInAs')}</p>
              <p className="wz-me-name">
                {ownerOf(me)?.name} <span className="wz-dim">· {me.provider}</span>
              </p>
            </div>
            <button type="button" className="wz-btn wz-btn-ghost" onClick={auth.logout}>
              {t('init.owner.switchAccount')}
            </button>
          </div>
        ) : (
          <div className="wz-providers">
            {providers.map((p) =>
              p.enabled ? (
                <button key={p.key} type="button" className="wz-btn" onClick={() => signIn(p.key)}>
                  {t('init.owner.signInWith', { provider: p.label })}
                </button>
              ) : (
                <span key={p.key} className="wz-btn wz-btn-off">
                  {p.label} · {t('init.owner.notConfigured')}
                </span>
              ),
            )}
          </div>
        )}
        {error && <p className="wz-error">{error}</p>}
        {!me && (
          <>
            <p className="wz-hint">{anyEnabled ? t('init.owner.oneMore') : t('init.owner.noneConfigured')}</p>
            <p className="wz-hint">{t('init.owner.siteUrl', { url })}</p>
            {providers
              .filter((p) => !p.enabled)
              .map((p) => (
                <details key={p.key} className="wz-details" open={!anyEnabled && p.key === 'github'}>
                  <summary>{t(`init.owner.guide.${p.key}.title`)}</summary>
                  <OAuthGuide provider={p.key} url={url} />
                </details>
              ))}
          </>
        )}
      </>
    );
    foot = (
      <>
        <button type="button" className="wz-btn wz-btn-ghost" onClick={() => go('gate')}>
          {t('init.back')}
        </button>
        {me && (
          <button type="button" className="wz-btn wz-btn-go" disabled={busy} onClick={() => void claim()}>
            {busy ? t('init.owner.claiming') : t('init.owner.claim')}
          </button>
        )}
      </>
    );
  } else if (step === 'lang') {
    body = (
      <>
        <PageHead title={t('init.lang.title')} latin={t('init.lang.latin')} lede={t('init.lang.lede')} />
        <LocaleFields draft={draft} patch={patch} />
      </>
    );
    foot = (
      <>
        <span />
        <button type="button" className="wz-btn wz-btn-go" onClick={() => go('site')}>
          {t('init.next')}
        </button>
      </>
    );
  } else if (step === 'site') {
    body = (
      <>
        <PageHead title={t('init.site.title')} latin={t('init.site.latin')} lede={t('init.site.lede')} />
        <IdentityFields draft={draft} patch={patch} url={url} touched={touched} />
      </>
    );
    foot = (
      <>
        <button type="button" className="wz-btn wz-btn-ghost" onClick={() => go('lang')}>
          {t('init.back')}
        </button>
        <button
          type="button"
          className="wz-btn wz-btn-go"
          onClick={() => {
            setTouched(true);
            if (siteProblems(draft).length === 0) go('pages');
          }}
        >
          {t('init.next')}
        </button>
      </>
    );
  } else if (step === 'pages') {
    body = (
      <>
        <PageHead title={t('init.pages.title')} latin={t('init.pages.latin')} lede={t('init.pages.lede')} />
        <PageToggles draft={draft} patch={patch} hot={hot} onHot={setHot} />
        {error && <p className="wz-error">{error}</p>}
      </>
    );
    foot = (
      <>
        <button type="button" className="wz-btn wz-btn-ghost" onClick={() => go('site')}>
          {t('init.back')}
        </button>
        <button type="button" className="wz-btn wz-btn-go" disabled={busy} onClick={() => void save()}>
          {busy ? t('init.saving') : t('init.finish')}
        </button>
      </>
    );
  } else {
    // 不用 Intl.ListFormat：語言名各用自己的文字寫，混在一起時它會插進「和」「and」，讀起來很怪
    const list = { format: (xs: string[]) => xs.join(t('init.done.listSep')) };
    const offNames = draft.disabled_pages.map((k) => t(`site.pages.name.${k}`));
    const total = TOGGLE_GROUPS.flatMap((g) => g.items).length;
    const enabled = SUPPORTED_LOCALES.filter((l) => l === draft.default_locale || draft.locales.includes(l));
    const leave = (to: string) => {
      clearSession();
      // 整頁換過去：後台的權限檢查要重新讀一次登入狀態（剛認領，記憶體裡的還是讀者）
      window.location.assign(to);
    };
    body = (
      <>
        <PageHead
          kicker={t('init.done.kicker')}
          title={t('init.done.title')}
          latin={t('init.done.latin')}
          lede={t('init.done.lede')}
        />
        <dl className="wz-sum">
          <dt>{t('init.done.summaryName')}</dt>
          <dd>{[draft.name.trim(), draft.author.trim()].filter(Boolean).join(' · ')}</dd>
          <dt>{t('init.done.summaryLocales')}</dt>
          <dd>
            {list.format(
              enabled.map(
                (l) =>
                  `${t(`layout.languageName.${l}`)}${l === draft.default_locale ? t('init.done.defaultMark') : ''}`,
              ),
            )}
          </dd>
          {auth.user && (
            <>
              <dt>{t('init.done.summaryOwner')}</dt>
              <dd>{ownerOf(auth.user)?.name}</dd>
            </>
          )}
          <dt>{t('init.done.summaryPages')}</dt>
          <dd>
            {t('init.done.pagesOn', { on: total - offNames.length })}
            {offNames.length > 0 && t('init.done.pagesOff', { list: list.format(offNames) })}
          </dd>
        </dl>
      </>
    );
    foot = (
      <>
        <button type="button" className="wz-btn" onClick={() => leave('/')}>
          {t('init.done.viewSite')}
        </button>
        <button type="button" className="wz-btn wz-btn-go" onClick={() => leave('/admin')}>
          {t('init.done.toAdmin')}
        </button>
      </>
    );
  }

  const at = STEPS.indexOf(step as (typeof STEPS)[number]);

  return (
    <div className="wz">
      <section className="wz-form">
        <header className="wz-top">
          <p className="wz-mark">
            <span lang="en">sora to ki</span>
            <small>{t('init.brand')}</small>
          </p>
          <AdminLangSwitch />
        </header>
        {phase === 'open' && at >= 0 && (
          <ol className="wz-steps" aria-label={t('init.stepsLabel')}>
            {STEPS.map((s, i) => (
              <li
                key={s}
                className={i < at ? 'is-done' : i === at ? 'is-now' : ''}
                aria-current={i === at ? 'step' : undefined}
              >
                <i aria-hidden="true" />
                {String(i + 1).padStart(2, '0')}
                {i === at ? (
                  <span> {t(`init.step.${s}`)}</span>
                ) : (
                  <span className="sr-only">{t(`init.step.${s}`)}</span>
                )}
              </li>
            ))}
          </ol>
        )}
        <div className="wz-body">{body}</div>
        <footer className="wz-foot">{foot}</footer>
      </section>
      {phase === 'open' && step === 'done' ? (
        <div className="wz-sky wz-sky-live">
          <iframe src="/" title={t('init.done.previewTitle')} />
        </div>
      ) : (
        <OrbitPreview
          step={phase === 'closed' ? 'done' : step}
          draft={draft}
          hot={hot}
          owner={step === 'gate' || step === 'owner' ? null : ownerOf(auth.user)}
          url={url}
        />
      )}
    </div>
  );
}
