// 作品頁的螺旋航線（about/Works）：中心是起點，越新的作品越外圈；整條航線慢慢轉，塵埃沿著它往外流。
// 螺旋是一個斜放的盤面，每個螢幕都用同一個傾角看它（寬螢幕橫躺、直立的手機把鏡頭轉九十度）。
// 每件作品平常是星圖上的天體符號：一顆線畫的小星球，跟螺旋同一套平面的點與線；滑過才展開成立體的那顆星。
// 星長什麼樣子全由數據決定：
//   大小      程式碼量
//   地貌      主要語言是哪一族（Rust 岩石、TS/JS 氣態、Python 冰、其他是經線），
//             同一族的作品各拿一種不同的地貌，不會長得一樣
//   環        主要語言以外的語言，一種一圈（線型分語言：實線 TypeScript、虛線 Rust、點線 Python…）
//   衛星      GitHub 星星
//   自轉      最後一次推送越近轉得越快
// 這裡只有幾何與畫圖，不碰 React。
import { parseServerDate } from '@/lib/serverDate';

const TAU = Math.PI * 2;
const INK = '241, 236, 227';
const AMBER = '233, 193, 122';
const GROUND = '10, 10, 12';
const LIGHT = (() => {
  const v = [-0.55, 0.5, 0.67];
  const l = Math.hypot(...v);
  return v.map((x) => x / l) as [number, number, number];
})();

export interface WorkStats {
  name: string;
  commits: number;
  stars: number;
  pushedDaysAgo: number;
  languages: { name: string; bytes: number }[];
}

type Vec3 = [number, number, number];
type Family = 'gas' | 'rock' | 'ice' | 'other';

interface Moon {
  r: number;
  phase: number;
  speed: number;
  /** 軌道對環面的傾角：衛星不全在同一個平面上 */
  incl: number;
}

export interface Body {
  size: number;
  langs: [string, number][];
  span: number;
  tilt: number;
  roll: number;
  /** 扁率：轉得快的氣態星球扁一點 */
  flat: number;
  rings: [number, number][];
  /** 符號上的環：每種語言一圈 */
  bands: { r: number; lang: string }[];
  /** 立體那顆：這一點留不留（加在門檻上） */
  density: (p: Vec3) => number;
  /** 符號上的地貌線：星球表面上的曲線（星體座標），跟著自轉、只畫朝外的那半 */
  marks: Vec3[][];
  moons: Moon[];
  spinSpeed: number;
}

