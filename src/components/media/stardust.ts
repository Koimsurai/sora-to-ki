// 收藏頁換區時的「星塵重組」（media/Collection）：舊的那一區每一塊（封面、數字、那一行字…）塌成幾顆星塵，
// 捲成一道渦旋流向琥珀點；新的那一區排好之後，星塵從琥珀點那裡散出去，落到哪一塊，那一塊就亮起來。
// 只用每一塊的位置與大小，不讀圖片的像素。這裡只有畫圖與時間，不碰 React。
import type { Pt } from '@/store/pageTransition';

const INK = '241, 236, 227';
const AMBER = '233, 193, 122';
/** 塌進去要多久、散出去要多久（毫秒） */
const GATHER_MS = 460;
const SCATTER_MS = 680;
/** 散出去時，離琥珀點越遠的越晚出發（最多晚多久） */
const SCATTER_SPREAD_MS = 220;

/** 新的一區裡的一塊：它的位置，以及星塵落到它身上時要做的事（讓它亮起來） */
export interface Target {
  rect: DOMRect;
  reveal: () => void;
}

interface Grain {
  /** 塌進去：從哪裡出發、在琥珀點旁邊繞的半徑與角度 */
  sx: number;
  sy: number;
  orbit: number;
  turn: number;
  delay: number;
  size: number;
  amber: boolean;
  /** 散出去：落到哪一塊的哪一點 */
  target: number;
  tx: number;
  ty: number;
  out: number;
}

const easeIn = (t: number) => t * t * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** 一塊要分成幾顆星塵：照面積，小的三顆、大的最多十二顆 */
const grainsFor = (r: DOMRect) => Math.max(3, Math.min(12, Math.round((r.width * r.height) / 500)));

/** 畫面裡看得到的才分成星塵（封面牆很長，畫面外的那幾百格直接亮起來就好） */
const onScreen = (r: DOMRect) => r.bottom > -40 && r.top < window.innerHeight + 40 && r.width > 0;

function spawn(r: DOMRect, rnd: () => number): Grain {
  return {
    sx: r.left + rnd() * r.width,
    sy: r.top + rnd() * r.height,
    orbit: 4 + rnd() * 16,
    turn: (rnd() < 0.5 ? -1 : 1) * (1.6 + rnd() * 1.4),
    delay: rnd() * 100,
    size: 1.2 + rnd() * 1.4,
    amber: rnd() < 0.08,
    target: -1,
    tx: 0,
    ty: 0,
    out: 0,
  };
}

/**
 * 跑一次重組。sources 是舊的那一區每一塊的位置；center 是琥珀點現在在哪（它自己也在滑）；
 * swap 會在塌到一半時被叫：換成新的那一區、排好之後回傳它的每一塊
 */
