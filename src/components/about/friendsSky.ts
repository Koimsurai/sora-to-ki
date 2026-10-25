// 朋友頁的軌道：這個站在中心（焦點），每位朋友各在自己的橢圓軌道上繞，外面再留兩條空的給下一位。
// 軌道照克卜勒：近心點快、遠心點慢，星身後拖一段漸淡的軌跡；外圈的週期照 a^1.5 變長。
// 朋友最近的每一篇是他軌道上、星身後的一個刻點（越舊越遠）；兩週內有新文章的星會一圈圈發出訊號環。
// 點一顆星，鏡頭拉近、星換成對接線稿的那艘船，這個站的船從左邊滑進來接上（面板由頁面疊在旁邊）。
// 表單打名字時，一顆預覽星從畫面外飛到外圈等著；送出時點火，沿轉移軌道切進那條空軌道。
// 這裡只畫點、線與插圖，字全是疊在上面的 DOM（要能點、要被裁字器看到）。

const INK = '241, 236, 227';
const AMBER = '233, 193, 122';
const TAU = Math.PI * 2;
/** 軌道平面往左上傾斜的角度（弧度） */
const TILT = -0.18;
/** 最內圈與最外圈的軌道半長軸（相對 R） */
const K_IN = 0.42;
const K_OUT = 1;
/** 最內圈繞一圈幾秒（外圈照克卜勒第三定律變長） */
const PERIOD_IN_S = 34;
/** 星身後的軌跡拖多長（平近點角，弧度） */
const TRAIL_M = 1.1;
/** 刻點最遠排到星身後多少（平近點角）：一年前的那篇在這裡 */
const BEACON_SPAN = TAU * 0.82;
/** 剛發的那篇離星多遠（平近點角），免得疊在星上 */
const BEACON_NEAR = 0.16;
/** 相鄰兩個刻點至少隔多遠（平近點角） */
const BEACON_GAP = 0.09;
/** 多少天內有新文章算「剛更新」：會發出訊號環 */
export const FRESH_DAYS = 14;
/** 多少天沒更新就暗到底 */
const DIM_DAYS = 180;
/** 窄螢幕（手機直拿）的寬度門檻：寬度不夠，軌道改成比較圓、不那麼扁 */
const NARROW_PX = 600;
/** 預覽星送出後切進軌道要幾秒 */
export const INSERT_S = 1.8;

/** 對接插圖（public/illustrations/docking.webp，880×585）：在兩艘船之間切開。
 *  左半是這個站的船、右半是朋友的船；比例都是相對原圖寬高 */
const DOCK = { IW: 880, IH: 585, CUT: 0.511, LEFT_PORT: 0.443, RIGHT_PORT: 0.585, AXIS: 0.5 } as const;

export interface SkyStar {
  id: string;
  /** 最新一篇距今幾天；沒有文章是 null */
  days: number | null;
  /** 最近每一篇距今幾天（新的在前） */
  posts: number[];
}

export interface Pt {
  x: number;
  y: number;
}

/** 對接：哪一顆、鏡頭拉近的進度、兩艘船接上的進度（都是 0–1，已經 ease 過） */
interface Dock {
  i: number;
  zoom: number;
  join: number;
}

/** 表單的預覽星 */
export interface Preview {
  /** 亮度（打了名字 1，清掉 0） */
  alpha: number;
  /** hold：從畫面外飛到外圈等著；insert：點火切進空軌道；orbit：已經在軌道上 */
  mode: 'hold' | 'insert' | 'orbit';
  /** hold 的進場進度、insert 的轉移進度（0–1） */
  u: number;
}

export interface SkyFrame {
  w: number;
  h: number;
  /** 軌道的時間（秒）：對接時會停下來 */
  t: number;
  /** 實際經過的時間（秒）：訊號環、點火、漂浮用 */
  real: number;
  /** 換頁進來後軌道從內往外長出來的進度（0–1） */
  grow: number;
  /** 換頁離開時軌道收回中心的進度（0–1） */
  erase: number;
  /** 滑鼠滑到的那顆星（沒有是 -1） */
  near: number;
  /** 滑鼠滑到的刻點 [星, 第幾篇]（沒有是 null） */
  beacon: [number, number] | null;
  dock: Dock | null;
  preview: Preview | null;
  /** 對接線稿（還沒載好是 null） */
  art: HTMLImageElement | null;
  /** 被面板佔掉的地方（見 frameOf）；動畫中的值，由頁面逐幀推 */
  inset: Inset;
}