const hash = (s: string) => {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return (x >>> 0) / 4294967295;
};
// mulberry32：地貌要連續取三個數當一個方向，簡單的乘法同餘產生器連續幾個數彼此相關，
// 坑會全擠在星球的同一側
const seeded = (seed: number) => {
  let x = Math.floor(seed * 4294967295) >>> 0;
  return () => {
    x = (x + 0x6d2b79f5) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
};

const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** 垂直於 n 的兩個方向 */
const basis = (n: Vec3): [Vec3, Vec3] => {
  const u = norm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  return [u, cross(n, u)];
};
const randDir = (rnd: () => number): Vec3 => {
  const z = rnd() * 2 - 1;
  const a = rnd() * TAU;
  const r = Math.sqrt(1 - z * z);
  return [Math.cos(a) * r, z, Math.sin(a) * r];
};
const lonOf = (p: Vec3) => Math.atan2(p[2], p[0]);
const angle = (a: Vec3, b: Vec3) => Math.acos(Math.max(-1, Math.min(1, dot3(a, b))));

/** 緯線（可以帶波浪：wave 是振幅、k 是一圈幾個波） */
const latLine = (y0: number, wave = 0, k = 0, ph = 0): Vec3[] =>
  Array.from({ length: 73 }, (_, i) => {
    const a = (i / 72) * TAU;
    const y = Math.max(-0.98, Math.min(0.98, y0 + wave * Math.sin(k * a + ph)));
    const r = Math.sqrt(1 - y * y);
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  });

/** 經線：南極到北極 */
const lonLine = (phi: number): Vec3[] =>
  Array.from({ length: 33 }, (_, i) => {
    const th = -Math.PI / 2 + (Math.PI * i) / 32;
    return [Math.cos(th) * Math.cos(phi), Math.sin(th), Math.cos(th) * Math.sin(phi)];
  });

/** 球面上以 c 為中心、角半徑 rho 的一圈（wobble 讓它不那麼圓） */
const ringOn = (c: Vec3, rho: number, wobble = 0, ph = 0): Vec3[] => {
  const [u, v] = basis(c);
  return Array.from({ length: 49 }, (_, i) => {
    const a = (i / 48) * TAU;
    const p = rho * (1 + wobble * Math.sin(5 * a + ph));
    const cs = Math.cos(p);
    const sn = Math.sin(p);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    return norm([
      c[0] * cs + (u[0] * ca + v[0] * sa) * sn,
      c[1] * cs + (u[1] * ca + v[1] * sa) * sn,
      c[2] * cs + (u[2] * ca + v[2] * sa) * sn,
    ]);
  });
};

/** 從 c 沿著 dir 方向的大圓走，從角距 s0 走到 s1（撞擊坑的放射紋） */
const rayOn = (c: Vec3, dir: Vec3, s0: number, s1: number): Vec3[] =>
  Array.from({ length: 13 }, (_, i) => {
    const s = s0 + ((s1 - s0) * i) / 12;
    return norm([
      c[0] * Math.cos(s) + dir[0] * Math.sin(s),
      c[1] * Math.cos(s) + dir[1] * Math.sin(s),
      c[2] * Math.cos(s) + dir[2] * Math.sin(s),
    ]);
  });

const familyOf = (lang: string): Family => {
  if (lang === 'TypeScript' || lang === 'JavaScript') return 'gas';
  if (lang === 'Rust') return 'rock';
  if (lang === 'Python') return 'ice';
  return 'other';
};

/** 主要語言是哪一族（同一族的作品要各拿不同的地貌，見 bodyOf 的 variant） */
const familyOfWork = (w: WorkStats) =>
  familyOf(w.languages.reduce((top, l) => (l.bytes > top.bytes ? l : top), { name: 'Other', bytes: 0 }).name);

interface Surface {
  density: (p: Vec3) => number;
  marks: Vec3[][];
  tilt?: number;
  roll?: number;
  flat?: number;
}

/** 地貌：族決定是哪一類，variant 決定是這一類裡的哪一種 */
function surfaceOf(family: Family, variant: number, commits: number, rnd: () => number): Surface {
  const v = variant % 3;
  if (family === 'gas') {
    if (v === 1) {
      // 寬而柔的帶，像土星：帶少、邊界不硬；轉得快所以扁
      return {
        density: (p) => 0.12 + 0.3 * Math.cos(Math.asin(p[1]) * 5),
        marks: [latLine(0.3), latLine(-0.24), latLine(0.66), latLine(-0.62)],
        flat: 0.1,
      };
    }
    // 帶的邊界：commit 越多帶越多
    const n = Math.max(3, Math.min(8, Math.round(Math.log2(commits + 1))));
    const edges = Array.from({ length: n }, (_, k) => -0.82 + (1.64 * (k + 0.5 + (rnd() - 0.5) * 0.5)) / n);
    if (v === 2) {
      // 亂流：帶的邊界是波浪
      const ph = rnd() * TAU;
      const k = 3 + Math.floor(rnd() * 3);
      const wav = (p: Vec3, e: number) => e + 0.07 * Math.sin(k * lonOf(p) + ph + e * 9);
      return {
        density: (p) => (edges.filter((e) => p[1] > wav(p, e)).length % 2 ? 0.42 : -0.3),
        marks: edges.map((e) => latLine(e, 0.07, k, ph + e * 9)),
        flat: 0.05,
      };
    }
    // 一條一條的帶，加一個大風暴
    const lon = rnd() * TAU;
    const storm = norm([Math.cos(lon), -0.42, Math.sin(lon)]);
    return {
      density: (p) => {
        const d = angle(p, storm);
        if (d < 0.12) return -0.6;
        if (d < 0.2) return 0.7;
        return edges.filter((e) => p[1] > e).length % 2 ? 0.4 : -0.28;
      },
      marks: [...edges.slice(0, 6).map((e) => latLine(e)), ringOn(storm, 0.2, 0.05)],
      flat: 0.07,
    };
  }
  if (family === 'rock') {
    if (v === 1) {
      // 月海：幾塊大而暗的盆地，加上幾個小坑
      const maria = Array.from({ length: 3 }, () => ({ c: randDir(rnd), r: 0.3 + rnd() * 0.22, ph: rnd() * TAU }));
      const pits = Array.from({ length: 6 }, () => ({ c: randDir(rnd), r: 0.08 + rnd() * 0.08 }));
      return {
        density: (p) => {
          for (const k of pits) {
            const d = angle(p, k.c);
            if (d < k.r * 0.7) return -0.6;
            if (d < k.r) return 0.5;
          }
          for (const m of maria) if (angle(p, m.c) < m.r) return -0.5;
          return 0.12;
        },
        marks: [...maria.map((m) => ringOn(m.c, m.r, 0.12, m.ph)), ...pits.slice(0, 3).map((k) => ringOn(k.c, k.r))],
      };
    }
    if (v === 2) {
      // 一個大撞擊坑：兩圈坑緣，放射紋往外拉
      const c = randDir(rnd);
      const rays = Array.from({ length: 7 }, () => {
        const d = randDir(rnd);
        return norm([d[0] - c[0] * dot3(d, c), d[1] - c[1] * dot3(d, c), d[2] - c[2] * dot3(d, c)]);
      });
      return {
        density: (p) => {
          const s = angle(p, c);
          if (s < 0.38) return -0.55;
          if (s < 0.48) return 0.6;
          if (s > 0.6 && s < 0.66) return 0.5;
          for (const t of rays) {
            const n = cross(c, t);
            if (s < 1.4 && dot3(p, t) > 0 && Math.abs(dot3(p, n)) < 0.03) return 0.55;
          }
          return 0.02;
        },
        marks: [ringOn(c, 0.43, 0.04), ringOn(c, 0.63), ...rays.map((t) => rayOn(c, t, 0.68, 1.3))],
      };
    }
    // 坑坑洞洞：一個一個坑，坑裡沒有點、坑緣比較密
    const craters = Array.from({ length: 5 + Math.round(Math.log2(commits + 1)) }, () => ({
      c: randDir(rnd),
      r: 0.18 + rnd() * 0.22,
    }));
    return {
      density: (p) => {
        for (const k of craters) {
          const d = angle(p, k.c);
          if (d < k.r * 0.72) return -0.7;
          if (d < k.r) return 0.45;
        }
        return 0.08;
      },
      marks: [...craters]
        .sort((a, b) => b.r - a.r)
        .slice(0, 6)
        .map((k) => ringOn(k.c, k.r * 0.85, 0.08)),
    };
  }
  if (family === 'ice') {
    if (v === 1) {
      // 躺著轉的冰巨星：自轉軸幾乎倒成橫的，極區有一圈亮環
      return {
        density: (p) => {
          if (p[1] > 0.38 && p[1] < 0.5) return 0.85;
          if (p[1] >= 0.5) return 0.45;
          if (p[1] > -0.3 && p[1] < -0.2) return 0.5;
          return -0.34;
        },
        marks: [latLine(0.5), latLine(0.38), latLine(-0.25), latLine(0.75)],
        tilt: 0.3,
        roll: 1.35,
      };
    }
    if (v === 2) {
      // 兩面星：一半暗、一半亮，交界是一條歪歪的線
      const d = randDir(rnd);
      const ph = rnd() * TAU;
      return {
        density: (p) => {
          const s = dot3(p, d) + 0.1 * Math.sin(4 * lonOf(p) + ph);
          if (s > 0.08) return -0.55;
          if (s < -0.08) return 0.55;
          return 0.15;
        },
        marks: [ringOn(d, Math.PI / 2, 0.05, ph), ringOn(d, 0.5)],
      };
    }
    // 冰殼：兩極有冰冠，表面一道一道裂紋
    const cracks = Array.from({ length: 3 }, () => randDir(rnd));
    return {
      density: (p) => {
        if (Math.abs(p[1]) > 0.72) return 0.75;
        for (const n of cracks) if (Math.abs(dot3(p, n)) < 0.03) return 0.9;
        return -0.32;
      },
      marks: [latLine(0.72), latLine(-0.72), ...cracks.map((n) => ringOn(n, Math.PI / 2, 0.03))],
    };
  }
  // 其他：經線，幾條由名字決定
  const m = 4 + Math.floor(rnd() * 4);
  return {
    density: (p) => (Math.abs(Math.sin(lonOf(p) * (m / 2))) < 0.14 ? 0.8 : -0.42),
    marks: Array.from({ length: m }, (_, k) => lonLine((k * TAU) / m)),
  };
}

/**
 * variant：同一族的作品裡這是第幾件（0 起算）。同一族的作品各拿一種不同的地貌，
 * 不然三件 Python 的作品會是三顆一樣的冰
 */
function bodyOf(w: WorkStats, variant = 0): Body {
  const total = w.languages.reduce((a, l) => a + l.bytes, 0) || 1;
  const list = w.languages
    .map((l) => [l.name, l.bytes / total] as [string, number])
    .filter(([, v]) => v >= 0.05)
    .sort((a, b) => b[1] - a[1]);
  if (!list.length) list.push(['Other', 1]);
  const seed = hash(w.name);
  const rnd = seeded(seed);
  const size = Math.min(1, Math.max(0.42, 0.4 + 0.15 * Math.log10(total / 1e4)));
  const surface = surfaceOf(familyOf(list[0][0]), variant, w.commits, rnd);
  // 環：主要語言之外，每多一種語言多一圈帶，寬度照比例；寬的帶中間有一道縫
  const rings: [number, number][] = [];
  const bands: { r: number; lang: string }[] = [];
  if (list.length >= 2) {
    let r = 1.3;
    list.slice(1).forEach(([lang, share], k) => {
      const width = 0.22 + share * 1.1;
      const lines = Math.max(2, Math.round(width / 0.08));
      const gap = lines >= 4 && rnd() < 0.7 ? Math.floor(lines * (0.45 + rnd() * 0.3)) : -1;
      for (let j = 0; j < lines; j++) {
        if (j === gap) continue;
        rings.push([
          r + (j / lines) * width,
          0.2 + 0.42 * Math.sin((j / Math.max(1, lines - 1)) * Math.PI) * (1 - k * 0.2),
        ]);
      }
      bands.push({ r: r + width / 2, lang });
      r += width + 0.12;
    });
  }
  const outer = rings.length ? (rings.at(-1)?.[0] ?? 1) : 1;
  const moons = Array.from({ length: Math.min(4, Math.ceil(Math.log2(w.stars + 1))) }, (_, k) => {
    const r = outer + 0.45 + k * 0.42;
    return {
      r,
      phase: seed * TAU + k * 2.1,
      speed: 0.5 / Math.pow(r, 1.5),
      incl: (rnd() - 0.5) * (k === 0 ? 0.3 : 0.9),
    };
  });
  return {
    size,
    langs: list,
    span: Math.max(outer, moons.at(-1)?.r ?? 1),
    tilt: surface.tilt ?? 0.15 + rnd() * 0.55,
    roll: surface.roll ?? (rnd() - 0.5) * 0.6,
    flat: surface.flat ?? 0,
    rings,
    bands,
    density: surface.density,
    marks: surface.marks,
    moons,
    spinSpeed: 0.04 + 0.22 * Math.exp(-w.pushedDaysAgo / 60),
  };
}

/** 後端（或量好的備用值）的一筆 repo 數字 → 長星體要的那幾個數 */
export function workStatsOf(
  name: string,
  s: { commits: number; stars: number; pushed_at: string; languages: WorkStats['languages'] },
  now: number,
): WorkStats {
  return {
    name,
    commits: s.commits,
    stars: s.stars,
    pushedDaysAgo: Math.max(0, (now - parseServerDate(s.pushed_at).getTime()) / 86400000),
    languages: s.languages,
  };
}

/** 一串作品 → 星體：同一族（主要語言同一類）的作品照順序各拿不同的地貌 */
export function bodiesOf(works: WorkStats[]): Body[] {
  const seen = new Map<Family, number>();
  return works.map((w) => {
    const family = familyOfWork(w);
    const variant = seen.get(family) ?? 0;
    seen.set(family, variant + 1);
    return bodyOf(w, variant);
  });
}

const rotWith =
  (tilt: number, roll: number) =>
  (x0: number, y0: number, z0: number, spin: number): Vec3 => {
    let x = x0;
    let y = y0;
    let z = z0;
    const cs = Math.cos(spin);
    const sn = Math.sin(spin);
    [x, z] = [x * cs + z * sn, -x * sn + z * cs];
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    [y, z] = [y * ct - z * st, y * st + z * ct];
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    [x, y] = [x * cr - y * sr, x * sr + y * cr];
    return [x, y, z];
  };
const lit = (x: number, y: number, z: number) => Math.max(0, x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]);
const SPHERE: Vec3[] = Array.from({ length: 1400 }, (_, i) => {
  const y = 1 - (2 * (i + 0.5)) / 1400;
  const r = Math.sqrt(1 - y * y);
  const a = i * 2.399963229728653;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
});

