// 文末的回應：一小塊夜空，三種回應各聚成一團星座，每一個回應是裡面的一顆星。
// 按一下，琥珀點從按鈕飛上去，落進那一團變成新的一顆；再按一下收回，那顆星淡掉。
// 還沒有人按的位置是空心的小圈（預留的位置），一團至少畫出幾個，沒人按的時候也不會空一塊。
// 資料沿用原本的 emoji 反應（post_reactions），六種歸成三團：喜歡 ❤️😂🎉、有幫助 👍🚀、想知道更多 🤔，
// 按下去送的是那一團的第一個；舊的數字照樣算進各自那一團。數量與自己按過哪些由文章頁的 useReactions 傳進來。
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { onPalette, palette } from '@/lib/palette';
import './ReactionSky.css';

let { paper: INK, amber: AMBER } = palette();
// 主題在頁面開著時換了就跟著換（lib/theme 的 setTheme）
onPalette((p) => {
  ({ paper: INK, amber: AMBER } = p);
});
const TAU = Math.PI * 2;

/** 三團星座：[翻譯 key, 這一團收哪些 emoji（第一個是按下去送的那個）] */
const GROUPS: [string, string[]][] = [
  ['like', ['❤️', '😂', '🎉']],
  ['helpful', ['👍', '🚀']],
  ['more', ['🤔']],
];
/** 一團最多畫幾顆（再多只是數字變大） */
const MAX_STARS = 60;
/** 一團至少畫出幾個位置：還沒亮的是空心的小圈，像星圖上預留的位置 */
const SLOTS = 9;
/** 琥珀點飛上去要多久（毫秒） */
const FLIGHT_MS = 750;
/** 收回時那顆星淡掉要多久（毫秒） */
const FADE_MS = 450;

/** 第 k 顆星在那一團裡的位置（相對團的中心）：黃金角繞出去，加一點固定的抖動，看起來像星座不像格子 */
function starAt(k: number, seed: number): [number, number] {
  const a = k * 2.399963 + seed;
  const r = 5 + Math.sqrt(k) * 9;
  const jx = Math.sin(k * 12.9898 + seed * 7) * 4;
  const jy = Math.cos(k * 78.233 + seed * 3) * 3;
  return [Math.cos(a) * r * 1.5 + jx, Math.sin(a) * r * 0.7 + jy];
}

/** 第 g 團的中心：三團平均排開，各在自己按鈕的正上方 */
const centerOf = (g: number, w: number, h: number) => ({ x: (w * (g * 2 + 1)) / 6, y: h * 0.48 });

interface Props {
  counts: Record<string, number>;
  mine: Set<string>;
  toggle: (emoji: string) => void;
}

