import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Heart, MessageCircle } from 'lucide-react';
import { useAuth } from '@/contexts/auth';
import { jsonAuthHeaders } from '@/lib/authToken';
import { thoughtsListQueryOptions } from '@/data/thinkingData';
import { apiUrl } from '@/lib/api';
import { dotDate, parseServerDate } from '@/lib/serverDate';
import { LocaleLink } from '@/i18n/locale-link';
import { usePageTransition } from '@/hooks/usePageTransition';
import { useThoughtReaction } from '@/hooks/useThoughtReaction';
import type { Pt } from '@/store/pageTransition';
import { arcX, createComet, layoutArc, MORPH_MS, REVEAL_MS, type ArcLayout } from './comet';
import type { Thought } from './ThoughtCard';
import './Moments.css';

/* 碎念：彗星沿一條大弧線往上飛，碎念跟在彗尾後面、沿著弧線左右排開。
   最新那一則是彗核，越往下越舊、塵埃越稀；比 FULL 更舊的只剩彗尾上的一個點，滑過才浮出那一則。
   換頁轉場飛進來的那條線，就是彗尾的第一筆（見 store/pageTransition 的 'trail'）。
   admin 可在頂端發文（content + 選填連結 → 後端 unfurl）。 */

const FULL = 12;
const AUTHOR = 'Koimsurai';
/** 彗核在標題下面多遠 */
const HEAD_GAP = 110;