/** 衛星在環面座標裡的位置（軌道各自有一點傾角） */
const moonAt = (m: Moon, t: number, pace: number): Vec3 => {
  const a = m.phase + t * m.speed * pace;
  const s = Math.sin(a) * m.r;
  return [Math.cos(a) * m.r, s * Math.sin(m.incl), s * Math.cos(m.incl)];
};
/** 符號上的衛星轉得比立體的快一點（符號小，太慢看不出在轉） */
const GLYPH_PACE = 2.5;

/** 立體的那顆星：點的星球（亮面密、暗面疏，地貌決定哪裡的點多）、線的環、點的衛星 */
export function drawBody(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  S: number,
  b: Body,
  spin: number,
  t: number,
  dim: number,
  amber: boolean,
) {
  const R = rotWith(b.tilt, b.roll);
  const ring = (front: boolean) => {
    for (const [r, a] of b.rings) {
      ctx.strokeStyle = `rgba(${INK}, ${a * dim})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i <= 160; i++) {
        const th = (i / 160) * TAU;
        const [x, y, z] = R(Math.cos(th) * r, 0, Math.sin(th) * r, 0);
        if (z >= 0 !== front || (z < 0 && x * x + y * y < 1)) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(cx + x * S, cy - y * S);
        else ctx.moveTo(cx + x * S, cy - y * S);
        pen = true;
      }
      ctx.stroke();
    }
  };
  const moons = (front: boolean) => {
    b.moons.forEach((m, k) => {
      const [x, y, z] = R(...moonAt(m, t, 1), 0);
      if (z >= 0 !== front || (z < 0 && x * x + y * y < 1)) return;
      const px = cx + x * S;
      const py = cy - y * S;
      if (amber && k === 0) {
        const glow = ctx.createRadialGradient(px, py, 0, px, py, 11);
        glow.addColorStop(0, `rgba(${AMBER}, 0.55)`);
        glow.addColorStop(1, `rgba(${AMBER}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, 11, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgb(${AMBER})`;
      } else ctx.fillStyle = `rgba(${INK}, ${0.85 * dim})`;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1.5, S * 0.05), 0, TAU);
      ctx.fill();
    });
  };
  ring(false);
  moons(false);
  ctx.strokeStyle = `rgba(${INK}, ${0.12 * dim})`;
  ctx.beginPath();
  ctx.arc(cx, cy, S, 0, TAU);
  ctx.stroke();
  const dotScale = Math.min(1, S / 70) * 0.55 + 0.45;
  const squash = 1 - b.flat;
  for (let i = 0; i < SPHERE.length; i++) {
    const p = SPHERE[i];
    const [x, y, z] = R(p[0], p[1] * squash, p[2], spin);
    if (z <= 0) continue;
    const l = lit(x, y, z);
    // 地貌照亮度放大：亮面看得出帶與坑，暗面本來就稀
    if ((i * 0.618034) % 1 > (0.22 + l * 0.85) * (1 + 1.4 * b.density(p))) continue;
    const size = (0.7 + l * 1.3) * dotScale;
    ctx.fillStyle = `rgba(${INK}, ${(0.3 + l * 0.7) * dim})`;
    ctx.fillRect(cx + x * S - size / 2, cy - y * S - size / 2, size, size);
  }
  ring(true);
  moons(true);
}

/** 線型分語言 */
const DASH: Record<string, number[]> = {
  TypeScript: [],
  Rust: [4, 3],
  Python: [1, 3],
  JavaScript: [8, 3],
  CSS: [1, 1.6],
  Shell: [2, 5],
};

/** 符號的星球半徑（CSS 像素）：程式碼越多越大 */
const glyphRadius = (b: Body, unit: number) => (7 + 12 * (b.size - 0.42)) * Math.max(0.8, Math.min(1.3, unit / 900));

/**
 * 星圖上的天體符號：一顆線畫的小星球。輪廓、地貌線（跟著自轉）、每種語言一圈環、衛星是點。
 * 環與衛星的後半被星球擋住。回傳最外緣的半徑（字擺在它外面）
 */
export function drawGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rc: number,
  b: Body,
  spin: number,
  t: number,
  alpha: number,
  lit: boolean,
) {
  const outer = rc * b.span;
  if (alpha <= 0.01) return outer;
  const R = rotWith(b.tilt, b.roll);
  const hidden = (px: number, py: number, pz: number) => pz < 0 && px * px + py * py < 1;
  ctx.lineWidth = 1;
  const bands = (front: boolean) => {
    for (const { r, lang } of b.bands) {
      ctx.setLineDash(DASH[lang] ?? [2, 2]);
      ctx.strokeStyle = `rgba(${INK}, ${(front ? 0.55 : 0.3) * alpha})`;
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i <= 96; i++) {
        const th = (i / 96) * TAU;
        const [px, py, pz] = R(Math.cos(th) * r, 0, Math.sin(th) * r, 0);
        if (pz >= 0 !== front || hidden(px, py, pz)) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(x + px * rc, y - py * rc);
        else ctx.moveTo(x + px * rc, y - py * rc);
        pen = true;
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  };
  const moons = (front: boolean) => {
    b.moons.forEach((m, k) => {
      const [px, py, pz] = R(...moonAt(m, t, GLYPH_PACE), 0);
      if (pz >= 0 !== front || hidden(px, py, pz)) return;
      const amber = lit && k === 0;
      ctx.fillStyle = amber ? `rgba(${AMBER}, ${alpha})` : `rgba(${INK}, ${0.8 * alpha})`;
      ctx.beginPath();
      ctx.arc(x + px * rc, y - py * rc, amber ? 2 : 1.3, 0, TAU);
      ctx.fill();
    });
  };
  bands(false);
  moons(false);
  // 星球本身擋住後面的東西（環的後半、背景的星）
  ctx.fillStyle = `rgba(${GROUND}, ${alpha})`;
  ctx.beginPath();
  ctx.arc(x, y, rc, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = lit && !b.moons.length ? `rgba(${AMBER}, ${alpha})` : `rgba(${INK}, ${0.8 * alpha})`;
  ctx.stroke();
  ctx.strokeStyle = `rgba(${INK}, ${0.55 * alpha})`;
  const squash = 1 - b.flat;
  for (const curve of b.marks) {
    ctx.beginPath();
    let pen = false;
    for (const p of curve) {
      const [px, py, pz] = R(p[0], p[1] * squash, p[2], spin);
      if (pz <= 0.04) {
        pen = false;
        continue;
      }
      if (pen) ctx.lineTo(x + px * rc, y - py * rc);
      else ctx.moveTo(x + px * rc, y - py * rc);
      pen = true;
    }
    ctx.stroke();
  }
  bands(true);
  moons(true);
  return outer;
}

/** 相鄰兩件作品在螺旋上隔多少弧度；最外一件之後還有一段「還沒做的」虛點 */
const STEP = 1.2;
const AHEAD = 2.4;
/** 盤面的傾角：短軸是長軸的幾倍。每個螢幕都用這個角度看 */
const INCLINE = 0.48;
/** 筆尖後面那段亮的線有多長（弧度） */
const PEN_TAIL = 0.9;

/** 螺旋在畫面上的框：寬螢幕橫躺、置中；直立的螢幕把鏡頭轉九十度，長軸改成直的 */
export function frameOf(w: number, h: number) {
  if (w >= h) {
    const rx = Math.min(w * 0.42, (h * 0.4) / INCLINE);
    return { cx: w / 2, cy: h / 2, rx, ry: rx * INCLINE };
  }
  const ry = Math.min(h * 0.34, (w * 0.44) / INCLINE);
  return { cx: w / 2, cy: h * 0.56, rx: ry * INCLINE, ry };
}

export interface SpiralFrame {
  w: number;
  h: number;
  t: number;
  dt: number;
  /** 滑過或聚焦的是第幾件，-1 是沒有 */
  near: number;
  /** 0 到 1：琥珀點從中心畫到哪裡 */
  grow: number;
  /** 0 到 1：收的時候從中心往外擦掉到哪裡（換頁時整條收進最新那一顆） */
  erase: number;
  /** 0 到 1：筆尖落地之後，它的光暈與亮的那段線退掉到哪裡 */
  settle: number;
}

const smooth = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

export function createSpiral(bodies: Body[]) {
  const n = bodies.length;
  const tLast = (n - 1) * STEP;
  const flow = Array.from({ length: 320 }, () => ({
    th: Math.random() * (tLast + AHEAD),
    off: (Math.random() - 0.5) * 2,
    j: Math.random(),
  }));
  /** 每一顆展開成立體的程度（滑過時 0 → 1） */
  const open = bodies.map(() => 0);
  const newest = n - 1;

  const placer = (w: number, h: number, t: number) => {
    const { cx, cy, rx, ry } = frameOf(w, h);
    const spin = t * 0.025;
    return (th: number, off = 0): [number, number] => {
      const r = 0.13 + (0.87 * th) / (tLast + AHEAD);
      const a = th + spin;
      return [cx + Math.cos(a) * (r * rx + off), cy + Math.sin(a) * (r * ry + off * 0.8)];
    };
  };

  const spinOf = (i: number, t: number) => t * bodies[i].spinSpeed * 2 + i;

  /** 第 i 件的符號上，第一顆衛星現在在哪（沒有衛星就是星球中心）：最新那一件的琥珀點 */
  const moonOf = (i: number, w: number, h: number, t: number): [number, number] => {
    const [x, y] = placer(w, h, t)(i * STEP);
    const b = bodies[i];
    if (!b.moons.length) return [x, y];
    const rc = glyphRadius(b, Math.min(w, h));
    const [px, py] = rotWith(b.tilt, b.roll)(...moonAt(b.moons[0], t, GLYPH_PACE), 0);
    return [x + px * rc, y - py * rc];
  };

  /** 螺旋上 th 處往外走的方向（單位向量） */
  const tangent = (w: number, h: number, t: number, th: number) => {
    const P = placer(w, h, t);
    const [x0, y0] = P(th);
    const [x1, y1] = P(th + 0.02);
    const l = Math.hypot(x1 - x0, y1 - y0) || 1;
    return { x: (x1 - x0) / l, y: (y1 - y0) / l };
  };

  /** 每一件作品現在在畫面上的哪裡（找最近的那件、擺字都要用） */
  const positions = (w: number, h: number, t: number) => {
    const P = placer(w, h, t);
    return bodies.map((_, i) => P(i * STEP));
  };

  /** 畫一幀；回傳每一件的位置與符號外緣（字擺在外面） */
  function draw(ctx: CanvasRenderingContext2D, f: SpiralFrame) {
    const { w, h, t, dt, near, grow, erase, settle } = f;
    ctx.clearRect(0, 0, w, h);
    const P = placer(w, h, t);
    const reach = tLast * grow;
    const from = tLast * erase;
    // 航線：走過的是線，再往外（還沒做的）是虛點
    if (reach > from) {
      ctx.strokeStyle = `rgba(${INK}, 0.26)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k <= 400; k++) {
        const [x, y] = P(from + (k / 400) * (reach - from));
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    if (grow >= 1) {
      for (let th = tLast; th < tLast + AHEAD; th += 0.035) {
        const [x, y] = P(th);
        ctx.fillStyle = `rgba(${INK}, ${0.22 * (1 - (th - tLast) / AHEAD) * (1 - erase)})`;
        ctx.fillRect(x, y, 1.4, 1.4);
      }
    }
    // 塵埃沿著航線往外流：時間
    for (const p of flow) {
      p.th += dt * (0.12 + 0.1 * p.j);
      if (p.th > tLast + AHEAD) p.th = Math.random() * 0.4;
      if (p.th > reach + 0.4 || p.th < from) continue;
      const [x, y] = P(p.th, p.off * 7);
      ctx.fillStyle = `rgba(${INK}, ${0.15 + 0.35 * p.j * (1 - p.th / (tLast + AHEAD))})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
    // 琥珀點是筆尖：從起點沿著航線往外畫，最後落在最新那一件，變成它的衛星
    // 落地之後光暈與亮線慢慢退掉，不是一到就不見
    const pen = grow < 1 ? 1 : 1 - settle;
    if (grow > 0 && pen > 0) {
      const tail = Math.max(0, reach - PEN_TAIL);
      for (let k = 1; k <= 30; k++) {
        const [x0, y0] = P(tail + ((k - 1) / 30) * (reach - tail));
        const [x1, y1] = P(tail + (k / 30) * (reach - tail));
        // 疊在本來那條線上，只疊「多亮的那一份」：退到 0 時剛好就是航線本來的亮度，不會跳一下
        ctx.strokeStyle = `rgba(${INK}, ${(0.6 * Math.pow(k / 30, 2) * pen).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      const land = smooth(0.9, 1, grow);
      const [sx, sy] = P(reach);
      const [mx, my] = moonOf(newest, w, h, t);
      const px = sx + (mx - sx) * land;
      const py = sy + (my - sy) * land;
      const glow = ctx.createRadialGradient(px, py, 0, px, py, 12);
      glow.addColorStop(0, `rgba(${AMBER}, ${0.6 * pen})`);
      glow.addColorStop(1, `rgba(${AMBER}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, 12, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(${AMBER}, ${pen})`;
      ctx.beginPath();
      ctx.arc(px, py, 2.6 - 0.6 * land, 0, TAU);
      ctx.fill();
    }
    const unit = Math.min(w, h);
    return bodies.map((b, i) => {
      const [x, y] = P(i * STEP);
      // 筆尖還沒畫到的作品先不出現；收的時候被擦過的跟著退掉
      // 最新那一顆在收的最後也淡掉，只剩轉場的琥珀點（不然換頁那一刻它會突然消失）
      const appear =
        Math.min(1, Math.max(0, (reach - i * STEP) / 0.6 + 1)) *
        Math.min(1, Math.max(0, (i * STEP - from) / 0.6 + 1)) *
        (i === newest ? 1 - smooth(0.4, 1, erase) : 1);
      const on = i === near;
      const lit = on || (near < 0 && i === newest && grow >= 1);
      open[i] += ((on ? 1 : 0) - open[i]) * Math.min(1, dt * 7);
      const k = open[i] * open[i] * (3 - 2 * open[i]);
      const rc = glyphRadius(b, unit);
      const spin = spinOf(i, t);
      // 平常是符號；滑過時符號淡掉、立體的那顆從符號那顆長大
      const gr = drawGlyph(ctx, x, y, rc, b, spin, t, (1 - k) * (near < 0 || on ? 1 : 0.5) * appear, lit);
      const full = Math.min(unit * 0.05 * (0.55 + b.size), (unit * 0.085) / b.span);
      const S = rc + (full - rc) * k;
      if (k > 0.02) drawBody(ctx, x, y, S, b, spin, t, k, b.moons.length > 0);
      return { x, y, reach: Math.max(gr + 6, S * b.span * k) + 12, appear };
    });
  }

  return {
    draw,
    positions,
    tangent,
    moonOf,
    newest,
    tLast,
    point: (w: number, h: number, t: number, th: number) => placer(w, h, t)(th),
  };
}