export default function ReactionSky({ counts, mine, toggle }: Props) {
  const { t } = useTranslation();
  const totals = GROUPS.map(([, emojis]) => emojis.reduce((s, e) => s + (counts[e] ?? 0), 0));
  const minesOf = GROUPS.map(([, emojis]) => emojis.filter((e) => mine.has(e)));

  const boxRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const totalsRef = useRef(totals);
  totalsRef.current = totals;
  /** 正在飛的琥珀點：哪一團、從哪裡出發（畫布座標）、什麼時候出發 */
  const flightsRef = useRef<{ g: number; x: number; y: number; at: number }[]>([]);
  /** 正在淡掉的星：哪一團、第幾顆、什麼時候開始 */
  const fadesRef = useRef<{ g: number; k: number; at: number }[]>([]);
  /** 最近一顆落地的星（琥珀色，直到下一顆）：哪一團、第幾顆、落地的時間 */
  const landedRef = useRef<{ g: number; k: number; at: number } | null>(null);

  const press = (g: number) => {
    const [, emojis] = GROUPS[g];
    const box = boxRef.current;
    const btn = buttonsRef.current[g];
    if (minesOf[g].length) {
      // 收回：自己按過的那幾個都收掉，最後一顆星淡掉
      fadesRef.current.push({ g, k: Math.max(0, totals[g] - 1), at: performance.now() });
      if (landedRef.current?.g === g) landedRef.current = null;
      for (const e of minesOf[g]) toggle(e);
      return;
    }
    if (box && btn) {
      const b = box.getBoundingClientRect();
      const r = btn.getBoundingClientRect();
      flightsRef.current.push({ g, x: r.left + r.width / 2 - b.left, y: r.top - b.top, at: performance.now() });
    }
    toggle(emojis[0]);
  };

  useEffect(() => {
    const box = boxRef.current;
    const cv = cvRef.current;
    const ctx = cv?.getContext('2d');
    if (!box || !cv || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(box);
    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible) return;
      const busy = flightsRef.current.length > 0 || fadesRef.current.length > 0;
      // 平常只是微微閃，30fps 就夠
      if (!busy && now - last < 33) return;
      last = now;
      const w = box.clientWidth;
      const h = cv.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const tt = reduce ? 0 : now / 1000;
      flightsRef.current = flightsRef.current.filter((f) => now - f.at < FLIGHT_MS);
      fadesRef.current = fadesRef.current.filter((f) => now - f.at < FADE_MS);

      totalsRef.current.forEach((total, g) => {
        const c = centerOf(g, w, h);
        // 還在飛的那顆先不畫在團裡：落地那一刻才出現
        const flying = flightsRef.current.filter((f) => f.g === g).length;
        const n = Math.min(MAX_STARS, Math.max(0, total - flying));
        const fading = fadesRef.current.find((f) => f.g === g);
        const lit = n + (fading ? 1 : 0);
        // 還沒亮的預留位置也算進來：一團至少 SLOTS 個點，沒人按的時候也看得出那裡是一團星座
        const pts = Array.from({ length: Math.max(lit, SLOTS) }, (_, k) => starAt(k, g * 1.7));
        // 星座的線：每一顆連到離它最近的、比它早的那一顆，長成一棵樹，線不會交叉成一團；
        // 連到還沒亮的位置的那幾條是很淡的點線
        ctx.lineWidth = 1;
        for (let k = 1; k < pts.length; k++) {
          let near = 0;
          let best = Infinity;
          for (let j = 0; j < k; j++) {
            const d = Math.hypot(pts[k][0] - pts[j][0], pts[k][1] - pts[j][1]);
            if (d < best) {
              best = d;
              near = j;
            }
          }
          const ghost = k >= lit;
          ctx.setLineDash(ghost ? [1, 3] : []);
          ctx.strokeStyle = `rgba(${INK}, ${ghost ? 0.2 : 0.16})`;
          ctx.beginPath();
          ctx.moveTo(c.x + pts[near][0], c.y + pts[near][1]);
          ctx.lineTo(c.x + pts[k][0], c.y + pts[k][1]);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        for (let k = lit; k < pts.length; k++) {
          ctx.strokeStyle = `rgba(${INK}, 0.4)`;
          ctx.beginPath();
          ctx.arc(c.x + pts[k][0], c.y + pts[k][1], 2, 0, TAU);
          ctx.stroke();
        }
        pts.length = lit;
        pts.forEach(([x, y], k) => {
          const fadeA = fading && k === pts.length - 1 ? 1 - (now - fading.at) / FADE_MS : 1;
          const tw = 0.65 + 0.35 * Math.sin(tt * 1.3 + k * 1.9 + g);
          const lit = landedRef.current?.g === g && landedRef.current.k === k;
          if (lit) {
            const age = (now - (landedRef.current?.at ?? now)) / 1000;
            const glow = ctx.createRadialGradient(c.x + x, c.y + y, 0, c.x + x, c.y + y, 10);
            glow.addColorStop(0, `rgba(${AMBER}, ${0.5 * Math.max(0.35, 1 - age)})`);
            glow.addColorStop(1, `rgba(${AMBER}, 0)`);
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(c.x + x, c.y + y, 10, 0, TAU);
            ctx.fill();
            ctx.fillStyle = `rgb(${AMBER})`;
          } else ctx.fillStyle = `rgba(${INK}, ${0.85 * tw * fadeA})`;
          ctx.beginPath();
          ctx.arc(c.x + x, c.y + y, lit ? 2.6 : 1.6, 0, TAU);
          ctx.fill();
        });
      });

      // 飛上去的琥珀點：從按鈕往上拋，落進那一團的下一顆的位置
      for (const f of flightsRef.current) {
        const c = centerOf(f.g, w, h);
        const k = Math.min(MAX_STARS - 1, Math.max(0, totalsRef.current[f.g] - 1));
        const [sx, sy] = starAt(k, f.g * 1.7);
        const tx = c.x + sx;
        const ty = c.y + sy;
        const p = Math.min(1, (now - f.at) / FLIGHT_MS);
        const e = 1 - (1 - p) * (1 - p);
        const cx = (f.x + tx) / 2;
        const cy = Math.min(f.y, ty) - 40;
        const x = (1 - e) * (1 - e) * f.x + 2 * (1 - e) * e * cx + e * e * tx;
        const y = (1 - e) * (1 - e) * f.y + 2 * (1 - e) * e * cy + e * e * ty;
        ctx.fillStyle = `rgb(${AMBER})`;
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, TAU);
        ctx.fill();
        if (p > 0.97) landedRef.current = { g: f.g, k, at: now };
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  return (
    <div className="rs" ref={boxRef}>
      <canvas className="rs-sky" ref={cvRef} aria-hidden="true" />
      <fieldset className="rs-row">
        <legend className="sr-only">{t('signal.react.title')}</legend>
        {GROUPS.map(([key], g) => (
          <button
            key={key}
            type="button"
            ref={(el) => {
              buttonsRef.current[g] = el;
            }}
            aria-pressed={minesOf[g].length > 0}
            onClick={() => press(g)}
          >
            {t(`signal.react.${key}`)}
            <em>{totals[g]}</em>
          </button>
        ))}
      </fieldset>
    </div>
  );
}