interface Prefill {
  kind?: string;
  title?: string;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function Embed({ th }: { th: Thought }) {
  const ref = th.ref;
  if (!ref || (th.ref_type !== 'link' && th.ref_type !== 'media')) return null;
  const href = (th.ref_type === 'media' ? ref.url : null) ?? th.ref_url ?? undefined;
  // 沒抓到標題就寫網址本身（去掉協定），站名寫在下面一行
  const title = ref.title ?? th.ref_url?.replace(/^https?:\/\//, '') ?? '';
  const meta =
    th.ref_type === 'media'
      ? [ref.kind, ref.year, ref.source].filter((v) => v !== null && v !== '').join(' · ')
      : (ref.site ?? '');
  return (
    <a className="mo-embed" href={href} target="_blank" rel="noopener noreferrer">
      <b>{title}</b>
      {meta && <span>{meta}</span>}
    </a>
  );
}

function MomentPost({ th }: { th: Thought }) {
  const { t } = useTranslation();
  const { likes, reacted, react } = useThoughtReaction(th);
  const date = parseServerDate(th.created_at);
  const [thisYear] = useState(() => new Date().getFullYear());
  return (
    <>
      <div className="mo-post-head">
        <b>{AUTHOR}</b>
        {/* 日期取決於時區，server 與 client 可能差一天 */}
        <LocaleLink to={`/thinking/${th.id}`} className="mo-time">
          <time dateTime={th.created_at} suppressHydrationWarning>
            {dotDate(date, date.getFullYear() === thisYear)}
          </time>
        </LocaleLink>
      </div>
      <p className="mo-text">{th.content}</p>
      <Embed th={th} />
      <div className="mo-act">
        <button
          type="button"
          className={reacted === 'like' ? 'is-on' : undefined}
          aria-pressed={reacted === 'like'}
          aria-label={t('thinking.like')}
          onClick={() => {
            void react('like');
          }}
        >
          <Heart aria-hidden="true" />
          {likes}
        </button>
        <LocaleLink to={`/thinking/${th.id}`} aria-label={t('thinking.comments', { count: th.comment_count })}>
          <MessageCircle aria-hidden="true" />
          {th.comment_count}
        </LocaleLink>
      </div>
    </>
  );
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
  const layoutRef = useRef<ArcLayout | null>(null);
  /** 轉場交過來的那條線（畫面座標，彗核在前）與開始彎的時間；以及彗尾從什麼時候開始長 */
  const growRef = useRef<{ trail: Pt[] | null; at: number } | null>(null);
  const hoverRef = useRef<number | null>(null);

  const origin = (): Pt => {
    const r = pageRef.current?.getBoundingClientRect();
    return { x: r?.left ?? 0, y: r?.top ?? 0 };
  };

  usePageTransition({
    anchor: () => {
      const L = layoutRef.current;
      if (!L) return null;
      const o = origin();
      return { x: o.x + arcX(L, L.y0), y: Math.min(window.innerHeight - 24, Math.max(24, o.y + L.y0)) };
    },
    onGrow: ({ trail }) => {
      growRef.current = { trail: trail.slice().reverse(), at: performance.now() };
      return 'trail';
    },
  });

  // 排版：量每一則的高度，沿著弧線擺好。字型載入、寬度改變、資料變了都重排
  const fullCount = full.length;
  const olderCount = older.length;
  useLayoutEffect(() => {
    const page = pageRef.current;
    const head = headRef.current;
    if (!page || !head) return;
    const place = () => {
      const width = page.clientWidth;
      const top = head.offsetTop + head.offsetHeight + HEAD_GAP;
      const posts = postsRef.current.slice(0, fullCount);
      const L = layoutArc(
        width,
        top,
        posts.map((el) => el?.offsetHeight ?? 0),
        olderCount,
      );
      layoutRef.current = L;
      const at = (el: HTMLElement, x: number, y: number, left: boolean) => {
        const w = el.offsetWidth;
        const raw = left ? x - 26 - w : x + 26;
        el.style.transform = `translate(${Math.max(16, Math.min(width - 16 - w, raw))}px, ${y - 12}px)`;
        el.classList.toggle('is-left', left);
      };
      L.posts.forEach((p, i) => {
        const x = arcX(L, p.y);
        const el = posts[i];
        if (el) at(el, x, p.y, p.left);
        const dot = dotsRef.current[i];
        if (dot) {
          dot.style.left = `${x}px`;
          dot.style.top = `${p.y}px`;
        }
      });
      L.ghosts.forEach((y, k) => {
        const el = ghostsRef.current[k];
        if (!el) return;
        el.style.left = `${arcX(L, y)}px`;
        el.style.top = `${y}px`;
        el.style.setProperty('--fade', (0.9 - (k / Math.max(1, L.ghosts.length)) * 0.75).toFixed(2));
        el.classList.toggle('is-left', !L.narrow && arcX(L, y + 160) < arcX(L, y));
      });
      if (endRef.current) at(endRef.current, arcX(L, L.end.y), L.end.y, L.end.left);
      page.style.height = `${L.height}px`;
      page.classList.add('is-arc');
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(page);
    void (document as { fonts?: FontFaceSet }).fonts?.ready.then(place);
    return () => ro.disconnect();
    // 內容變了但筆數沒變：ResizeObserver 會抓到高度改變
  }, [fullCount, olderCount]);

  // 彗星：每一幀畫彗尾，並把彗尾長到的地方的碎念浮出來
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 轉場還在收上一頁、點還在飛：等它交棒（onGrow）。直接打開這一頁就現在開始長
    if (!growRef.current && root.dataset.pt !== 'out') growRef.current = { trail: null, at: performance.now() };
    const L0 = layoutRef.current;
    const comet = createComet(L0 ? L0.yEnd - L0.y0 : 1600, L0?.narrow ?? false);
    const shown: boolean[] = [];
    let raf = 0;
    let last = 0;
    /** 上一張畫的時候的狀態：沒有 GPU 時長完就不再流動，只在捲動、換大小、滑過時重畫 */
    let drawn = '';

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return [w, h] as const;
    };

    const reveal = (L: ArcLayout, revealY: number) => {
      const items: (HTMLElement | null)[] = [
        ...postsRef.current.slice(0, L.posts.length),
        ...ghostsRef.current.slice(0, L.ghosts.length),
        endRef.current,
      ];
      const ys = [...L.posts.map((p) => p.y), ...L.ghosts, L.end.y];
      items.forEach((el, i) => {
        const on = revealY >= ys[i] - 30;
        if (shown[i] === on || !el) return;
        shown[i] = on;
        el.classList.toggle('is-shown', on);
        const dot = dotsRef.current[i];
        if (i < L.posts.length && dot) dot.classList.toggle('is-shown', on);
      });
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const L = layoutRef.current;
      const grow = growRef.current;
      if (!grow && root.dataset.pt !== 'out') growRef.current = { trail: null, at: now };
      if (!L) return;
      const since = grow ? now - grow.at : -1;
      const busy = since >= 0 && since < Math.max(MORPH_MS, REVEAL_MS);
      // 長完之後 30fps 就夠：塵埃流得很慢
      if (!busy && now - last < 33) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      const o = origin();
      const still = !busy && root.classList.contains('no-gpu');
      const key = `${o.x},${o.y},${window.innerWidth},${window.innerHeight},${hoverRef.current}`;
      if (still && key === drawn) return;
      drawn = key;
      const [w, h] = fit();
      let revealY = -Infinity;
      if (since >= 0) {
        const bottom = h - o.y + 200;
        revealY = since >= REVEAL_MS ? Infinity : L.y0 - 10 + easeOut(since / REVEAL_MS) * (bottom - L.y0);
      }
      reveal(L, revealY);
      comet.draw(
        ctx,
        w,
        h,
        L,
        {
          origin: o,
          hoverY: hoverRef.current,
          revealY,
          morph: grow?.trail && since < MORPH_MS ? { trail: grow.trail, elapsed: Math.max(0, since) } : null,
        },
        still ? 0 : dt,
        now / 1000,
      );
    };

    if (reduce) {
      // 減少動態：不流動、不長，畫一張靜態的，捲動時重畫
      growRef.current = { trail: null, at: -REVEAL_MS };
      const still = () => {
        const L = layoutRef.current;
        if (!L) return;
        const [w, h] = fit();
        reveal(L, Infinity);
        comet.draw(ctx, w, h, L, { origin: origin(), hoverY: null, revealY: Infinity, morph: null }, 0, 0);
      };
      still();
      window.addEventListener('scroll', still, { passive: true });
      window.addEventListener('resize', still);
      return () => {
        window.removeEventListener('scroll', still);
        window.removeEventListener('resize', still);
      };
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [fullCount, olderCount]);

  const hover = (i: number, on: boolean) => {
    hoverRef.current = on ? (layoutRef.current?.posts[i]?.y ?? null) : null;
    dotsRef.current[i]?.classList.toggle('is-on', on);
  };

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
