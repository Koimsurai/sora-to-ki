// 收藏頁（media/Collection）的天空：每部作品是看完、讀完、聽完的那一刻從地球發出的一道訊號，
// 到現在以光速往外飛了一段距離，所以距離就是離現在多久。往下捲是鏡頭從地球往外退（對數尺度），
// 一路經過月球、行星、航海家一號、太陽圈邊界、歐特雲，到附近的恆星。
// 行星與月球用平均軌道算今天的位置，恆星用真的赤經、赤緯與距離。這裡只有幾何與畫圖，不碰 React。

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const INK = '241, 236, 227';
const AMBER = '233, 193, 122';

/** 一光年、一天文單位各是幾光秒 */
export const LIGHT_YEAR = 31_557_600;
const AU = 499.005;
const DAY_MS = 86_400_000;
const J2000 = Date.UTC(2000, 0, 1, 12);
const OBLIQUITY = 23.44 * DEG;
/** 鏡頭從多近開始（光秒）：地球佔畫面一小塊，月球還在畫面外 */
const NEAREST = 0.2;
/** 地球半徑（光秒） */
const EARTH_LS = 0.02127;
/** 琥珀點在地球上的哪裡：台灣（緯度、經度） */
const HOME_LAT = 23.7;
const HOME_LON = 121;
/** 地球用幾個點畫 */
const GLOBE_DOTS = 640;
/** 最遠至少看到哪裡（光年）：天狼星在畫面邊上 */
const FARTHEST_LY = 9.2;

type SignalKind = 'watch' | 'book' | 'music';

export interface Signal {
  id: string;
  kind: SignalKind;
  title: string;
  meta: string;
  /** 滑過時接收畫面裡的那張封面 */
  cover: string | null;
  href: string | null;
  /** 發出的時間（毫秒）；null 是還沒發出的 */
  at: number | null;
  /** 0 到 1：多大（集數、頁數、排名） */
  size: number;
  /** 最愛的：琥珀色，旁邊標著名字，接收畫面裡有寫的那句話 */
  amber?: boolean;
  quote?: string | null;
  /** 還在地球上：想讀的書還沒發出（queued）；在讀的、正在看／聽的（live） */
  home?: 'queued' | 'live';
  /** 正在播：地球一直往外發著波 */
  on?: boolean;
  /** 紀錄開始之前的（最愛卻沒有觀看紀錄）：排在紀錄的外緣 */
  beyond?: boolean;
}

export interface SkyFrame {
  w: number;
  h: number;
  /** 現在（毫秒）：訊號飛多遠、行星在哪裡都照它算 */
  now: number;
  /** 動畫時間（秒） */
  t: number;
  /** 0 到 1：捲到哪裡（0 在地球旁邊，1 在最遠的訊號外面） */
  s: number;
  hovered: string | null;
  /** 0 到 1：落地之後第一道波前擴散到哪裡 */
  bloom: number;
  /** 畫不畫地球那一點（換頁轉場的點還在飛時由轉場畫） */
  dot?: boolean;
}

export interface Projected {
  id: string;
  x: number;
  y: number;
  /** 0 到 1：現在看得多清楚（太近擠在地球上、太遠出了畫面的是 0） */
  a: number;
}

/** 地標的名字要擺在哪裡；dist 是離地球多遠（光秒） */
interface Mark {
  key: string;
  x: number;
  y: number;
  a: number;
  dist: number;
}

interface Vec {
  x: number;
  y: number;
  z: number;
}

interface Body {
  key: string;
  /** 軌道半徑（天文單位） */
  a: number;
  /** J2000 的平黃經（度）與每天走幾度 */
  L0: number;
  n: number;
}

