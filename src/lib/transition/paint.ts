// 換頁轉場的畫法（layout/TransitionLayer）：點、彗尾、塵埃，與各主題自己的那一筆（黑洞、重力波、參宿四的殼、
// 海王星的彈弓與預言落點）。只用 2D context，不碰 DOM：主執行緒的 canvas 與轉場 worker 的 OffscreenCanvas
// 用的是同一份。配色與主題由呼叫端放在 style 裡，換主題時改 style 就好
import { PLANETS } from '@/lib/saturnSpec';
import type { Theme } from '@/lib/theme';
import type { Pt } from '@/store/pageTransition';
import { clamp, easeOut, smooth, type Flight } from './geometry';

/** 彗尾：一個點畫下去之後多久散掉（ms） */
const TAIL_MS = 760;
/** 彗尾的塵埃多久熄掉 */
const DUST_LIFE_MS = 900;
/**
 * 海王星的尾巴：點身後一條很淡的髮絲，上面四段亮的，長短與間隔照 Adams 環上那四段弧
 * （lib/saturnSpec，開場亮起來的也是它們）。弧的角度換成離點多遠：1° 是 TAIL_ARC_PX 像素
 */
const TAIL_ARC_PX = 3;
/** 弧以外那條髮絲的濃度（Adams 環整圈很淡，只有弧亮） */
const TAIL_FAINT = 0.22;
const TAIL_ARCS = PLANETS.neptune.ring.arcs.map(([, from, to]) => [
  ((from * 180) / Math.PI) * TAIL_ARC_PX,
  ((to * 180) / Math.PI) * TAIL_ARC_PX,
]);
/** 波前往外走多快（px/ms）、活多久（ms）、四極形變最大多少（半徑的幾成）、橫直來回擺一次多久（ms） */
const WAVE_SPEED = 0.28;
const WAVE_LIFE = 1000;
const WAVE_SQUEEZE = 0.12;
const WAVE_PERIOD = 420;
/**
 * 黑洞的轉場是「逃出黑洞」：離開的那一頁收成的那一點變成一個小黑洞（hole），點從它旁邊逃出去，
 * 點身後的光越舊越被拉回去、繞著它旋進去消失。HOLE_R 是陰影的半徑（px）；
 * HOLE_SWIRL 是光被吞掉之前繞著它轉了多少（rad）；HOLE_PULL 是光多久被吞完（TAIL_MS 的幾倍）
 */
const HOLE_R = 11;
const HOLE_SWIRL = 2.4;
const HOLE_PULL = 1.3;
/** 參宿四的塵埃殼：越擴越慢、最遠到 SHELL_REACH px、活 SHELL_LIFE 毫秒 */
const SHELL_REACH = 70;
const SHELL_LIFE = 1500;
/** 海王星的預言落點（predicted）：圈的半徑、外面那四道刻度的長度（px） */
const PREDICT_R = 10;
const PREDICT_TICK = 4;
/** 海王星的彈弓繞過的那顆星畫多大（px）；路線怎麼彎見 geometry 的 flyby */
export const SLING_BODY_R = 11;

/** 配色（"r, g, b"）與主題 */
export interface PaintStyle {
  ink: string;
  amber: string;
  ground: string;
  theme: Theme;
}

/** 黑洞的麵條化：拉長幾成（0–1）、往哪個方向 */
export interface Stretch {
  k: number;
  angle: number;
}

/** 點飛過的路（世界座標，t 是畫下去的時間：彗尾照它散掉） */
export type Trail = (Pt & { t: number })[];

/** 畫的時候要讀（有的還會順便更新）的那幾樣：一趟轉場的狀態裡跟畫面有關的部分 */
export interface PaintState {
  phase: 'leave' | 'fly' | 'grow';
  flight: Flight | null;
  /** quiet 那一趟走了幾成（0 到 1）：沒有 flight，黑洞照它決定什麼時候收起來 */
  quietU?: number;
  /** 黑洞的重力波：每一道波前從哪裡、什麼時候出發、多強（世界座標） */
  waves: { at: number; c: Pt; strength: number }[];
  /** 黑洞：離開的那一點變成的小黑洞（世界座標）與它出現的時間；沒有是 null */
  hole: { c: Pt; at: number } | null;
  /** 參宿四：點飛過的路上甩出的塵埃殼（世界座標、出發的時間、每一圈自己的形狀） */
  shells: { c: Pt; at: number; phase: number[] }[];
  /** 彗尾的塵埃（世界座標） */
  dust: { x: number; y: number; vx: number; vy: number; life: number; size: number }[];
}

