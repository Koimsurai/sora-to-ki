// 收藏頁的三團星雲（media/Collection）：看過的、讀過的、常聽的各是一團，每部作品是一顆星。
// 一團裡照時間由內往外捲成渦旋（越新的越外圈），斜著看（跟作品頁的螺旋同一個傾角感），
// 每一團再轉一個不同的角度。往下捲就是鏡頭在三團之間飛，琥珀點在前面帶路、停在每一團的核心。
// 這裡只有幾何與畫圖，不碰 React。

const TAU = Math.PI * 2;
const INK = '241, 236, 227';
const AMBER = '233, 193, 122';
/** 一團的傾角：短軸是長軸的幾倍 */
const INCLINE = 0.56;

export interface Star {
  id: string;
  title: string;
  meta: string;
  /** 滑過時望遠鏡裡的那張封面 */
  cover: string | null;
  href: string | null;
  /** 0 到 1：多大（集數、頁數、排名） */
  size: number;
  /** 0 到 1：多亮（多近期、評分、排名） */
  light: number;
  /** 最愛的：琥珀色，旁邊標著那句話 */
  quote?: string | null;
  amber?: boolean;
  /** 想讀的書是空心圈；在讀的會呼吸 */
  hollow?: boolean;
  pulse?: boolean;
}

export interface Cloud {
  key: string;
  /** 由舊到新（舊的在內圈） */
  stars: Star[];
}

interface Placed {
  x: number;
  y: number;
  r: number;
  phase: number;
}

const hash = (s: string) => {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return (x >>> 0) / 4294967295;
};

/** 每一團在世界裡的位置（以畫面尺寸為單位）、轉的角度、大小 */
const LAYOUT = [
  { x: 0, y: 0, tilt: -0.32, scale: 1 },
  { x: 0.3, y: 1.18, tilt: 0.28, scale: 0.72 },
  { x: -0.24, y: 2.36, tilt: -0.12, scale: 0.68 },
] as const;

/** 一團裡每顆星的位置（以這一團的半徑為 1）：向日葵式的分布再捲一點，越新越外圈 */
function placeCloud(c: Cloud, tilt: number): Placed[] {
  const n = Math.max(1, c.stars.length);
  return c.stars.map((s, i) => {
    const h = hash(s.id);
    const r = Math.sqrt((i + 0.6) / (n + 0.6)) * (0.92 + 0.16 * h);
    const a = i * 2.399963 + r * 2.4 + (h - 0.5) * 0.4;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r * INCLINE;
    return {
      x: x * Math.cos(tilt) - y * Math.sin(tilt),
      y: x * Math.sin(tilt) + y * Math.cos(tilt),
      r,
      phase: h * TAU,
    };
  });
}

export interface SkyFrame {
  w: number;
  h: number;
  t: number;
  /** 0 到 2：鏡頭在哪一團（整數是停在那一團上） */
  p: number;
  hovered: string | null;
  /** 0 到 1：琥珀點落地之後星雲從核心散開到哪裡 */
  bloom: number;
  /** 畫不畫琥珀點（換頁轉場的點還在飛時由轉場畫） */
  dot?: boolean;
}

