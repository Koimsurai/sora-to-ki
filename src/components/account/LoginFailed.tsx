// 登入失敗：開場那一圈沒畫滿。
//
// 登入時讀者看到的是開場（點在呼吸、外圈一道斜環照進度畫，index.css 的 #boot），換授權碼的時候它一直停著
// （store/pageTransition 的 holdBoot）。失敗了開場才退場，這一頁接手：右邊是同一道斜環，只畫到停下的那一步，
// 琥珀點停在斷掉的那一端。開場那顆點退場時照轉場的規則飛過來，落在這一端（anchor）。
// 字在左邊，跟 404（layout/NotFound）同一個版面。
//
// 停在哪一步照實際的情況：在授權頁按了取消、網址沒帶授權碼，都是停在「授權」；
// 授權碼送到了卻換不到身分，是停在「確認身分」，環畫得比較多。
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageTransition } from '@/hooks/usePageTransition';
import './LoginFailed.css';

export type LoginFailure = 'cancelled' | 'noCode' | 'rejected';

/** 環畫到哪裡（0–1）：停在授權、停在確認身分 */
const STOPPED_AT: Record<LoginFailure, number> = { cancelled: 0.34, noCode: 0.34, rejected: 0.71 };

/** 跟開場的環同一個樣子：斜 11.5°、壓扁成 0.408（index.css 的 .boot-arc） */
const TILT = (11.5 * Math.PI) / 180;
const FLAT = 0.408;
const R = 100;

/** 斜環上參數角 t 的那一點（從環的最上面、順時針） */
function onRing(t: number) {
  const a = t * Math.PI * 2 - Math.PI / 2;
  const x = R * Math.cos(a);
  const y = R * FLAT * Math.sin(a);
  return { x: x * Math.cos(TILT) - y * Math.sin(TILT), y: x * Math.sin(TILT) + y * Math.cos(TILT) };
}

function arcPath(to: number) {
  const steps = Math.max(2, Math.round(to * 160));
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const p = onRing((to * i) / steps);
    d += `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }
  return d;
}

const HOSTS = { github: 'github.com', google: 'accounts.google.com' } as const;
const NAMES = { github: 'GitHub', google: 'Google' } as const;

export default function LoginFailed({
  reason,
  provider,
  onRetry,
}: {
  reason: LoginFailure;
  provider: 'github' | 'google';
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const dotRef = useRef<HTMLSpanElement>(null);
  const stop = STOPPED_AT[reason];
  const end = onRing(stop);

  usePageTransition({
    // 開場那顆點落在環斷掉的那一端
    anchor: () => {
      const r = dotRef.current?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    },
  });

  // 回剛才那頁：登入前記下的（讀 sessionStorage 放在點下去的時候，render 不碰它）
  const back = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    window.location.assign(sessionStorage.getItem('oauth_return_to') ?? '/');
  };

  return (
    <div className="lf-page">
      <div className="lf-sky" aria-hidden="true">
        <div className="lf-ring">
          <svg viewBox={`${-R} ${-R} ${R * 2} ${R * 2}`}>
            <ellipse className="lf-ring-base" rx={R} ry={R * FLAT} transform={`rotate(${(TILT * 180) / Math.PI})`} />
            <path className="lf-ring-prog" d={arcPath(stop)} />
          </svg>
          <span
            ref={dotRef}
            className="lf-dot"
            style={{ left: `${50 + (end.x / R) * 50}%`, top: `${50 + (end.y / R) * 50}%` }}
          />
        </div>
      </div>

      <div className="lf-inner">
        <span className="lf-code" aria-hidden="true">
          {NAMES[provider]}
        </span>
        <h1 className="lf-title">{t('oauth.failTitle')}</h1>
        <p className="lf-sub">{t(`oauth.fail.${reason}`, { provider: NAMES[provider] })}</p>

        <p className="lf-meta">
          <span className="lf-meta-label">{t('oauth.from')}</span>
          <code className="lf-meta-value">{HOSTS[provider]}</code>
          <span className="lf-meta-label">{t('oauth.stoppedAt')}</span>
          <b className="lf-meta-value">{t(reason === 'rejected' ? 'oauth.stepVerify' : 'oauth.stepAuthorize')}</b>
        </p>

        <div className="lf-actions">
          <button type="button" className="lf-link" onClick={onRetry}>
            {t('oauth.retry', { provider: NAMES[provider] })}
          </button>
          <a className="lf-link" href="/" onClick={back}>
            {t('oauth.back')}
          </a>
        </div>
      </div>
    </div>
  );
}