export function createPainter(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, style: PaintStyle) {
  /** stretch：黑洞的麵條化——沿 angle 拉長 (1 + 3k) 倍、橫向變細，光暈跟著變暗（重力紅移） */
  const dot = (p: Pt, radius: number, alpha = 1, stretch?: Stretch) => {
    if (alpha <= 0.01) return;
    const k = stretch?.k ?? 0;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 18);
    g.addColorStop(0, `rgba(${style.amber}, ${0.5 * alpha * (1 - 0.6 * k)})`);
    g.addColorStop(1, `rgba(${style.amber}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${style.amber}, ${alpha})`;
    // 參宿四：點在呼吸（它是會脹縮的變星）
    const breathe = style.theme === 'betelgeuse' ? 1 + 0.25 * Math.sin(performance.now() / 160) : 1;
    ctx.beginPath();
    ctx.ellipse(
      p.x,
      p.y,
      radius * breathe * (1 + 3 * k),
      radius * breathe * (1 - 0.55 * k),
      stretch?.angle ?? 0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  };

  /**
   * 參宿四的塵埃殼：VLT 拍到它周圍的物質是一團一團、不對稱的，不是整齊的圓。每一圈由細小的塵埃點組成，
   * 半徑不規則起伏、點聚成一段段團塊（每一圈的形狀各自不同，phase），往外擴得越來越慢（被拋出的物質會減速）。
   * 回傳還有沒有沒散完的
   */
  const dustShells = (r: PaintState, now: number) => {
    if (!r.shells.length) return false;
    r.shells = r.shells.filter((sh) => now - sh.at < SHELL_LIFE);
    for (const sh of r.shells) {
      const age = (now - sh.at) / SHELL_LIFE;
      const radius = 3 + SHELL_REACH * easeOut(age);
      const fade = 0.75 * Math.pow(1 - age, 1.2);
      const [p1, p2, p3, p4, p5] = sh.phase;
      const n = Math.round(clamp(radius * 0.9, 12, 90));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const lump = 0.16 * Math.sin(2 * a + p1) + 0.09 * Math.sin(3 * a + p2) + 0.05 * Math.sin(5 * a + p3);
        const clump = clamp(0.45 + 0.6 * Math.sin(4 * a + p4) + 0.35 * Math.sin(7 * a + p5));
        if (clump < 0.08) continue;
        const rr = radius * (1 + lump);
        ctx.fillStyle = `rgba(${style.ink}, ${(fade * clump).toFixed(3)})`;
        ctx.fillRect(sh.c.x + rr * Math.cos(a) - 0.65, sh.c.y + rr * Math.sin(a) - 0.65, 1.3, 1.3);
      }
    }
    return r.shells.length > 0;
  };

  /**
   * 黑洞的轉場：離開的那一點變成的小黑洞，跟首頁的主星同一個長相——夜色的陰影、一圈光子環、
   * 陰影頂上被彎過去的盤影、一道傾斜的吸積盤（後半圈在陰影後面、前半圈擋在前面）。出現時從一點長出來；
   * 點逃遠了、身後的光也吞得差不多了就收起來
   */
  const drawHole = (r: PaintState, now: number) => {
    const h = r.hole;
    if (!h) return;
    const grow = easeOut(clamp((now - h.at) / 320));
    // 點逃遠了、光也吞得差不多了，黑洞就收起來（不一直留在那裡）
    const f = r.flight;
    const progress = r.phase === 'grow' ? 1 : f ? clamp((now - f.at - f.acquire) / f.dur) : (r.quietU ?? 0);
    const fade = 1 - smooth(0.4, 0.75, progress);
    if (grow * fade <= 0.01) return;
    const radius = HOLE_R * grow * (0.4 + 0.6 * fade);
    ctx.save();
    ctx.translate(h.c.x, h.c.y);
    ctx.rotate(-0.2);
    ctx.globalAlpha = fade;
    ctx.lineWidth = 1;
    const disk = (from: number, to: number, alpha: number) => {
      for (const [rx, a] of [
        [1.5, 1],
        [1.9, 0.75],
        [2.4, 0.45],
      ]) {
        ctx.strokeStyle = `rgba(${style.ink}, ${(alpha * a).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * rx, radius * rx * 0.3, 0, from, to);
        ctx.stroke();
      }
    };
    disk(Math.PI, Math.PI * 2, 0.55);
    ctx.fillStyle = `rgb(${style.ground})`;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    // 盤的背面被重力彎到陰影頂上的那道拱（首頁的 3D 黑洞也有）：沒有它的話小黑洞看起來像一顆帶環的星
    for (const [k, a] of [
      [1.22, 0.7],
      [1.42, 0.45],
      [1.62, 0.25],
    ]) {
      ctx.strokeStyle = `rgba(${style.ink}, ${a})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * k, radius * k * 0.95, 0, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(${style.ink}, 0.85)`;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.08, 0, Math.PI * 2);
    ctx.stroke();
    disk(0, Math.PI, 0.8);
    ctx.restore();
  };

  /**
   * 黑洞的重力波，照教科書解釋重力波的那張圖畫：一圈「測試粒子」被波掃過時，整圈在橫的橢圓與直的橢圓之間
   * 來回擺（四極形變，一個方向拉長、另一個方向壓扁）。每一道波前是一圈細點，從出發點往外走、越遠越淡、
   * 一邊走一邊擺。回傳還有沒有沒散完的
   */
  const gravityWaves = (r: PaintState, now: number) => {
    ctx.lineWidth = 1;
    let alive = false;
    const keep: PaintState['waves'] = [];
    for (const w of r.waves) {
      const age = now - w.at;
      if (age < 0) {
        keep.push(w);
        alive = true;
        continue;
      }
      const life = age / WAVE_LIFE;
      if (life >= 1) continue;
      keep.push(w);
      alive = true;
      const radius = 6 + age * WAVE_SPEED;
      // 越遠越淡（振幅大約照 1/r 掉）、越老越淡
      const alpha = Math.min(1, 1.1 * w.strength) * Math.pow(1 - life, 1.3) * Math.min(1, 90 / radius) ** 0.5;
      if (alpha < 0.01) continue;
      // 一邊走一邊擺：越強擺得越慢
      const squeeze =
        WAVE_SQUEEZE *
        Math.min(1, 0.4 + w.strength) *
        Math.sin((2 * Math.PI * age) / (WAVE_PERIOD * (0.6 + 0.4 * w.strength)));
      ctx.fillStyle = `rgba(${style.ink}, ${alpha.toFixed(3)})`;
      const n = Math.round(clamp(radius * 0.5, 36, 160));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = radius * (1 + squeeze * Math.cos(2 * a));
        ctx.fillRect(w.c.x + rr * Math.cos(a) - 0.75, w.c.y + rr * Math.sin(a) - 0.75, 1.5, 1.5);
      }
    }
    r.waves = keep;
    return alive;
  };

  /**
   * 彗尾：每一段照它畫下去多久了變淡，散完就不畫；回傳還有沒有沒散完的。線一律是 1px 的髮絲線（站上的線都是）。
   * 一小段一筆、平頭：圓頭的話相鄰兩筆的半透明端點疊在一起，接頭會亮成一串珠子
   *
   * 海王星跟 3D 的 Adams 環同一個長相：一條很淡的髮絲，上面四段亮的（TAIL_ARCS，從點往回量）。
   * 黑洞跟土星一樣是一條順著路的髮絲（試過捲成螺旋：跟點實際走的路無關，單看像一條畸形的線）
   */
  const tail = (trail: Trail, now: number, hole?: Pt) => {
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';
    let alive = false;
    let back = 0;
    // 黑洞：點身後的光越舊越被拉回後面那個小黑洞——繞著它轉、往它收，進了陰影就不見（只改畫的位置）
    const life = hole ? TAIL_MS * HOLE_PULL : TAIL_MS;
    const points: (Pt & { t: number; u?: number })[] = hole
      ? trail.map((p) => {
          const u = clamp((now - p.t) / life) ** 1.4;
          const turn = u * HOLE_SWIRL;
          const dx = (p.x - hole.x) * (1 - u);
          const dy = (p.y - hole.y) * (1 - u);
          return {
            x: hole.x + dx * Math.cos(turn) - dy * Math.sin(turn),
            y: hole.y + dx * Math.sin(turn) + dy * Math.cos(turn),
            t: p.t,
            u,
          };
        })
      : trail;
    for (let i = points.length - 1; i > 0; i--) {
      const a = points[i - 1];
      const b = points[i];
      const step = Math.hypot(b.x - a.x, b.y - a.y);
      const from = back;
      back += step;
      const k = 1 - (now - b.t) / life;
      if (k <= 0 || step === 0) continue;
      if (hole && Math.hypot(a.x - hole.x, a.y - hole.y) < HOLE_R && Math.hypot(b.x - hole.x, b.y - hole.y) < HOLE_R) {
        alive = true;
        continue;
      }
      alive = true;
      const fade = Math.pow(k, 1.6);
      // 這一筆從 b（靠點那頭）量回 a 的哪幾段、各多亮
      const pieces: [u0: number, u1: number, alpha: number][] = [];
      if (style.theme === 'neptune') {
        let at = 0;
        for (const [s0, s1] of TAIL_ARCS) {
          const lo = clamp((s0 - from) / step);
          const hi = clamp((s1 - from) / step);
          if (lo > at) pieces.push([at, lo, TAIL_FAINT * fade]);
          if (hi > lo) pieces.push([lo, hi, 0.85 * fade]);
          at = Math.max(at, hi);
        }
        if (at < 1) pieces.push([at, 1, TAIL_FAINT * fade]);
      } else pieces.push([0, 1, 0.75 * fade]);
      // 這條線是點拖著的光：用點的顏色、帶一層淡淡的光暈（白色的髮絲看不出是光）。
      // 黑洞的越被拉回黑洞越暗（爬出重力井的光會變暗）
      const light = hole ? 1 - 0.8 * (b.u ?? 0) : 1;
      for (const [u0, u1, alpha] of pieces) {
        if (u1 <= u0) continue;
        const x0 = b.x + (a.x - b.x) * u0;
        const y0 = b.y + (a.y - b.y) * u0;
        const x1 = b.x + (a.x - b.x) * u1;
        const y1 = b.y + (a.y - b.y) * u1;
        ctx.lineWidth = 4;
        ctx.strokeStyle = `rgba(${style.amber}, ${(0.12 * alpha * light).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(${style.amber}, ${(alpha * light).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    }
    return alive;
  };

  /**
   * 彈弓繞過的那顆星：一顆小小的刻線海王星（跟首頁的主星同一支筆）。一列列橫線、左上受光，
   * 外面一道細環，傾角跟主星一樣。只畫一個圈的話讀者不知道那是什麼，看起來像雜訊
   */
  const slingBody = (c: Pt, alpha: number) => {
    const radius = SLING_BODY_R;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(-0.2);
    ctx.lineWidth = 1;
    // 環的後半圈（在星球後面）
    ctx.strokeStyle = `rgba(${style.ink}, ${(0.35 * alpha).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.9, radius * 1.9 * 0.408, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    // 球：先把球面範圍清空（擋掉後半圈的環與後面的尾巴），再一列列畫刻線，越往右下越暗
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.save();
    ctx.clip();
    ctx.clearRect(-radius, -radius, radius * 2, radius * 2);
    for (let y = -radius + 1.5; y < radius; y += 2.5) {
      const half = Math.sqrt(radius * radius - y * y);
      const grad = ctx.createLinearGradient(-half, y, half, y);
      const lit = 0.8 * alpha * (1 - (0.35 * (y + radius)) / (2 * radius));
      grad.addColorStop(0, `rgba(${style.ink}, ${lit.toFixed(3)})`);
      grad.addColorStop(1, `rgba(${style.ink}, 0)`);
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-half, y);
      ctx.lineTo(half, y);
      ctx.stroke();
    }
    ctx.restore();
    // 環的前半圈（擋在星球前面）
    ctx.strokeStyle = `rgba(${style.ink}, ${(0.55 * alpha).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.9, radius * 1.9 * 0.408, 0, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
  };

  /**
   * 海王星的預言落點：1846 年勒維耶先從天王星軌道的偏差算出海王星該在哪，加勒當晚往那裡一看，
   * 就在預測的 1° 以內。飛到一半，目的地先浮出一個淡淡的細圈與四道刻度（算好的座標），
   * 點落進去時圈亮一下、收進點裡
   */
  const predicted = (p: Pt, alpha: number, scale: number) => {
    if (alpha <= 0.01 || scale <= 0.01) return;
    const radius = PREDICT_R * scale;
    ctx.strokeStyle = `rgba(${style.ink}, ${alpha.toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      ctx.moveTo(p.x + dx * (radius + 3), p.y + dy * (radius + 3));
      ctx.lineTo(p.x + dx * (radius + 3 + PREDICT_TICK * scale), p.y + dy * (radius + 3 + PREDICT_TICK * scale));
    }
    ctx.stroke();
  };

  const drawDust = (r: PaintState, dt: number, alpha: number) => {
    const keep: PaintState['dust'] = [];
    for (const p of r.dust) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = 1 - p.life / DUST_LIFE_MS;
      if (k <= 0) continue;
      keep.push(p);
      ctx.fillStyle = `rgba(${style.ink}, ${(0.7 * k * k * alpha).toFixed(3)})`;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    r.dust = keep;
  };

  return { dot, dustShells, drawHole, gravityWaves, tail, slingBody, predicted, drawDust };
}