export interface Drawn {
  /** 每顆星在畫面上的位置與它長出來了沒（字跟著它淡入） */
  stars: (Pt & { appear: number })[];
  /** 每個刻點在畫面上的位置 */
  beacons: (Pt & { i: number; j: number })[];
  preview: (Pt & { alpha: number }) | null;
}

/** 字串 → 0–1 的固定亂數（同一位朋友每次都是同一條軌道） */
const hash01 = (s: string, salt = 0) => {
  let h = 2166136261 ^ salt;
  for (const c of s) h = Math.imul(h ^ (c.codePointAt(0) ?? 0), 16777619);
  return (h >>> 0) / 4294967296;
};

const brightnessOf = (days: number | null) => (days === null ? 0.45 : Math.max(0.35, Math.min(1, 1 - days / DIM_DAYS)));

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** 克卜勒方程式 M = E − e·sinE，用牛頓法解偏近點角 */
const eccentric = (M: number, e: number) => {
  let E = M;
  for (let k = 0; k < 5; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
};

/**
 * 軌道系統放在哪、多大。inset 是被佔掉的地方（右邊的寬、底下的高、上面的高，CSS 像素）：
 * 面板打開時整個系統移到剩下的那塊天的正中間、跟著縮小，不會被蓋住（鏡頭讓位，不是面板疊上去）
 */
export function frameOf(w: number, h: number, inset: Inset = NO_INSET) {
  const narrow = w < NARROW_PX;
  const vw = w - inset.right;
  const vh = h - inset.bottom - inset.top;
  return {
    cx: vw * 0.5,
    cy: inset.top + vh * 0.5,
    R: narrow ? Math.min(vw * 0.4, vh * 0.42) : Math.min(vw * 0.42, vh * 0.7),
    squash: narrow ? 0.85 : 0.6,
    narrow,
  };
}

export interface Inset {
  right: number;
  bottom: number;
  top: number;
}
const NO_INSET: Inset = { right: 0, bottom: 0, top: 0 };

interface Orbit {
  k: number;
  e: number;
  /** 近心點的方向（軌道平面內，弧度） */
  peri: number;
  /** 平均角速度（弧度／秒） */
  n: number;
  M0: number;
}

export function createSky(stars: SkyStar[]) {
  // 朋友一人一條，外面再兩條空的（第一條給表單的預覽星）
  const rings = stars.length + 2;
  const kOf = (j: number) => K_IN + ((K_OUT - K_IN) * j) / Math.max(1, rings - 1);
  const orbitOf = (k: number, id: string): Orbit => ({
    k,
    e: 0.16 + hash01(id, 1) * 0.16,
    peri: hash01(id, 2) * TAU,
    n: TAU / (PERIOD_IN_S * Math.pow(k / K_IN, 1.5)),
    M0: hash01(id) * TAU,
  });
  const orbits = stars.map((s, i) => orbitOf(kOf(i), s.id));
  const lum = stars.map((s) => brightnessOf(s.days));
  const nextOrbit = orbitOf(kOf(stars.length), 'next');
  // 每篇的刻點離星多遠（平近點角）：用對數排，近幾天的分得開、一年前的擠在最後
  // 同一天發的幾篇至少隔開 BEACON_GAP，不然疊成一個
  const beaconM = stars.map((s) => {
    let prev = -Infinity;
    return s.posts.map((d) => {
      const m = BEACON_NEAR + (BEACON_SPAN - BEACON_NEAR) * Math.min(1, Math.log1p(Math.max(0, d)) / Math.log1p(365));
      prev = Math.max(m, prev + BEACON_GAP);
      return prev;
    });
  });
  const beaconAlpha = stars.map((s) =>
    s.posts.map((d) => 0.85 - 0.55 * Math.min(1, Math.log1p(Math.max(0, d)) / Math.log1p(365))),
  );

  /** 每條軌道長出來的進度：從內往外一條接一條 */
  const ringGrow = (grow: number, j: number) => Math.max(0, Math.min(1, grow * (rings + 1) - j));

  return {
    draw(ctx: CanvasRenderingContext2D, f: SkyFrame): Drawn {
      const { w, h, t, real, grow, erase, near, beacon, dock, preview, art, inset } = f;
      const { cx, cy, R, squash, narrow } = frameOf(w, h, inset);
      const fade = 1 - erase;
      // 離開時軌道往中心收
      const shrink = 1 - 0.7 * erase;
      ctx.clearRect(0, 0, w, h);

      // 軌道平面上的一點 → 世界座標（鏡頭之前）
      const project = (qx: number, qy: number): Pt => {
        const x = qx * 1.05 * shrink;
        const y = qy * squash * shrink;
        return { x: cx + x * Math.cos(TILT) - y * Math.sin(TILT), y: cy + x * Math.sin(TILT) + y * Math.cos(TILT) };
      };
      const onOrbit = (o: Orbit, M: number) => {
        const a = R * o.k;
        const E = eccentric(M, o.e);
        const px = a * (Math.cos(E) - o.e);
        const py = a * Math.sqrt(1 - o.e * o.e) * Math.sin(E);
        return project(px * Math.cos(o.peri) - py * Math.sin(o.peri), px * Math.sin(o.peri) + py * Math.cos(o.peri));
      };
      const Mof = (o: Orbit) => o.M0 + o.n * t;

      // 鏡頭：對接時把那顆星拉到定位並放大，其餘的點跟著同一個變換
      let cam = (p: Pt) => p;
      if (dock && dock.zoom > 0) {
        const fp = onOrbit(orbits[dock.i], Mof(orbits[dock.i]));
        const z = 1 + ((narrow ? 1.5 : 2) - 1) * dock.zoom;
        const tx = narrow ? w * 0.5 : w * 0.3;
        const ty = narrow ? h * 0.24 : h * 0.48;
        const ox = fp.x + (tx - fp.x) * dock.zoom;
        const oy = fp.y + (ty - fp.y) * dock.zoom;
        cam = (p) => ({ x: (p.x - fp.x) * z + ox, y: (p.y - fp.y) * z + oy });
      }
      const at = (o: Orbit, M: number) => cam(onOrbit(o, M));
      // 對接時其他東西退到背景
      const others = dock ? 1 - 0.8 * dock.zoom : 1;
      const dimOf = (i: number) => (dock && dock.i !== i ? others : 1);

      const ring = (o: Orbit, span: number, alpha: number, dash: number[]) => {
        if (span <= 0 || alpha <= 0) return;
        ctx.setLineDash(dash);
        ctx.strokeStyle = `rgba(${INK}, ${alpha})`;
        ctx.beginPath();
        const n = Math.max(8, Math.round(180 * span));
        const from = Mof(o);
        for (let s = 0; s <= n; s++) {
          const p = at(o, from - (s / n) * span * TAU);
          if (s) ctx.lineTo(p.x, p.y);
          else ctx.moveTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      };
      orbits.forEach((o, i) => ring(o, ringGrow(grow, i), 0.22 * fade * dimOf(i), [1, 4]));
      for (let j = stars.length; j < rings; j++) {
        const lift = j === stars.length && preview?.mode === 'hold' ? preview.alpha * 0.16 : 0;
        ring(
          orbitOf(kOf(j), j === stars.length ? 'next' : 'far'),
          ringGrow(grow, j),
          (0.08 + lift) * fade * others,
          [2, 6],
        );
      }

      // 中心：這個站（琥珀點）
      const c = cam({ x: cx, y: cy });
      const cg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 26);
      cg.addColorStop(0, `rgba(${AMBER}, ${0.55 * fade * others})`);
      cg.addColorStop(1, `rgba(${AMBER}, 0)`);
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 26, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(${AMBER}, ${fade * Math.max(0.3, others)})`;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 3.6, 0, TAU);
      ctx.fill();

      const beacons: Drawn['beacons'] = [];
      const placed = orbits.map((o, i) => {
        const appear = ringGrow(grow, i) * fade;
        const dim = dimOf(i);
        const M = Mof(o);
        const p = at(o, M);

        // 星身後的軌跡：越靠近星越亮
        const steps = 24;
        let prev = at(o, M - TRAIL_M);
        for (let s = 1; s <= steps; s++) {
          const q = at(o, M - TRAIL_M * (1 - s / steps));
          ctx.strokeStyle = `rgba(${INK}, ${0.5 * lum[i] * (s / steps) * appear * dim})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
          prev = q;
        }
        ctx.lineWidth = 1;

        // 每篇一個刻點：橫跨軌道的一小段線＋一個點
        beaconM[i].forEach((dm, j) => {
          const b = at(o, M - dm);
          const b2 = at(o, M - dm + 0.01);
          const len = Math.hypot(b2.x - b.x, b2.y - b.y) || 1;
          const nx = -(b2.y - b.y) / len;
          const ny = (b2.x - b.x) / len;
          const on = beacon?.[0] === i && beacon[1] === j;
          const a = (on ? 1 : beaconAlpha[i][j]) * appear * dim;
          ctx.strokeStyle = `rgba(${INK}, ${a})`;
          ctx.beginPath();
          ctx.moveTo(b.x - nx * 3, b.y - ny * 3);
          ctx.lineTo(b.x + nx * 3, b.y + ny * 3);
          ctx.stroke();
          ctx.fillStyle = `rgba(${INK}, ${a})`;
          ctx.beginPath();
          ctx.arc(b.x, b.y, on ? 2.6 : 1.8, 0, TAU);
          ctx.fill();
          if (on) {
            ctx.strokeStyle = `rgba(${INK}, ${0.5 * appear})`;
            ctx.beginPath();
            ctx.arc(b.x, b.y, 7, 0, TAU);
            ctx.stroke();
          }
          beacons.push({ x: b.x, y: b.y, i, j });
        });

        // 剛更新的朋友：一圈圈往外的訊號環（畫成跟軌道平面同樣傾斜的橢圓）
        const s = stars[i];
        const fresh = s.days !== null && s.days <= FRESH_DAYS;
        if (fresh && appear > 0) {
          for (let k = 0; k < 2; k++) {
            const ph = (real * 0.3 + i * 0.37 + k * 0.5) % 1;
            const r = 6 + ph * 44;
            ctx.strokeStyle = `rgba(${INK}, ${0.32 * (1 - ph) * appear * dim})`;
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, r, r * squash, TILT, 0, TAU);
            ctx.stroke();
          }
        }

        // 對接：星換成朋友的船
        const join = dock?.i === i ? dock.join : 0;
        const pulse = fresh ? 0.6 + 0.4 * Math.sin(real * 2.4 + i) : 0.45;
        const hg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16);
        hg.addColorStop(0, `rgba(${INK}, ${0.35 * pulse * lum[i] * appear * dim * (1 - join)})`);
        hg.addColorStop(1, `rgba(${INK}, 0)`);
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 16, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgba(${INK}, ${lum[i] * appear * dim * (1 - join)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, i === near ? 4.2 : 3.2, 0, TAU);
        ctx.fill();
        if (join > 0 && art) drawDocking(ctx, art, p, join, real, narrow ? 84 : 120, w);
        return { ...p, appear };
      });

      // 預覽星
      let shown: Drawn['preview'] = null;
      if (preview && preview.alpha > 0.01) {
        const a = preview.alpha * fade * others;
        const Mn = Mof(nextOrbit);
        let p: Pt;
        let burn = 0;
        // 在外圈右上角等著的位置，與從畫面外飛來的起點
        const hold = cam(project(R * K_OUT * 1.12 * Math.cos(-0.7), R * K_OUT * 1.12 * Math.sin(-0.7)));
        const bob = Math.sin(real * 1.3) * 3;
        if (preview.mode === 'hold') {
          const from = cam(project(R * 2.2 * Math.cos(-0.7), R * 2.2 * Math.sin(-0.7)));
          const u = easeOut(preview.u);
          p = { x: from.x + (hold.x - from.x) * u, y: from.y + (hold.y - from.y) * u + bob * u };
        } else if (preview.mode === 'insert') {
          // 轉移軌道：從等著的位置出發（往中心的方向），抵達時的速度就是軌道上的速度
          const u = preview.u;
          const end = at(nextOrbit, Mn);
          const end2 = at(nextOrbit, Mn + 0.02);
          const dur = INSERT_S;
          const vScale = (nextOrbit.n * dur) / 0.02;
          const v1 = { x: (end2.x - end.x) * vScale, y: (end2.y - end.y) * vScale };
          const v0 = { x: (c.x - hold.x) * 0.6, y: (c.y - hold.y) * 0.6 };
          const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
          const h10 = u ** 3 - 2 * u ** 2 + u;
          const h01 = -2 * u ** 3 + 3 * u ** 2;
          const h11 = u ** 3 - u ** 2;
          const start = { x: hold.x, y: hold.y + bob };
          p = {
            x: h00 * start.x + h10 * v0.x + h01 * end.x + h11 * v1.x,
            y: h00 * start.y + h10 * v0.y + h01 * end.y + h11 * v1.y,
          };
          burn = Math.max(0, 1 - u * 3.5);
        } else {
          p = at(nextOrbit, Mn);
          // 入軌之後也拖一段軌跡
          let prev = at(nextOrbit, Mn - TRAIL_M);
          for (let s = 1; s <= 24; s++) {
            const q = at(nextOrbit, Mn - TRAIL_M * (1 - s / 24));
            ctx.strokeStyle = `rgba(${INK}, ${0.4 * (s / 24) * a})`;
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
            prev = q;
          }
        }
        if (burn > 0) {
          // 點火：一小團琥珀色的光
          const bg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 18);
          bg.addColorStop(0, `rgba(${AMBER}, ${0.8 * burn * a})`);
          bg.addColorStop(1, `rgba(${AMBER}, 0)`);
          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 18, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = `rgba(${INK}, ${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, TAU);
        ctx.fill();
        shown = { ...p, alpha: a };
      }

      return { stars: placed, beacons, preview: shown };
    },
  };
}

/** 對接：朋友的船（右半）出現在星的位置，這個站的船（左半）從左邊滑進來接上；
 *  接上之後 RSS 的點從朋友的艙口走到這邊的艙口 */
function drawDocking(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  at: Pt,
  join: number,
  real: number,
  height: number,
  w: number,
) {
  if (!img.complete || !img.naturalWidth) return;
  const { CUT, LEFT_PORT, RIGHT_PORT, AXIS } = DOCK;
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const sc = height / sh;
  const dw = sw * sc;
  // 右半的中心對在星上
  const rightMid = (CUT + 1) / 2;
  const ox = at.x - dw * rightMid;
  const oy = at.y - height * AXIS;
  const gap = 10;
  const slide = (1 - easeOut(join)) * w * 0.5;
  // 左半的艙口停在右半艙口左邊 gap 的地方
  const lx = ox + dw * (RIGHT_PORT - LEFT_PORT) - gap - slide;
  ctx.globalAlpha = Math.min(1, join * 1.5) * 0.9;
  ctx.drawImage(img, sw * CUT, 0, sw * (1 - CUT), sh, ox + dw * CUT, oy, dw * (1 - CUT), height);
  ctx.globalAlpha = Math.min(1, join * 2) * 0.9;
  ctx.drawImage(img, 0, 0, sw * CUT, sh, lx, oy, dw * CUT, height);
  ctx.globalAlpha = 1;
  if (join < 0.98) return;
  const ax = lx + dw * LEFT_PORT;
  const bx = ox + dw * RIGHT_PORT;
  const y = at.y;
  for (let k = 0; k < 3; k++) {
    const p = (real * 0.6 + k / 3) % 1;
    ctx.fillStyle = `rgba(${INK}, ${0.8 * Math.sin(p * Math.PI)})`;
    ctx.fillRect(Math.round(bx + (ax - bx) * p) - 1, y - 1, 2, 2);
  }
}

/** 右欄的對接插圖：兩半慢慢靠近又退開，中間的點是 RSS 訊號 */
export function drawDockIllustration(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  t: number,
) {
  const { IW, IH, CUT, LEFT_PORT, RIGHT_PORT, AXIS } = DOCK;
  ctx.clearRect(0, 0, w, h);
  if (!img.complete || !img.naturalWidth) return;
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const sc = Math.min(w / IW, h / IH);
  const dw = IW * sc;
  const dh = IH * sc;
  const ox = (w - dw) / 2;
  const oy = (h - dh) / 2;
  const d = (0.5 - 0.5 * Math.cos(t * 0.5)) * 9;
  ctx.globalAlpha = 0.9;
  ctx.drawImage(img, 0, 0, sw * CUT, sh, ox + d, oy, dw * CUT, dh);
  ctx.drawImage(img, sw * CUT, 0, sw * (1 - CUT), sh, ox + dw * CUT - d, oy, dw * (1 - CUT), dh);
  ctx.globalAlpha = 1;
  const ax = ox + dw * LEFT_PORT + d;
  const bx = ox + dw * RIGHT_PORT - d;
  const y = oy + dh * AXIS;
  for (let k = 0; k < 3; k++) {
    const p = (t * 0.6 + k / 3) % 1;
    ctx.fillStyle = `rgba(${INK}, ${0.8 * Math.sin(p * Math.PI)})`;
    ctx.fillRect(Math.round(bx + (ax - bx) * p) - 1, y - 1, 2, 2);
  }
}