export function reform(
  cv: HTMLCanvasElement,
  sources: DOMRect[],
  center: () => Pt,
  swap: () => Promise<Target[]>,
): Promise<void> {
  const ctx = cv.getContext('2d');
  if (!ctx) return swap().then((ts) => ts.forEach((t) => t.reveal()));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const rnd = Math.random;
  const grains: Grain[] = sources
    .filter(onScreen)
    .flatMap((r) => Array.from({ length: grainsFor(r) }, () => spawn(r, rnd)));
  const t0 = performance.now();
  let targets: Target[] | null = null;
  let scatterAt = -1;
  let swapping = false;
  const revealed = new Set<number>();

  /** 新的一區排好了：每一塊分到幾顆星塵（不夠就從琥珀點旁邊多生幾顆，多的就留在那裡淡掉） */
  const assign = (ts: Target[], at: number) => {
    const c = center();
    const visible = ts.map((t, i) => ({ t, i })).filter(({ t }) => onScreen(t.rect));
    // 畫面外的直接亮起來
    ts.forEach((t, i) => {
      if (!onScreen(t.rect)) {
        t.reveal();
        revealed.add(i);
      }
    });
    const far = Math.max(
      1,
      ...visible.map(({ t }) => Math.hypot(t.rect.left + t.rect.width / 2 - c.x, t.rect.top + t.rect.height / 2 - c.y)),
    );
    let k = 0;
    for (const { t, i } of visible) {
      const d = Math.hypot(t.rect.left + t.rect.width / 2 - c.x, t.rect.top + t.rect.height / 2 - c.y);
      for (let n = grainsFor(t.rect); n > 0; n--) {
        let g = grains.at(k);
        if (!g) {
          g = spawn(new DOMRect(c.x - 8, c.y - 8, 16, 16), rnd);
          g.delay = 0;
          grains.push(g);
        }
        k += 1;
        g.target = i;
        g.tx = t.rect.left + rnd() * t.rect.width;
        g.ty = t.rect.top + rnd() * t.rect.height;
        g.out = (d / far) * SCATTER_SPREAD_MS + rnd() * 90;
      }
    }
    // 沒分到的那幾顆在琥珀點旁邊淡掉
    for (; k < grains.length; k++) grains[k].target = -1;
    scatterAt = at;
  };

  return new Promise<void>((resolve) => {
    const frame = (now: number) => {
      const t = now - t0;
      const c = center();
      ctx.clearRect(0, 0, w, h);
      // 塌到一半就換：新的那一區趁星塵還在捲的時候排好
      if (!swapping && t > GATHER_MS * 0.55) {
        swapping = true;
        void swap().then((ts) => {
          targets = ts;
        });
      }
      if (targets && scatterAt < 0 && t >= GATHER_MS) assign(targets, now);
      let alive = false;
      for (const g of grains) {
        // 塌進去：繞著琥珀點越轉越近，最後停在它旁邊的一圈上
        const u = clamp((t - g.delay) / GATHER_MS);
        const e = easeIn(u);
        const dx = g.sx - c.x;
        const dy = g.sy - c.y;
        const dist = Math.hypot(dx, dy) || 1;
        const r0 = dist + (g.orbit - dist) * e;
        const a0 = Math.atan2(dy, dx) + g.turn * u + (now / 1000) * g.turn * 0.6 * e;
        let x = c.x + Math.cos(a0) * r0;
        let y = c.y + Math.sin(a0) * r0;
        // 一開始就是亮的：看起來是那一塊碎成星塵，不是先消失再冒出一堆點
        let alpha = 0.7 + 0.25 * u;
        if (scatterAt >= 0) {
          const v = clamp((now - scatterAt - g.out) / SCATTER_MS);
          if (g.target < 0) {
            alpha *= 1 - v;
          } else {
            // 散出去：從琥珀點旁邊那一圈解開，捲著落到那一塊上
            const f = easeOut(v);
            const ox = x - c.x;
            const oy = y - c.y;
            const tx = g.tx - c.x;
            const ty = g.ty - c.y;
            const spin = (1 - f) * g.turn * 0.7;
            const lx = ox + (tx - ox) * f;
            const ly = oy + (ty - oy) * f;
            x = c.x + lx * Math.cos(spin) - ly * Math.sin(spin);
            y = c.y + lx * Math.sin(spin) + ly * Math.cos(spin);
            if (v >= 0.82 && !revealed.has(g.target)) {
              revealed.add(g.target);
              targets?.[g.target]?.reveal();
            }
            // 落地之後慢慢淡掉，那一塊在底下亮起來
            alpha *= v < 0.85 ? 1 : 1 - (v - 0.85) / 0.15;
          }
          if (v < 1) alive = true;
        } else alive = true;
        if (alpha <= 0.01) continue;
        ctx.fillStyle = `rgba(${g.amber ? AMBER : INK}, ${alpha.toFixed(3)})`;
        ctx.fillRect(x - g.size / 2, y - g.size / 2, g.size, g.size);
      }
      if (alive || scatterAt < 0) {
        requestAnimationFrame(frame);
        return;
      }
      ctx.clearRect(0, 0, w, h);
      // 保險：還沒亮的全部亮起來
      targets?.forEach((tg, i) => {
        if (!revealed.has(i)) tg.reveal();
      });
      resolve();
    };
    requestAnimationFrame(frame);
  });
}