export interface Projected {
  id: string;
  x: number;
  y: number;
  cloud: number;
}

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export function createNebula(clouds: Cloud[]) {
  const placed = clouds.map((c, i) => placeCloud(c, LAYOUT[i]?.tilt ?? 0));
  // 星雲的霧：每顆星旁邊散幾粒很淡的塵，加上一圈照同樣分布的散塵
  const dust = clouds.map((c, i) => {
    const seed = hash(c.key);
    let s = seed * 1000;
    const rnd = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    const pts = placed[i].flatMap((p) =>
      Array.from({ length: 3 }, () => ({
        x: p.x + (rnd() - 0.5) * 0.12,
        y: p.y + (rnd() - 0.5) * 0.08,
        a: 0.04 + rnd() * 0.1,
      })),
    );
    for (let k = 0; k < 260; k++) {
      const r = Math.sqrt(rnd()) * 1.15;
      const a = rnd() * TAU;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r * INCLINE;
      const tilt = LAYOUT[i]?.tilt ?? 0;
      pts.push({
        x: x * Math.cos(tilt) - y * Math.sin(tilt),
        y: x * Math.sin(tilt) + y * Math.cos(tilt),
        a: 0.03 + rnd() * 0.07,
      });
    }
    return pts;
  });

  // 背景的星：散在各種深度，鏡頭移動時遠的挪得少、近的挪得多（頁面自己的背景星空讓位給它）
  let fs = 0.37 * 233280;
  const frnd = () => {
    fs = (fs * 9301 + 49297) % 233280;
    return fs / 233280;
  };
  const field = Array.from({ length: 420 }, () => ({
    x: frnd(),
    y: frnd(),
    depth: 0.08 + frnd() * frnd() * 0.5,
    a: 0.12 + frnd() * 0.45,
    size: 0.6 + frnd() * 0.9,
  }));

  /** 畫面座標：鏡頭停在第 p 團時，那一團的核心在畫面的哪裡；一團有多大（像素） */
  const view = (w: number, h: number) => {
    const unit = Math.min(w, h);
    const narrow = w < 760;
    return {
      unit,
      /** 核心在畫面上的位置：寬螢幕偏右（左邊留給標註），窄螢幕偏下 */
      focus: narrow ? { x: w * 0.5, y: h * 0.58 } : { x: w * 0.6, y: h * 0.52 },
      radius: (narrow ? 0.42 : 0.36) * unit,
    };
  };

  /** 世界座標（以畫面尺寸為單位）在畫面上的位置 */
  const camera = (f: SkyFrame) => {
    const { focus } = view(f.w, f.h);
    // 鏡頭在兩團之間：停留在每一團附近，中段才快速飛過去
    const seg = Math.min(LAYOUT.length - 2, Math.floor(f.p));
    const k = smooth(0.22, 0.78, f.p - seg);
    const a = LAYOUT[seg];
    const b = LAYOUT[seg + 1];
    const cx = (a.x + (b.x - a.x) * k) * f.w;
    const cy = (a.y + (b.y - a.y) * k) * f.h;
    // 飛的時候鏡頭稍微拉遠，看得到下一團從遠處過來
    const zoom = 1 - 0.18 * Math.sin(Math.PI * k);
    return {
      zoom,
      cx,
      cy,
      at: (wx: number, wy: number) => ({ x: focus.x + (wx * f.w - cx) * zoom, y: focus.y + (wy * f.h - cy) * zoom }),
    };
  };

  /** 第 i 團的核心在畫面上的哪裡 */
  const core = (f: SkyFrame, i: number) => {
    const L = LAYOUT[i];
    return camera(f).at(L.x, L.y);
  };

  /** 琥珀點：走在鏡頭前面一點點，鏡頭停下時它停在那一團的核心 */
  const dot = (f: SkyFrame) => {
    const seg = Math.min(LAYOUT.length - 2, Math.floor(f.p));
    const k = smooth(0.12, 0.68, f.p - seg);
    const a = LAYOUT[seg];
    const b = LAYOUT[seg + 1];
    // 兩團之間走一道弧（往外拱），不是直線
    const bow = Math.sin(Math.PI * k) * 0.12;
    return camera(f).at(a.x + (b.x - a.x) * k + bow, a.y + (b.y - a.y) * k);
  };

  function draw(ctx: CanvasRenderingContext2D, f: SkyFrame): Projected[] {
    const { w, h, t } = f;
    ctx.clearRect(0, 0, w, h);
    const { radius } = view(w, h);
    const cam = camera(f);
    const out: Projected[] = [];
    for (const st of field) {
      const x = (((st.x * w - cam.cx * st.depth) % w) + w) % w;
      const y = (((st.y * h - cam.cy * st.depth) % h) + h) % h;
      ctx.fillStyle = `rgba(${INK}, ${st.a.toFixed(3)})`;
      ctx.fillRect(x, y, st.size, st.size);
    }
    clouds.forEach((c, i) => {
      const L = LAYOUT[i];
      const R = radius * L.scale * cam.zoom;
      const o = cam.at(L.x, L.y);
      if (o.x < -R * 1.4 || o.x > w + R * 1.4 || o.y < -R || o.y > h + R) return;
      // 離鏡頭停的那一團越遠越暗：飛的時候前後兩團一起看得到，停下來時旁邊那團退到遠處
      const focus = (1 - Math.min(1, Math.abs(f.p - i)) * 0.55) * f.bloom;
      const spread = 0.15 + 0.85 * f.bloom;
      // 核心的一點微光
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, R * 0.5);
      g.addColorStop(0, `rgba(${INK}, ${(0.05 * focus).toFixed(3)})`);
      g.addColorStop(1, `rgba(${INK}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(o.x, o.y, R * 0.5, 0, TAU);
      ctx.fill();
      for (const d of dust[i]) {
        ctx.fillStyle = `rgba(${INK}, ${(d.a * focus).toFixed(3)})`;
        ctx.fillRect(o.x + d.x * R * spread, o.y + d.y * R * spread, 1, 1);
      }
      c.stars.forEach((s, k) => {
        const p = placed[i][k];
        const x = o.x + p.x * R * spread;
        const y = o.y + p.y * R * spread;
        out.push({ id: s.id, x, y, cloud: i });
        const on = s.id === f.hovered;
        const twinkle = 0.85 + 0.15 * Math.sin(t * 1.3 + p.phase);
        const breathe = s.pulse ? 0.6 + 0.4 * Math.sin(t * 2.2 + p.phase) : 1;
        const size = (0.9 + s.size * 2.2) * (on ? 1.6 : 1) * Math.max(0.7, cam.zoom);
        const alpha = Math.min(1, (0.25 + 0.75 * s.light) * twinkle * breathe * focus + (on ? 0.3 : 0));
        if (s.amber || on) {
          const halo = ctx.createRadialGradient(x, y, 0, x, y, size * 6);
          halo.addColorStop(0, `rgba(${s.amber ? AMBER : INK}, ${(0.35 * alpha).toFixed(3)})`);
          halo.addColorStop(1, `rgba(${s.amber ? AMBER : INK}, 0)`);
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(x, y, size * 6, 0, TAU);
          ctx.fill();
        }
        const color = s.amber ? AMBER : INK;
        if (s.hollow) {
          ctx.strokeStyle = `rgba(${color}, ${alpha.toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(x, y, size, 0, TAU);
          ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(${color}, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, y, size / 2 + 0.4, 0, TAU);
          ctx.fill();
        }
      });
    });
    // 琥珀點：帶路的那一點
    if (f.dot === false) return out;
    const d = dot(f);
    const halo = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, 16);
    halo.addColorStop(0, `rgba(${AMBER}, 0.5)`);
    halo.addColorStop(1, `rgba(${AMBER}, 0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(d.x, d.y, 16, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgb(${AMBER})`;
    ctx.beginPath();
    ctx.arc(d.x, d.y, 2.8, 0, TAU);
    ctx.fill();
    return out;
  }

  /** 第 i 團在畫面上的大小（標註要擺在它旁邊） */
  const cloudRadius = (f: SkyFrame, i: number) => view(f.w, f.h).radius * LAYOUT[i].scale * camera(f).zoom;

  return { draw, core, dot, cloudRadius, count: LAYOUT.length };
}