const EARTH: Body = { key: 'earth', a: 1, L0: 100.46, n: 0.98561 };
const PLANETS: Body[] = [
  { key: 'mercury', a: 0.387, L0: 252.25, n: 4.09233 },
  { key: 'venus', a: 0.723, L0: 181.98, n: 1.60213 },
  { key: 'mars', a: 1.524, L0: 355.45, n: 0.52403 },
  { key: 'jupiter', a: 5.203, L0: 34.4, n: 0.08309 },
  { key: 'saturn', a: 9.537, L0: 49.94, n: 0.03346 },
  { key: 'uranus', a: 19.19, L0: 313.23, n: 0.01173 },
  { key: 'neptune', a: 30.07, L0: 304.88, n: 0.00598 },
];

/** 月球離地球多遠（光秒） */
const MOON_LS = 1.282;
/** 地球同步軌道（光秒）：離地心 42,164 公里 */
const GEO_LS = 0.1406;
/** 韋伯太空望遠鏡在日地 L2：離地球 150 萬公里，在太陽的正後方 */
const L2_LS = 5.0;
/** 太陽圈邊界（天文單位）：航海家一號在 121 AU 穿過 */
const HELIOPAUSE_AU = 120;
/** 歐特雲的內外緣（天文單位） */
const OORT_AU = [2000, 100_000] as const;

/** 附近的恆星：赤經（小時）、赤緯（度）、距離（光年）、亮度；label false 的跟旁邊那顆擠在一起，不標名字 */
const STARS = [
  { key: 'proxima', ra: 14.495, dec: -62.68, ly: 4.246, mag: 0.35, label: true },
  { key: 'alphaCen', ra: 14.66, dec: -60.83, ly: 4.37, mag: 1, label: false },
  { key: 'barnard', ra: 17.963, dec: 4.69, ly: 5.96, mag: 0.3, label: true },
  { key: 'wolf359', ra: 10.94, dec: 7.01, ly: 7.86, mag: 0.25, label: true },
  { key: 'lalande', ra: 11.06, dec: 35.97, ly: 8.31, mag: 0.3, label: true },
  { key: 'sirius', ra: 6.752, dec: -16.72, ly: 8.6, mag: 1.2, label: true },
  { key: 'epsEri', ra: 3.549, dec: -9.46, ly: 10.47, mag: 0.5, label: true },
  { key: 'procyon', ra: 7.655, dec: 5.22, ly: 11.46, mag: 0.9, label: true },
  { key: 'tauCeti', ra: 1.734, dec: -15.94, ly: 11.91, mag: 0.5, label: true },
] as const;

/** 刻度圈：一光分、一光時、一光日、一光年（離地球這麼遠的訊號，就是這麼久以前發出的） */
const SCALES = [
  { key: 'scale-sec', r: 1 },
  { key: 'scale-min', r: 60 },
  { key: 'scale-hour', r: 3600 },
  { key: 'scale-day', r: 86_400 },
  { key: 'scale-year', r: LIGHT_YEAR },
] as const;

/** 每種訊號從地球的哪一側出去（中心角、張開多寬）：在看佔前面一大片，書與歌在後面 */
const SECTOR = {
  watch: [Math.PI / 2, 3.4],
  book: [-1.0, 1.3],
  music: [-2.2, 1.4],
} as const;

/** 航海家一號：往蛇夫座方向飛，2026 年 11 月中離地球一光日，每年再遠 3.57 AU */
const VOYAGER_DIR = direction(17.22, 12.1);
const VOYAGER_AT = Date.UTC(2026, 10, 15);
const voyagerAu = (now: number) => 173.1 + (3.57 * (now - VOYAGER_AT)) / (365.25 * DAY_MS);

/** 赤經（小時）、赤緯（度）換成黃道座標裡的方向 */
function direction(raH: number, decD: number): Vec {
  const ra = raH * 15 * DEG;
  const dec = decD * DEG;
  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.cos(dec) * Math.sin(ra);
  const z = Math.sin(dec);
  return {
    x,
    y: y * Math.cos(OBLIQUITY) + z * Math.sin(OBLIQUITY),
    z: -y * Math.sin(OBLIQUITY) + z * Math.cos(OBLIQUITY),
  };
}

