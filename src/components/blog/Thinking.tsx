import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { thoughtsListQueryOptions } from '@/data/thinkingData';
import { dotDate, parseServerDate } from '@/lib/serverDate';
import { thoughtLine } from '@/lib/thoughtRef';
import { LocaleLink } from '@/i18n/locale-link';
import MomentPost from './MomentPost';
import { clearCometZoomOut, peekCometZoomOut } from './cometZoom';
import { useCometSky } from './useCometSky';
import './Moments.css';

/* 碎念：彗星沿一條大弧線往上飛，碎念跟在彗尾後面、沿著弧線左右排開（blog/useCometSky）。
   最新那一則是彗核，越往下越舊、塵埃越稀；比 FULL 更舊的只剩彗尾上的一個點，滑過才浮出那一則。
   換頁轉場飛進來的那條線，就是彗尾的第一筆（見 store/pageTransition 的 'trail'）。
   發文在後台（/admin/thoughts），那裡可以從同步進來的紀錄附上作品。 */

const FULL = 12;
/** 彗核在標題下面多遠 */
const HEAD_GAP = 110;

function Thinking() {
  const { t } = useTranslation();
  // route loader 已 prefetch → SSR baked、hydrate 後 useQuery 讀快取
  const { data: thoughts = [] } = useQuery(thoughtsListQueryOptions);
  const full = thoughts.slice(0, FULL);
  const older = thoughts.slice(FULL);

  const pageRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const postsRef = useRef<(HTMLLIElement | null)[]>([]);
  const dotsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const ghostsRef = useRef<(HTMLLIElement | null)[]>([]);
  const endRef = useRef<HTMLParagraphElement>(null);
  // 從單則頁回來：一開始停在那一則放大的那一段，再拉遠回整條彗星
  const [back] = useState(() => {
    const out = peekCometZoomOut();
    if (!out) return null;
    const post = full.findIndex((th) => String(th.id) === out.id);
    const ghost = older.findIndex((th) => String(th.id) === out.id);
    if (post < 0 && ghost < 0) return null;
    return { post: post >= 0 ? post : null, ghost: ghost >= 0 ? ghost : null, T: out.T };
  });
  useEffect(() => clearCometZoomOut(), []);
  const hover = useCometSky(
    { pageRef, headRef, canvasRef, postsRef, dotsRef, ghostsRef, endRef },
    full.length,
    older.length,
    {
      headGap: HEAD_GAP,
      zoomFrom: back,
      // 點進一則碎念：往它在彗尾上的那一段放大進去（單則頁接著看那一段）
      zoomTarget: (to) => {
        const id = /^thinking\/(\d+)$/.exec(to)?.[1];
        if (!id) return null;
        const post = full.findIndex((th) => String(th.id) === id);
        const ghost = older.findIndex((th) => String(th.id) === id);
        if (post < 0 && ghost < 0) return null;
        return { id, post: post >= 0 ? post : null, ghost: ghost >= 0 ? ghost : null };
      },
    },
  );

  return (
    <div className="mo" ref={pageRef}>
      <canvas className="mo-comet" ref={canvasRef} aria-hidden="true" />

      <header className="mo-head" ref={headRef}>
        <div className="mo-title">
          <h1>{t('thinking.title')}</h1>
          {t('thinking.label') && <span className="mo-label">{t('thinking.label')}</span>}
          <a className="mo-rss" href="/api/thoughts/rss" target="_blank" rel="noopener noreferrer">
            RSS
          </a>
        </div>
        <p>{t('thinking.subtitle')}</p>
      </header>

      <div className="mo-dots" aria-hidden="true">
        {full.map((th, i) => (
          <span
            key={th.id}
            className={i === 0 ? 'mo-dot is-new' : 'mo-dot'}
            ref={(el) => {
              dotsRef.current[i] = el;
            }}
          />
        ))}
      </div>

      <ol className="mo-list">
        {full.map((th, i) => (
          <li
            key={th.id}
            className="mo-post"
            ref={(el) => {
              postsRef.current[i] = el;
            }}
            onPointerEnter={() => hover(i, true)}
            onPointerLeave={() => hover(i, false)}
          >
            <MomentPost th={th} />
          </li>
        ))}
      </ol>

      {older.length > 0 && (
        <ol className="mo-ghosts" aria-label={t('thinking.older')}>
          {older.map((th, k) => (
            <li
              key={th.id}
              className="mo-ghost"
              ref={(el) => {
                ghostsRef.current[k] = el;
              }}
            >
              <LocaleLink to={`/thinking/${th.id}`}>
                <span className="mo-ghost-card">
                  <time dateTime={th.created_at} suppressHydrationWarning>
                    {dotDate(parseServerDate(th.created_at))}
                  </time>
                  <span>{th.content.trim() || thoughtLine(th)}</span>
                </span>
              </LocaleLink>
            </li>
          ))}
        </ol>
      )}

      <p className="mo-end" ref={endRef}>
        {thoughts.length ? t('thinking.ending') : t('thinking.empty')}
      </p>
    </div>
  );
}

export default Thinking;
