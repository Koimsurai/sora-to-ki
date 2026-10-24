import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/auth';
import { jsonAuthHeaders } from '@/lib/authToken';
import { thoughtsListQueryOptions } from '@/data/thinkingData';
import { apiUrl } from '@/lib/api';
import { dotDate, parseServerDate } from '@/lib/serverDate';
import { LocaleLink } from '@/i18n/locale-link';
import MomentPost from './MomentPost';
import { clearCometZoomOut, peekCometZoomOut } from './cometZoom';
import { useCometSky } from './useCometSky';
import './Moments.css';

/* 碎念：彗星沿一條大弧線往上飛，碎念跟在彗尾後面、沿著弧線左右排開（blog/useCometSky）。
   最新那一則是彗核，越往下越舊、塵埃越稀；比 FULL 更舊的只剩彗尾上的一個點，滑過才浮出那一則。
   換頁轉場飛進來的那條線，就是彗尾的第一筆（見 store/pageTransition 的 'trail'）。
   admin 可在頂端發文（content + 選填連結 → 後端 unfurl）。 */

const FULL = 12;
/** 彗核在標題下面多遠 */
const HEAD_GAP = 110;

interface Prefill {
  kind?: string;
  title?: string;
}

function Compose() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [prefill, setPrefill] = useState<Prefill | null>(null); // 從 /watch 一鍵發帶來的 media

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('thinking_prefill');
      // sessionStorage 在 server 上不存在 → 只能在 effect 讀（同 Comments 的說明）
      if (raw) {
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setPrefill(JSON.parse(raw) as Prefill);
        sessionStorage.removeItem('thinking_prefill');
      }
    } catch {
      /* ignore */
    }
  }, []);

  const create = useMutation({
    mutationFn: async () => {
      const r = await fetch(apiUrl('/api/admin/thoughts'), {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          content: draft.trim(),
          refUrl: draftUrl.trim() || undefined,
          ref: prefill ? { type: 'media', json: prefill } : undefined,
        }),
      });
      if (!r.ok) throw new Error(`POST /admin/thoughts ${r.status}`);
    },
    onSuccess: () => {
      setDraft('');
      setDraftUrl('');
      setPrefill(null);
      void queryClient.invalidateQueries({ queryKey: thoughtsListQueryOptions.queryKey });
    },
  });

  return (
    <form
      className="mo-compose"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim() && !create.isPending) create.mutate();
      }}
    >
      <textarea placeholder="想到什麼，寫一句…" value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} />
      <input
        type="text"
        placeholder="貼個連結（選填，自動抓預覽）"
        value={draftUrl}
        onChange={(e) => setDraftUrl(e.target.value)}
      />
      {prefill && (
        <div className="mo-compose-chip">
          <span>
            {prefill.kind} · {prefill.title}
          </span>
          <button type="button" onClick={() => setPrefill(null)} aria-label="移除附加">
            ✕
          </button>
        </div>
      )}
      <button type="submit" disabled={create.isPending || !draft.trim()}>
        {create.isPending ? '發送中…' : '發送'}
      </button>
    </form>
  );
}

function Thinking() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
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
        {isAdmin && <Compose />}
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
                  <span>{th.content}</span>
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