/** 地球上的一點（緯度、經度）現在朝哪個方向：照恆星時跟著地球轉，再換成黃道座標 */
function surface(latD: number, lonD: number, days: number): Vec {
  const gmst = 18.697374558 + 24.06570982441908 * days;
  return direction((((gmst + lonD / 15) % 24) + 24) % 24, latD);
}

/** 行星繞太陽的位置（光秒），圓軌道 */
function helio(b: Body, days: number): Vec {
  const L = (b.L0 + b.n * days) * DEG;
  return { x: Math.cos(L) * b.a * AU, y: Math.sin(L) * b.a * AU, z: 0 };
}

const hash = (s: string) => {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return (x >>> 0) / 4294967295;
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => x * x * (3 - 2 * x);
const rgba = (c: string, a: number) => `rgba(${c}, ${a.toFixed(3)})`;

export function createSignalSky(signals: Signal[], now0: number) {
  const sent = signals.filter((s) => s.at !== null);
  const homes = signals.filter((s) => s.home);
  const broadcasting = signals.some((s) => s.on);
  /** 最早那一道紀錄飛了多遠（光秒）：紀錄的外緣 */
  const edgeAt = Math.min(now0, ...sent.map((s) => s.at ?? now0));
  const L0 = Math.log10(NEAREST);
  const L1 = Math.log10(Math.max(((now0 - edgeAt) / 1000) * 1.3, FARTHEST_LY * LIGHT_YEAR));

  // 每種訊號在自己那一側照黃金角散開（同一種不會擠成一團）
  const angle = new Map<string, number>();
  for (const kind of ['watch', 'book', 'music'] as const) {
    const [center, spread] = SECTOR[kind];
    signals
      .filter((s) => s.kind === kind && !s.home)
      .forEach((s, i) => angle.set(s.id, center + (((i * 0.618034 + hash(s.id) * 0.2) % 1) - 0.5) * spread));
  }
  const homeAngle = new Map(homes.map((s, i) => [s.id, (i / Math.max(1, homes.length)) * TAU]));

  // 地球：均勻撒在球面上的點（緯度、經度），照真的時間轉，向著太陽的那半邊亮
  const globe = Array.from({ length: GLOBE_DOTS }, (_, i) => ({
    lat: Math.asin(1 - (2 * (i + 0.5)) / GLOBE_DOTS) / DEG,
    lon: ((i * 137.508) % 360) - 180,
  }));
  // 鏡頭一開始轉到台灣朝向畫面（稍微偏一點，看得出是球）
  const home0 = surface(HOME_LAT, HOME_LON, (now0 - J2000) / DAY_MS);
  const psi0 = Math.PI / 2 - Math.atan2(home0.y, home0.x) - 0.35;

  // 歐特雲：內外緣之間的冰塵，四面八方都有
  const orand = rng(7);
  const oort = Array.from({ length: 900 }, () => {
    const r = 10 ** (Math.log10(OORT_AU[0]) + orand() * Math.log10(OORT_AU[1] / OORT_AU[0])) * AU;
    const z = orand() * 2 - 1;
    const phi = orand() * TAU;
    const c = Math.sqrt(1 - z * z);
    return { p: { x: Math.cos(phi) * c * r, y: Math.sin(phi) * c * r, z: z * r }, r, a: 0.06 + orand() * 0.18 };
  });

  // 背景的星：無限遠，只跟著鏡頭轉（遠的挪得少、近的挪得多）
  const frand = rng(11);
  const field = Array.from({ length: 460 }, () => ({
    x: frand(),
    y: frand(),
    depth: 0.15 + frand() * 0.85,
    a: 0.1 + frand() * frand() * 0.5,
    size: 0.6 + frand() * 0.9,
    tw: 0.4 + frand() * 1.6,
    ph: frand() * TAU,
  }));

  const stars = STARS.map((s) => {
    const d = direction(s.ra, s.dec);
    const r = s.ly * LIGHT_YEAR;
    return { ...s, p: { x: d.x * r, y: d.y * r, z: d.z * r }, r };
  });

  /** 鏡頭：多遠的東西剛好在畫面邊上（D）、從多高往下看（E）、轉到哪個方向（psi） */
  const view = (f: SkyFrame) => {
    const narrow = f.w < 760;
    const R = narrow ? Math.min(f.w * 0.46, f.h * 0.42) : Math.min(f.w * 0.38, f.h * 0.8);
    const D = 10 ** (L0 + (L1 - L0) * f.s);
    // 一開始幾乎是從上面往下看地球與月球，退得越遠越斜，最後像從側面看一片圓盤
    const e = 1.12 - 0.66 * ease(f.s);
    const psi = psi0 + f.s * 1.6 + f.t * 0.01;
    return {
      R,
      D,
      k: R / D,
      psi,
      sinE: Math.sin(e),
      cosE: Math.cos(e),
      cosP: Math.cos(psi),
      sinP: Math.sin(psi),
      ex: narrow ? f.w * 0.5 : f.w * 0.56,
      ey: narrow ? f.h * 0.56 : f.h * 0.54,
      diag: Math.hypot(f.w, f.h),
    };
  };
  type View = ReturnType<typeof view>;

  const project = (v: View, p: Vec) => {
    const x = p.x * v.cosP - p.y * v.sinP;
    const y = p.x * v.sinP + p.y * v.cosP;
    return { x: v.ex + v.k * x, y: v.ey + v.k * (y * v.sinE - p.z * v.cosE) };
  };

  /** 琥珀點：台灣在畫面上的位置（地球縮成一點時就是地球） */
  const homeDot = (v: View, now: number) => {
    const p = surface(HOME_LAT, HOME_LON, (now - J2000) / DAY_MS);
    return project(v, { x: p.x * EARTH_LS, y: p.y * EARTH_LS, z: p.z * EARTH_LS });
  };

  /** 半徑 r 像素的東西看不看得到：太小擠在地球上、太大整個出了畫面 */
  const fade = (v: View, r: number) => clamp01((r - 4) / 14) * clamp01((v.diag * 1.4 - r) / (v.diag * 0.5));

  /** 一道訊號現在離地球多遠（光秒） */
  const distOf = (s: Signal, now: number) =>
    s.at !== null ? (now - s.at) / 1000 : s.beyond ? ((now - edgeAt) / 1000) * (1.12 + 0.1 * hash(s.id)) : 0;

  const ellipse = (ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) => {
    ctx.moveTo(x + rx, y);
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  };

  const glow = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  };

  function draw(ctx: CanvasRenderingContext2D, f: SkyFrame) {
    const { w, h, t } = f;
    ctx.clearRect(0, 0, w, h);
    const v = view(f);
    const days = (f.now - J2000) / DAY_MS;
    const points: Projected[] = [];
    const marks: Mark[] = [];
    const inView = { watch: 0, book: 0, music: 0 };
    // 落地之後的第一道波前：還沒掃到的地方先不亮
    const reveal = f.bloom >= 1 ? Infinity : f.bloom * v.diag * 1.2;
    const lit = (r: number) => clamp01((reveal - r) / 60 + 1);

    // ── 背景的星 ──
    for (const st of field) {
      const x = ((((st.x + v.psi * 0.05 * st.depth) % 1) + 1) % 1) * w;
      const y = ((((st.y - ease(f.s) * 0.12 * st.depth) % 1) + 1) % 1) * h;
      ctx.fillStyle = rgba(INK, st.a * (0.75 + 0.25 * Math.sin(t * st.tw + st.ph)) * (0.3 + 0.7 * f.bloom));
      ctx.fillRect(x, y, st.size, st.size);
    }

    // ── 刻度圈 ──
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]);
    for (const sc of SCALES) {
      const rx = v.k * sc.r;
      const a = fade(v, rx) * lit(rx);
      if (a <= 0.01) continue;
      ctx.strokeStyle = rgba(INK, 0.24 * a);
      ctx.beginPath();
      ellipse(ctx, v.ex, v.ey, rx, rx * v.sinE);
      ctx.stroke();
      marks.push({ key: sc.key, x: v.ex, y: v.ey + rx * v.sinE, a, dist: sc.r });
    }

    // ── 太陽圈邊界、紀錄的外緣 ──
    const helioR = v.k * HELIOPAUSE_AU * AU;
    const helioA = fade(v, helioR) * lit(helioR);
    if (helioA > 0.01) {
      ctx.strokeStyle = rgba(INK, 0.2 * helioA);
      ctx.beginPath();
      ellipse(ctx, v.ex, v.ey, helioR, helioR * v.sinE);
      ctx.stroke();
      marks.push({ key: 'heliopause', x: v.ex + helioR, y: v.ey, a: helioA, dist: HELIOPAUSE_AU * AU });
    }
    const edge = (f.now - edgeAt) / 1000;
    const edgeR = v.k * edge;
    const edgeA = fade(v, edgeR) * lit(edgeR);
    if (sent.length > 0 && edgeA > 0.01) {
      ctx.setLineDash([1, 4]);
      ctx.strokeStyle = rgba(AMBER, 0.22 * edgeA);
      ctx.beginPath();
      ellipse(ctx, v.ex, v.ey, edgeR, edgeR * v.sinE);
      ctx.stroke();
      marks.push({ key: 'records', x: v.ex, y: v.ey - edgeR * v.sinE, a: edgeA, dist: edge });
    }
    ctx.setLineDash([]);

    // ── 歐特雲 ──
    let oortA = 0;
    for (const o of oort) {
      const r = v.k * o.r;
      if (r < 3 || r > v.diag * 1.2) continue;
      const a = o.a * fade(v, r) * lit(r);
      if (a < 0.01) continue;
      oortA = Math.max(oortA, fade(v, r));
      const p = project(v, o.p);
      ctx.fillStyle = rgba(INK, a);
      ctx.fillRect(p.x, p.y, 1, 1);
    }
    if (oortA > 0.05) {
      const r = OORT_AU[0] * AU * 4;
      const p = project(v, { x: -r * 0.7, y: r * 0.7, z: r * 0.1 });
      marks.push({ key: 'oort', x: p.x, y: p.y, a: oortA * fade(v, v.k * r) * lit(v.k * r), dist: OORT_AU[0] * AU });
    }

    // ── 太陽系：軌道繞著太陽（地球在一號軌道上，所以太陽不在正中間） ──
    const earth = helio(EARTH, days);
    const sun = project(v, { x: -earth.x, y: -earth.y, z: 0 });
    for (const b of [EARTH, ...PLANETS]) {
      const rx = v.k * b.a * AU;
      const a = fade(v, rx) * lit(rx);
      if (a <= 0.01) continue;
      ctx.strokeStyle = rgba(INK, 0.17 * a);
      ctx.beginPath();
      ellipse(ctx, sun.x, sun.y, rx, rx * v.sinE);
      ctx.stroke();
      if (b === EARTH) continue;
      const hp = helio(b, days);
      const p = project(v, { x: hp.x - earth.x, y: hp.y - earth.y, z: 0 });
      ctx.fillStyle = rgba(INK, 0.85 * a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, b.key === 'jupiter' || b.key === 'saturn' ? 2.2 : 1.6, 0, TAU);
      ctx.fill();
      if (b.key === 'saturn') {
        // 土星：點的星球、線的環
        ctx.strokeStyle = rgba(INK, 0.7 * a);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 6, 2, -0.35, 0, TAU);
        ctx.stroke();
      }
      marks.push({
        key: b.key,
        x: p.x,
        y: p.y,
        a: a * clamp01((rx - 30) / 24),
        dist: Math.hypot(hp.x - earth.x, hp.y - earth.y),
      });
    }
    const sunR = v.k * AU;
    const sunA = fade(v, sunR) * lit(sunR);
    if (sunA > 0.01) {
      glow(ctx, sun.x, sun.y, 14, INK, 0.3 * sunA);
      ctx.fillStyle = rgba(INK, sunA);
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 2.6, 0, TAU);
      ctx.fill();
      marks.push({ key: 'sun', x: sun.x, y: sun.y, a: sunA, dist: Math.hypot(earth.x, earth.y) });
    }

    // ── 月球 ──
    const moonR = v.k * MOON_LS;
    const moonA = fade(v, moonR) * lit(moonR);
    if (moonA > 0.01) {
      ctx.strokeStyle = rgba(INK, 0.2 * moonA);
      ctx.beginPath();
      ellipse(ctx, v.ex, v.ey, moonR, moonR * v.sinE);
      ctx.stroke();
      const L = (218.316 + 13.176396 * days) * DEG;
      const p = project(v, { x: Math.cos(L) * MOON_LS, y: Math.sin(L) * MOON_LS, z: 0 });
      ctx.fillStyle = rgba(INK, 0.9 * moonA);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8, 0, TAU);
      ctx.fill();
      marks.push({ key: 'moon', x: p.x, y: p.y, a: moonA, dist: MOON_LS });
    }

    // ── 地球同步軌道：一圈虛線 ──
    const geoR = v.k * GEO_LS;
    const geoA = fade(v, geoR) * lit(geoR) * clamp01((geoR - 30) / 40);
    if (geoA > 0.01) {
      ctx.setLineDash([2, 5]);
      ctx.strokeStyle = rgba(INK, 0.22 * geoA);
      ctx.beginPath();
      ellipse(ctx, v.ex, v.ey, geoR, geoR * v.sinE);
      ctx.stroke();
      ctx.setLineDash([]);
      marks.push({ key: 'geo', x: v.ex + geoR, y: v.ey, a: geoA, dist: GEO_LS });
    }

    // ── 韋伯太空望遠鏡：太陽的正後方 ──
    const l2R = v.k * L2_LS;
    const l2A = fade(v, l2R) * lit(l2R) * clamp01((l2R - 24) / 30);
    if (l2A > 0.01) {
      const len = Math.hypot(earth.x, earth.y) || 1;
      const p = project(v, { x: (earth.x / len) * L2_LS, y: (earth.y / len) * L2_LS, z: 0 });
      ctx.strokeStyle = rgba(INK, 0.9 * l2A);
      ctx.strokeRect(p.x - 2, p.y - 2, 4, 4);
      marks.push({ key: 'jwst', x: p.x, y: p.y, a: l2A, dist: L2_LS });
    }

    // ── 航海家一號：從太陽拉出來的一條虛線就是它走過的路 ──
    const vd = voyagerAu(f.now) * AU;
    const vr = v.k * vd;
    const va = fade(v, vr) * lit(vr);
    if (va > 0.01) {
      const p = project(v, { x: VOYAGER_DIR.x * vd, y: VOYAGER_DIR.y * vd, z: VOYAGER_DIR.z * vd });
      ctx.setLineDash([1, 3]);
      ctx.strokeStyle = rgba(INK, 0.2 * va);
      ctx.beginPath();
      ctx.moveTo(sun.x, sun.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = rgba(INK, 0.9 * va);
      ctx.beginPath();
      ctx.moveTo(p.x - 3, p.y);
      ctx.lineTo(p.x + 3, p.y);
      ctx.moveTo(p.x, p.y - 3);
      ctx.lineTo(p.x, p.y + 3);
      ctx.stroke();
      marks.push({ key: 'voyager1', x: p.x, y: p.y, a: va, dist: vd });
    }

    // ── 附近的恆星 ──
    for (const s of stars) {
      const r = v.k * s.r;
      const a = fade(v, r) * lit(r);
      if (a <= 0.01) continue;
      const p = project(v, s.p);
      if (s.mag > 0.8) glow(ctx, p.x, p.y, 10 + s.mag * 6, INK, 0.22 * a);
      ctx.fillStyle = rgba(INK, a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1 + s.mag * 1.3, 0, TAU);
      ctx.fill();
      if (s.label) marks.push({ key: s.key, x: p.x, y: p.y, a, dist: s.r });
    }

    // ── 訊號：每一道是以地球為中心的一圈，作品是圈上的一點 ──
    // 圈很多：同一種、同一個亮度的併成一條路徑畫，不要一圈一次 stroke
    const rings = new Map<string, Path2D>();
    const ring = (key: string, rx: number) => {
      let path = rings.get(key);
      if (!path) {
        path = new Path2D();
        rings.set(key, path);
      }
      path.moveTo(v.ex + rx, v.ey);
      path.ellipse(v.ex, v.ey, rx, rx * v.sinE, 0, 0, TAU);
    };
    const placed: { s: Signal; x: number; y: number; a: number; rx: number }[] = [];
    for (const s of signals) {
      if (s.home) continue;
      const dist = distOf(s, f.now);
      const rx = v.k * dist;
      const a = fade(v, rx) * lit(rx);
      if (a <= 0.02) continue;
      const th = angle.get(s.id) ?? 0;
      const p = project(v, { x: Math.cos(th) * dist, y: Math.sin(th) * dist, z: 0 });
      const on = s.id === f.hovered;
      if (on) {
        ctx.strokeStyle = rgba(s.amber ? AMBER : INK, 0.5 * a);
        ctx.beginPath();
        ellipse(ctx, v.ex, v.ey, rx, rx * v.sinE);
        ctx.stroke();
      } else {
        const level = Math.ceil(a * 4);
        ring(`${s.amber ? 'a' : s.kind}:${level}`, rx);
      }
      if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) continue;
      placed.push({ s, x: p.x, y: p.y, a, rx });
      if (a > 0.3) inView[s.kind]++;
    }
    const RING_ALPHA = { watch: 0.07, book: 0.1, music: 0.12, a: 0.2 } as const;
    for (const [key, path] of rings) {
      const [kind, level] = key.split(':');
      const base = kind === 'a' ? RING_ALPHA.a : RING_ALPHA[kind as keyof typeof RING_ALPHA];
      ctx.strokeStyle = rgba(kind === 'a' ? AMBER : INK, (base * Number(level)) / 4);
      ctx.stroke(path);
    }
    for (const { s, x, y, a } of placed) {
      const on = s.id === f.hovered;
      const color = s.amber ? AMBER : INK;
      const alpha = Math.min(1, (0.5 + 0.45 * s.size) * a + (on ? 0.3 : 0));
      if (s.amber || on) glow(ctx, x, y, on ? 16 : 11, color, 0.35 * alpha);
      drawGlyph(ctx, s, x, y, alpha, on ? 1.5 : 1);
      points.push({ id: s.id, x, y, a });
    }

    // ── 地球：點的星球，向著太陽的那半邊亮 ──
    const fadeIn = clamp01(f.bloom * 3);
    const rE = v.k * EARTH_LS;
    if (rE > 2.5) {
      const ga = clamp01((rE - 2.5) / 12) * fadeIn;
      const sunLen = Math.hypot(earth.x, earth.y) || 1;
      const sx = -earth.x / sunLen;
      const sy = -earth.y / sunLen;
      ctx.strokeStyle = rgba(INK, 0.3 * ga);
      ctx.beginPath();
      ctx.arc(v.ex, v.ey, rE, 0, TAU);
      ctx.stroke();
      for (const g of globe) {
        const n = surface(g.lat, g.lon, days);
        const xr = n.x * v.cosP - n.y * v.sinP;
        const yr = n.x * v.sinP + n.y * v.cosP;
        const depth = yr * v.cosE + n.z * v.sinE;
        if (depth < 0) continue;
        const day = n.x * sx + n.y * sy > 0;
        ctx.fillStyle = rgba(INK, ga * (0.2 + 0.65 * depth) * (day ? 1 : 0.28));
        ctx.fillRect(v.ex + rE * xr, v.ey + rE * (yr * v.sinE - n.z * v.cosE), 1.3, 1.3);
      }
    }

    // ── 還在地球上的：繞著地球轉，地球縮成一點之後就看不到了 ──
    const homeA = fadeIn * clamp01((rE - 2) / 8);
    homes.forEach((s) => {
      if (homeA <= 0.01) return;
      const r = rE + (s.home === 'live' ? 12 : 22);
      const th = (homeAngle.get(s.id) ?? 0) + t * (s.home === 'live' ? 0.22 : 0.12);
      const x = v.ex + Math.cos(th) * r;
      const y = v.ey + Math.sin(th) * r * v.sinE;
      const on = s.id === f.hovered;
      const breathe = s.home === 'live' ? 0.65 + 0.35 * Math.sin(t * 2.2 + hash(s.id) * TAU) : 0.7;
      drawGlyph(
        ctx,
        { ...s, amber: s.amber === true || s.on === true },
        x,
        y,
        Math.min(1, breathe * homeA + (on ? 0.3 : 0)),
        on ? 1.5 : 1,
      );
      points.push({ id: s.id, x, y, a: homeA });
    });

    // ── 正在播：地球一直往外發著波 ──
    if (broadcasting) {
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.45 + i / 3) % 1;
        const r = rE + 8 + ph * 110;
        ctx.strokeStyle = rgba(AMBER, 0.32 * (1 - ph) * fadeIn);
        ctx.beginPath();
        ellipse(ctx, v.ex, v.ey, r, r * v.sinE);
        ctx.stroke();
      }
    }

    // ── 琥珀點：台灣（地球縮成一點時就是地球） ──
    const dot = homeDot(v, f.now);
    if (f.dot !== false) {
      glow(ctx, dot.x, dot.y, 16, AMBER, 0.5);
      ctx.fillStyle = `rgb(${AMBER})`;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 2.8, 0, TAU);
      ctx.fill();
    }
    marks.push({ key: 'earth', x: v.ex + rE * 0.8, y: v.ey - rE * 0.8, a: clamp01(1 - f.s * 10) * fadeIn, dist: 0 });

    // ── 第一道波前 ──
    if (reveal !== Infinity) {
      ctx.strokeStyle = rgba(AMBER, 0.45 * (1 - f.bloom));
      ctx.beginPath();
      ellipse(ctx, v.ex, v.ey, reveal, reveal * v.sinE);
      ctx.stroke();
    }

    return { points, marks, inView };
  }

  return {
    draw,
    /** 地球在畫面上的位置（換頁轉場的琥珀點落在這裡） */
    earth: (f: SkyFrame) => homeDot(view(f), f.now),
    /** 現在畫面邊上是多遠（光秒） */
    reach: (f: SkyFrame) => view(f).D,
    /** 從地球捲到最遠跨了幾個數量級（頁面要多長） */
    decades: L1 - L0,
    distOf,
  };
}

/** 一道訊號在圈上的那一點：在看是圓點、書是菱形、歌是十字；想讀的書是空心 */
function drawGlyph(
  ctx: CanvasRenderingContext2D,
  s: Pick<Signal, 'kind' | 'size' | 'amber' | 'home'>,
  x: number,
  y: number,
  alpha: number,
  scale: number,
) {
  const color = rgba(s.amber ? AMBER : INK, alpha);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  if (s.kind === 'music') {
    const r = (2 + s.size * 1.6) * scale;
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y + r);
    ctx.stroke();
    return;
  }
  if (s.kind === 'book') {
    const r = (1.8 + s.size * 1.4) * scale;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    if (s.home === 'queued') ctx.stroke();
    else ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.arc(x, y, (0.9 + s.size * 1.6) * scale, 0, TAU);
  ctx.fill();
}
