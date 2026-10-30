// 收藏頁（media/Collection）的天空：每部作品是看完、讀完、聽完的那一刻從地球發出的一道訊號，
// 到現在以光速往外飛了一段距離，所以距離就是離現在多久。往下捲是鏡頭從地球往外退（對數尺度），
// 一路經過國際太空站、月球、韋伯望遠鏡、行星、小行星帶、柯伊伯帶、新視野號、航海家一號、
// 太陽圈邊界、歐特雲，到附近的恆星；最後面是照真實方向畫的銀河。
// 行星與月球用平均軌道算今天的位置，恆星用真的赤經、赤緯與距離。這裡只有幾何與畫圖，不碰 React。
import { onPalette, palette } from '@/lib/palette';
import { currentFold } from '@/lib/viewportFold';
import { focusY } from '@/lib/viewportShape';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
let { paper: INK, amber: AMBER } = palette();
// 主題在頁面開著時換了就跟著換（lib/theme 的 setTheme）
onPalette((p) => {
  ({ paper: INK, amber: AMBER } = p);
});

/** 一光年、一天文單位各是幾光秒 */
export const LIGHT_YEAR = 31_557_600;
const AU = 499.005;
const DAY_MS = 86_400_000;
const YEAR_MS = 365.25 * DAY_MS;
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
/** 滑過一圈訊號時，波前從地球跑到那一圈要多久（秒） */
const HOVER_WAVE_S = 0.55;

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
  /** 鏡頭退到哪裡：0 在地球旁邊，1 在最遠的訊號外面（進場俯衝時會比 1 還遠） */
  s: number;
  hovered: string | null;
  /** 0 到 1：頁面自己的東西（繞著地球的書、地標的名字）淡入到哪裡 */
  bloom: number;
  /** 畫不畫琥珀點（換頁轉場的點還在飛、或正要發射出去時由轉場畫） */
  dot?: boolean;
  /** 離開這頁時從台灣發出去的那道波前：0 到 1 */
  launch?: number;
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
/** 行星身後拖的那段亮軌跡有多長（度） */
const TRAIL_DEG = 42;

/** 月球離地球多遠（光秒） */
const MOON_LS = 1.282;
/** 地球同步軌道（光秒）：離地心 42,164 公里 */
const GEO_LS = 0.1406;
/** 國際太空站：離地 420 公里、傾角 51.6°、92.9 分鐘繞一圈（相位是示意，不是即時位置） */
const ISS_LS = EARTH_LS * 1.066;
const ISS_INC = 51.6 * DEG;
const ISS_PERIOD_S = 5574;
/** 韋伯太空望遠鏡在日地 L2：離地球 150 萬公里，在太陽的正後方 */
const L2_LS = 5.0;
/** 小行星帶、柯伊伯帶的內外緣（天文單位） */
const ASTEROID_AU = [2.1, 3.3] as const;
const KUIPER_AU = [30, 50] as const;
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

/** 刻度圈：一光秒、一光分、一光時、一光日、一光年（離地球這麼遠的訊號，就是這麼久以前發出的） */
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
const voyagerAu = (now: number) => 173.1 + (3.57 * (now - VOYAGER_AT)) / YEAR_MS;
/** 新視野號：往人馬座方向飛，2021 年 4 月到 50 AU，每年再遠 2.9 AU */
const HORIZONS_DIR = direction(19.4, -20.2);
const HORIZONS_AT = Date.UTC(2021, 3, 17);
const horizonsAu = (now: number) => 50 + (2.9 * (now - HORIZONS_AT)) / YEAR_MS;

/** 線稿插圖（public/illustrations）：畫在那個東西的位置上，寬度是像素 */
const ART = {
  iss: { src: '/illustrations/iss.webp', w: 44 },
  jwst: { src: '/illustrations/jwst.webp', w: 50 },
  horizons: { src: '/illustrations/new-horizons.webp', w: 48 },
  voyager: { src: '/illustrations/voyager1.webp', w: 62 },
} as const;
type ArtKey = keyof typeof ART;

/** 赤道座標的方向換成黃道座標 */
function eqToEcl(v: Vec): Vec {
  return {
    x: v.x,
    y: v.y * Math.cos(OBLIQUITY) + v.z * Math.sin(OBLIQUITY),
    z: -v.y * Math.sin(OBLIQUITY) + v.z * Math.cos(OBLIQUITY),
  };
}

/** 赤經（小時）、赤緯（度）換成黃道座標裡的方向 */
function direction(raH: number, decD: number): Vec {
  const ra = raH * 15 * DEG;
  const dec = decD * DEG;
  return eqToEcl({ x: Math.cos(dec) * Math.cos(ra), y: Math.cos(dec) * Math.sin(ra), z: Math.sin(dec) });
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

/** 常態分布（Box–Muller） */
const gauss = (rand: () => number) => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(TAU * rand());

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => x * x * (3 - 2 * x);
const rgba = (c: string, a: number) => `rgba(${c}, ${a.toFixed(3)})`;

/** 背景（無限遠）的點：方向、亮度分成幾階一起畫，少換幾次 fillStyle */
interface SkyDot {
  d: Vec;
  size: number;
}
const LEVELS = 8;

/** 銀河：照銀道面的真實方向撒點，越靠銀心越密 */
function milkyWay(count: number): SkyDot[][] {
  const pole = direction(12.857, 27.128);
  const center = direction(17.76, -28.936);
  const side = {
    x: pole.y * center.z - pole.z * center.y,
    y: pole.z * center.x - pole.x * center.z,
    z: pole.x * center.y - pole.y * center.x,
  };
  const rand = rng(23);
  const levels: SkyDot[][] = Array.from({ length: LEVELS }, () => []);
  for (let i = 0; i < count; i++) {
    const nearCore = rand() < 0.45;
    const l = nearCore ? gauss(rand) * 0.7 : rand() * TAU;
    const b = gauss(rand) * (nearCore ? 0.09 : 0.06);
    const cl = Math.cos(l);
    const sl = Math.sin(l);
    const cb = Math.cos(b);
    const sb = Math.sin(b);
    const d = {
      x: cb * (cl * center.x + sl * side.x) + sb * pole.x,
      y: cb * (cl * center.y + sl * side.y) + sb * pole.y,
      z: cb * (cl * center.z + sl * side.z) + sb * pole.z,
    };
    const level = Math.min(LEVELS - 1, Math.floor(rand() ** 1.6 * LEVELS * (nearCore ? 1.25 : 1)));
    levels[level].push({ d, size: rand() < 0.08 ? 1.4 : 1 });
  }
  return levels;
}

/**
 * 銀河的光霧：只有點的話連不成一條「白帶」。沿著同一個銀道面放幾百團柔光（畫的時候貼同一張預先畫好的
 * 柔光圖，不是每幀算模糊），越靠銀心越濃、越寬
 */
function milkyHaze(count: number): { d: Vec; weight: number; size: number }[] {
  const pole = direction(12.857, 27.128);
  const center = direction(17.76, -28.936);
  const side = {
    x: pole.y * center.z - pole.z * center.y,
    y: pole.z * center.x - pole.x * center.z,
    z: pole.x * center.y - pole.y * center.x,
  };
  const rand = rng(29);
  return Array.from({ length: count }, () => {
    const nearCore = rand() < 0.5;
    const l = nearCore ? gauss(rand) * 0.8 : rand() * TAU;
    const b = gauss(rand) * (nearCore ? 0.07 : 0.045);
    const cl = Math.cos(l);
    const sl = Math.sin(l);
    const cb = Math.cos(b);
    const sb = Math.sin(b);
    return {
      d: {
        x: cb * (cl * center.x + sl * side.x) + sb * pole.x,
        y: cb * (cl * center.y + sl * side.y) + sb * pole.y,
        z: cb * (cl * center.z + sl * side.z) + sb * pole.z,
      },
      // 靠銀心的那幾團比較濃、比較大
      weight: nearCore ? 0.7 + rand() * 0.3 : 0.35 + rand() * 0.35,
      size: (nearCore ? 1.2 : 0.8) * (0.6 + rand() * 0.8),
    };
  });
}

/** 柔光圖：中間白、往外漸透明的一團（光霧每一團都貼它） */
let hazeSprite: HTMLCanvasElement | null = null;
function hazeImage(): HTMLCanvasElement {
  if (hazeSprite) return hazeSprite;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${INK}, 1)`);
    grad.addColorStop(0.4, `rgba(${INK}, 0.45)`);
    grad.addColorStop(1, `rgba(${INK}, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  hazeSprite = c;
  return c;
}

/** 背景的星：四面八方，大多很暗、少數亮 */
function fieldStars(count: number): SkyDot[][] {
  const rand = rng(11);
  const levels: SkyDot[][] = Array.from({ length: LEVELS }, () => []);
  for (let i = 0; i < count; i++) {
    const z = rand() * 2 - 1;
    const phi = rand() * TAU;
    const c = Math.sqrt(1 - z * z);
    const u = rand();
    const level = Math.min(LEVELS - 1, Math.floor(u * u * u * LEVELS));
    levels[level].push({ d: { x: Math.cos(phi) * c, y: Math.sin(phi) * c, z }, size: 0.8 + (level / LEVELS) * 1.1 });
  }
  return levels;
}

/** 一圈帶（小行星帶、柯伊伯帶）：繞太陽的碎點 */
function belt(seed: number, count: number, [inner, outer]: readonly [number, number], thick: number) {
  const rand = rng(seed);
  return Array.from({ length: count }, () => {
    const r = (inner + (outer - inner) * Math.sqrt(rand())) * AU;
    const a = rand() * TAU;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, z: gauss(rand) * thick * r, a: 0.08 + rand() * 0.22 };
  });
}

/**
 * 橢圓（圓心 cx、cy，半徑 rx、ry）落在畫面裡的那幾段弧，回傳 [起角, 迄角]。
 * 整圈在畫面外、或畫面整個在橢圓裡面（圈比畫面大、繞在外面）都回空的。
 * 沿圈取 96 個點看哪些在畫面裡（外擴一點），連續的併成一段，頭尾各多讓一格免得切到邊
 */
export function visibleArcs(cx: number, cy: number, rx: number, ry: number, w: number, h: number): [number, number][] {
  const pad = 4;
  if (cx - rx > w + pad || cx + rx < -pad || cy - ry > h + pad || cy + ry < -pad) return [];
  const inside = (x: number, y: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;
  if (inside(-pad, -pad) && inside(w + pad, -pad) && inside(-pad, h + pad) && inside(w + pad, h + pad)) return [];
  const N = 96;
  const step = TAU / N;
  const seen = Array.from({ length: N }, (_, i) => {
    const x = cx + Math.cos(i * step) * rx;
    const y = cy + Math.sin(i * step) * ry;
    return x >= -pad && x <= w + pad && y >= -pad && y <= h + pad;
  });
  if (seen.every(Boolean)) return [[0, TAU]];
  // 從一個看不到的點開始繞一圈，收集連續看得到的段
  const start = seen.indexOf(false);
  const arcs: [number, number][] = [];
  let from = -1;
  for (let k = 1; k <= N; k++) {
    const i = (start + k) % N;
    if (seen[i] && from < 0) from = start + k;
    if (!seen[i] && from >= 0) {
      arcs.push([(from - 1) * step, (start + k) * step]);
      from = -1;
    }
  }
  return arcs;
}

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
  const asteroids = belt(31, 700, ASTEROID_AU, 0.04);
  const kuiper = belt(37, 1000, KUIPER_AU, 0.08);
  const galaxy = milkyWay(7000);
  const haze = milkyHaze(360);
  const field = fieldStars(2400);
  // 少數幾顆會閃的星（其他的亮度固定，才能一階一起畫）
  const trand = rng(5);
  const twinklers = Array.from({ length: 60 }, () => {
    const z = trand() * 2 - 1;
    const phi = trand() * TAU;
    const c = Math.sqrt(1 - z * z);
    return { d: { x: Math.cos(phi) * c, y: Math.sin(phi) * c, z }, tw: 0.5 + trand() * 1.5, ph: trand() * TAU };
  });

  const stars = STARS.map((s) => {
    const d = direction(s.ra, s.dec);
    const r = s.ly * LIGHT_YEAR;
    return { ...s, p: { x: d.x * r, y: d.y * r, z: d.z * r }, r };
  });

  // 插圖：第一次畫的時候才載（伺服器端也會建這個天空，那裡沒有 Image）
  let art: Record<ArtKey, HTMLImageElement> | null = null;
  const loadArt = () => {
    if (art || typeof Image === 'undefined') return;
    const out = {} as Record<ArtKey, HTMLImageElement>;
    for (const key of Object.keys(ART) as ArtKey[]) {
      const img = new Image();
      img.decoding = 'async';
      img.src = ART[key].src;
      out[key] = img;
    }
    art = out;
  };

  // 滑過的那一圈：記下什麼時候開始滑過，波前從地球跑過去
  let lastHover: string | null = null;
  let hoverAt = 0;

  /** 鏡頭：多遠的東西剛好在畫面邊上（D）、從多高往下看（E）、轉到哪個方向（psi） */
  const view = (f: SkyFrame) => {
    const narrow = f.w < 760;
    // 摺疊機書本式：地球在左頁正中，在看／在讀／在聽與讀數在右頁
    const fold = currentFold();
    const book = fold?.pose === 'book' ? fold.first : null;
    const R = narrow ? Math.min(f.w * 0.46, f.h * 0.42) : Math.min(f.w * 0.38, f.h * 0.8);
    const D = 10 ** (L0 + (L1 - L0) * f.s);
    // 一開始幾乎是從上面往下看地球與月球，退得越遠越斜，最後像從側面看一片圓盤
    const e = 1.12 - 0.66 * ease(clamp01(f.s));
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
      ex: book ? book.x + book.width * 0.5 : narrow ? f.w * 0.5 : f.w * 0.56,
      // 摺疊機直拿：地球提到摺痕以上（lib/viewportShape）
      ey: f.h * focusY(f.w, f.h, narrow ? 0.56 : 0.54, 0.4),
      diag: Math.hypot(f.w, f.h),
    };
  };
  type View = ReturnType<typeof view>;

  const project = (v: View, p: Vec) => {
    const x = p.x * v.cosP - p.y * v.sinP;
    const y = p.x * v.sinP + p.y * v.cosP;
    return { x: v.ex + v.k * x, y: v.ey + v.k * (y * v.sinE - p.z * v.cosE) };
  };

  /** 朝鏡頭那一邊有多少（正的在前面、負的在後面）：判斷東西有沒有被地球擋住、背景天空畫哪半邊 */
  const depthOf = (v: View, p: Vec) => (p.x * v.sinP + p.y * v.cosP) * v.cosE + p.z * v.sinE;

  /**
   * 無限遠的方向畫在畫面上的哪裡：照透視畫（視野約 130 度），看得到的是畫面深處那一大片天；
   * 鏡頭轉的時候整片天一起轉。null 是在鏡頭背後或太偏的
   */
  const skyAt = (v: View, d: Vec) => {
    const into = -depthOf(v, d);
    if (into < 0.08) return null;
    const F = v.diag * 0.36;
    const x = d.x * v.cosP - d.y * v.sinP;
    const y = d.x * v.sinP + d.y * v.cosP;
    return { x: v.ex + (F * x) / into, y: v.ey + (F * (y * v.sinE - d.z * v.cosE)) / into };
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

  const drawArt = (ctx: CanvasRenderingContext2D, key: ArtKey, x: number, y: number, a: number) => {
    const img = art?.[key];
    if (!img?.complete || img.naturalWidth === 0) return false;
    const w = ART[key].w;
    const h = (w * img.naturalHeight) / img.naturalWidth;
    ctx.globalAlpha = a;
    ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
    ctx.globalAlpha = 1;
    return true;
  };

  /**
   * 一條繞著 c 的軌道：整圈很淡、帶細刻度；at 有給的話（行星現在的黃經），身後拖一段漸亮的軌跡到它那裡
   */
  const orbit = (ctx: CanvasRenderingContext2D, v: View, c: Vec, r: number, a: number, at: number | null) => {
    const o = project(v, c);
    const rx = v.k * r;
    ctx.strokeStyle = rgba(INK, 0.1 * a);
    ctx.beginPath();
    ellipse(ctx, o.x, o.y, rx, rx * v.sinE);
    ctx.stroke();
    // 刻度：每 15 度一根、每 90 度長一點，往外伸
    if (rx > 60) {
      ctx.strokeStyle = rgba(INK, 0.16 * a);
      ctx.beginPath();
      for (let i = 0; i < 24; i++) {
        const th = (i / 24) * TAU;
        const len = i % 6 === 0 ? 6 : 3;
        const p1 = project(v, { x: c.x + Math.cos(th) * r, y: c.y + Math.sin(th) * r, z: c.z });
        const p2 = project(v, {
          x: c.x + Math.cos(th) * r * (1 + len / rx),
          y: c.y + Math.sin(th) * r * (1 + len / rx),
          z: c.z,
        });
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
      }
      ctx.stroke();
    }
    if (at === null) return;
    const steps = 28;
    let prev = project(v, {
      x: c.x + Math.cos(at - TRAIL_DEG * DEG) * r,
      y: c.y + Math.sin(at - TRAIL_DEG * DEG) * r,
      z: c.z,
    });
    for (let i = 1; i <= steps; i++) {
      const th = at - TRAIL_DEG * DEG * (1 - i / steps);
      const p = project(v, { x: c.x + Math.cos(th) * r, y: c.y + Math.sin(th) * r, z: c.z });
      ctx.strokeStyle = rgba(INK, 0.55 * a * (i / steps) ** 1.6);
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      prev = p;
    }
  };

  /** 訊號圈那一層的離屏快取（見 draw 裡訊號那段） */
  const ringCache: { key: string; canvas: HTMLCanvasElement | null } = { key: '', canvas: null };

  function draw(ctx: CanvasRenderingContext2D, f: SkyFrame) {
    const { w, h, t } = f;
    loadArt();
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    const v = view(f);
    const days = (f.now - J2000) / DAY_MS;
    const points: Projected[] = [];
    const marks: Mark[] = [];
    const inView = { watch: 0, book: 0, music: 0 };
    if (f.hovered !== lastHover) {
      lastHover = f.hovered;
      hoverAt = t;
    }

    // ── 背景：銀河與遠方的星（無限遠，跟著鏡頭轉） ──
    const backdrop = (levels: SkyDot[][], max: number) => {
      levels.forEach((list, level) => {
        ctx.fillStyle = rgba(INK, (max * (level + 1)) / LEVELS);
        for (const s of list) {
          const p = skyAt(v, s.d);
          if (!p || p.x < 0 || p.x > w || p.y < 0 || p.y > h) continue;
          ctx.fillRect(p.x, p.y, s.size, s.size);
        }
      });
    };
    // 銀河的白帶：先鋪光霧，點再疊上去
    const sprite = hazeImage();
    const blob = v.diag * 0.055;
    for (const c of haze) {
      const p = skyAt(v, c.d);
      if (!p) continue;
      const r = blob * c.size;
      if (p.x < -r || p.x > w + r || p.y < -r || p.y > h + r) continue;
      ctx.globalAlpha = 0.03 * c.weight;
      ctx.drawImage(sprite, p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    backdrop(galaxy, 0.42);
    backdrop(field, 0.55);
    // 一顆一個透明度的點（閃爍的星、歐特雲、小行星帶）：顏色只設一次，每顆改 globalAlpha。
    // 每顆組一個 rgba() 字串的話，瀏覽器每次都要重新解析顏色，拉遠時一幀有上千顆
    ctx.fillStyle = `rgb(${INK})`;
    for (const s of twinklers) {
      const p = skyAt(v, s.d);
      if (!p) continue;
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(t * s.tw + s.ph);
      ctx.fillRect(p.x, p.y, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;

    // ── 刻度圈 ──
    ctx.setLineDash([2, 6]);
    for (const sc of SCALES) {
      const rx = v.k * sc.r;
      const a = fade(v, rx);
      if (a <= 0.01) continue;
      ctx.strokeStyle = rgba(INK, 0.22 * a);
      ctx.beginPath();
      ellipse(ctx, v.ex, v.ey, rx, rx * v.sinE);
      ctx.stroke();
      marks.push({ key: sc.key, x: v.ex, y: v.ey + rx * v.sinE, a, dist: sc.r });
    }

    // ── 太陽圈邊界、紀錄的外緣 ──
    const helioR = v.k * HELIOPAUSE_AU * AU;
    const helioA = fade(v, helioR);
    if (helioA > 0.01) {
      ctx.setLineDash([]);
      ctx.strokeStyle = rgba(INK, 0.18 * helioA);
      ctx.beginPath();
      ellipse(ctx, v.ex, v.ey, helioR, helioR * v.sinE);
      ctx.stroke();
      marks.push({ key: 'heliopause', x: v.ex + helioR, y: v.ey, a: helioA, dist: HELIOPAUSE_AU * AU });
    }
    const edge = (f.now - edgeAt) / 1000;
    const edgeR = v.k * edge;
    const edgeA = fade(v, edgeR);
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
    ctx.fillStyle = `rgb(${INK})`;
    for (const o of oort) {
      const r = v.k * o.r;
      if (r < 3 || r > v.diag * 1.2) continue;
      const a = o.a * fade(v, r);
      if (a < 0.01) continue;
      oortA = Math.max(oortA, fade(v, r));
      const p = project(v, o.p);
      ctx.globalAlpha = a;
      ctx.fillRect(p.x, p.y, 1, 1);
    }
    ctx.globalAlpha = 1;
    if (oortA > 0.05) {
      const r = OORT_AU[0] * AU * 4;
      const p = project(v, { x: -r * 0.7, y: r * 0.7, z: r * 0.1 });
      marks.push({ key: 'oort', x: p.x, y: p.y, a: oortA * fade(v, v.k * r), dist: OORT_AU[0] * AU });
    }

    // ── 太陽系：軌道繞著太陽（地球在一號軌道上，所以太陽不在正中間） ──
    const earth = helio(EARTH, days);
    const sunC = { x: -earth.x, y: -earth.y, z: 0 };
    const sun = project(v, sunC);
    const beltDots = (list: typeof asteroids, key: string, [inner, outer]: readonly [number, number]) => {
      const rx = v.k * outer * AU;
      const a = fade(v, v.k * inner * AU) * fade(v, rx);
      if (a <= 0.01) return;
      ctx.fillStyle = `rgb(${INK})`;
      for (const d of list) {
        const p = project(v, { x: d.x + sunC.x, y: d.y + sunC.y, z: d.z });
        ctx.globalAlpha = d.a * a;
        ctx.fillRect(p.x, p.y, 1, 1);
      }
      ctx.globalAlpha = 1;
      const r = ((inner + outer) / 2) * AU;
      const p = project(v, { x: sunC.x - r * 0.72, y: sunC.y - r * 0.69, z: 0 });
      marks.push({
        key,
        x: p.x,
        y: p.y,
        a: a * clamp01((rx - 60) / 60),
        dist: Math.hypot(sunC.x - r * 0.72, sunC.y - r * 0.69),
      });
    };
    beltDots(asteroids, 'asteroids', ASTEROID_AU);
    beltDots(kuiper, 'kuiper', KUIPER_AU);
    for (const b of [EARTH, ...PLANETS]) {
      const rx = v.k * b.a * AU;
      const a = fade(v, rx);
      if (a <= 0.01) continue;
      const L = (b.L0 + b.n * days) * DEG;
      orbit(ctx, v, sunC, b.a * AU, a, L);
      if (b === EARTH) continue;
      const hp = helio(b, days);
      const p = project(v, { x: hp.x - earth.x, y: hp.y - earth.y, z: 0 });
      const big = b.key === 'jupiter' || b.key === 'saturn';
      glow(ctx, p.x, p.y, big ? 9 : 6, INK, 0.25 * a);
      ctx.fillStyle = rgba(INK, 0.9 * a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, big ? 2.2 : 1.6, 0, TAU);
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
    const sunA = fade(v, sunR);
    if (sunA > 0.01) {
      glow(ctx, sun.x, sun.y, 22, INK, 0.28 * sunA);
      ctx.fillStyle = rgba(INK, sunA);
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 2.6, 0, TAU);
      ctx.fill();
      marks.push({ key: 'sun', x: sun.x, y: sun.y, a: sunA, dist: Math.hypot(earth.x, earth.y) });
    }

    // ── 月球 ──
    const moonR = v.k * MOON_LS;
    const moonA = fade(v, moonR);
    if (moonA > 0.01) {
      const L = (218.316 + 13.176396 * days) * DEG;
      orbit(ctx, v, { x: 0, y: 0, z: 0 }, MOON_LS, moonA, L);
      const p = project(v, { x: Math.cos(L) * MOON_LS, y: Math.sin(L) * MOON_LS, z: 0 });
      glow(ctx, p.x, p.y, 7, INK, 0.25 * moonA);
      ctx.fillStyle = rgba(INK, 0.9 * moonA);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8, 0, TAU);
      ctx.fill();
      marks.push({ key: 'moon', x: p.x, y: p.y, a: moonA, dist: MOON_LS });
    }

    // ── 地球同步軌道：一圈虛線 ──
    const geoR = v.k * GEO_LS;
    const geoA = fade(v, geoR) * clamp01((geoR - 30) / 40);
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
    const l2A = fade(v, l2R) * clamp01((l2R - 24) / 30);
    if (l2A > 0.01) {
      const len = Math.hypot(earth.x, earth.y) || 1;
      const p = project(v, { x: (earth.x / len) * L2_LS, y: (earth.y / len) * L2_LS, z: 0 });
      if (!drawArt(ctx, 'jwst', p.x, p.y, 0.9 * l2A)) {
        ctx.strokeStyle = rgba(INK, 0.9 * l2A);
        ctx.strokeRect(p.x - 2, p.y - 2, 4, 4);
      }
      marks.push({ key: 'jwst', x: p.x + ART.jwst.w / 2, y: p.y, a: l2A, dist: L2_LS });
    }

    // ── 新視野號、航海家一號：從太陽拉出來的一條虛線就是它走過的路 ──
    const probe = (key: 'horizons' | 'voyager', mark: string, dir: Vec, dist: number) => {
      const r = v.k * dist;
      const a = fade(v, r);
      if (a <= 0.01) return;
      const p = project(v, { x: dir.x * dist, y: dir.y * dist, z: dir.z * dist });
      ctx.setLineDash([1, 3]);
      ctx.strokeStyle = rgba(INK, 0.2 * a);
      ctx.beginPath();
      ctx.moveTo(sun.x, sun.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!drawArt(ctx, key, p.x, p.y, 0.92 * a)) {
        ctx.strokeStyle = rgba(INK, 0.9 * a);
        ctx.beginPath();
        ctx.moveTo(p.x - 3, p.y);
        ctx.lineTo(p.x + 3, p.y);
        ctx.moveTo(p.x, p.y - 3);
        ctx.lineTo(p.x, p.y + 3);
        ctx.stroke();
      }
      marks.push({ key: mark, x: p.x + ART[key].w / 2, y: p.y, a, dist });
    };
    probe('horizons', 'newHorizons', HORIZONS_DIR, horizonsAu(f.now) * AU);
    probe('voyager', 'voyager1', VOYAGER_DIR, voyagerAu(f.now) * AU);

    // ── 附近的恆星 ──
    for (const s of stars) {
      const r = v.k * s.r;
      const a = fade(v, r);
      if (a <= 0.01) continue;
      const p = project(v, s.p);
      glow(ctx, p.x, p.y, 8 + s.mag * 10, INK, 0.2 * a);
      ctx.fillStyle = rgba(INK, a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1 + s.mag * 1.3, 0, TAU);
      ctx.fill();
      if (s.label) marks.push({ key: s.key, x: p.x, y: p.y, a, dist: s.r });
    }

    // ── 訊號：每一道是以地球為中心的一圈細點鏈，作品是圈上的一點 ──
    // 拉遠時這一層是全頁最貴的：幾百圈點線橢圓，大半在畫面外，切虛線與反鋸齒都在 CPU 上做
    // （GPU 閒著、幀數卻掉到十幾）。三件事讓它便宜：
    //   1. 只畫畫面裡的那幾段弧；整圈在畫面外、或畫面整個在圈裡面的直接跳過
    //   2. 同一種、同一個亮度的併成一條路徑；四捨五入後半徑一樣的只畫一次
    //   3. 整層畫到離屏畫布上，只有圈真的會動超過半個像素（捲動、縮放、時間推進、換了滑過的那圈）才重畫，
    //      其他幀直接貼上去。圈是以地球為圓心的圓，跟鏡頭慢慢轉的角度無關
    const ry = (rx: number) => rx * v.sinE;
    const ringKey = [
      w,
      h,
      ctx.getTransform().a,
      v.k.toPrecision(6),
      v.ex,
      v.ey,
      v.sinE.toFixed(4),
      Math.floor((f.now / 1000) * v.k * 2),
      f.hovered ?? '',
    ].join('|');
    const reuse = ringKey === ringCache.key;
    const rings = new Map<string, Path2D>();
    const drawn = new Set<string>();
    const ring = (key: string, rx: number) => {
      if (reuse) return;
      const id = `${key}:${Math.round(rx)}`;
      if (drawn.has(id)) return;
      drawn.add(id);
      const arcs = visibleArcs(v.ex, v.ey, rx, ry(rx), w, h);
      if (!arcs.length) return;
      let path = rings.get(key);
      if (!path) {
        path = new Path2D();
        rings.set(key, path);
      }
      for (const [a0, a1] of arcs) {
        path.moveTo(v.ex + Math.cos(a0) * rx, v.ey + Math.sin(a0) * ry(rx));
        path.ellipse(v.ex, v.ey, rx, ry(rx), 0, a0, a1);
      }
    };
    const placed: { s: Signal; x: number; y: number; a: number; rx: number }[] = [];
    let hoverRing: { s: Signal; rx: number; a: number } | null = null;
    for (const s of signals) {
      if (s.home) continue;
      const dist = distOf(s, f.now);
      const rx = v.k * dist;
      const a = fade(v, rx);
      if (a <= 0.02) continue;
      const th = angle.get(s.id) ?? 0;
      const p = project(v, { x: Math.cos(th) * dist, y: Math.sin(th) * dist, z: 0 });
      if (s.id === f.hovered) hoverRing = { s, rx, a };
      else ring(`${s.amber ? 'a' : s.kind}:${Math.ceil(a * 4)}`, rx);
      if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) continue;
      placed.push({ s, x: p.x, y: p.y, a, rx });
      if (a > 0.3) inView[s.kind]++;
    }
    const RING_ALPHA = { watch: 0.16, book: 0.2, music: 0.24, a: 0.36 } as const;
    if (!reuse) {
      const layer = (ringCache.canvas ??= document.createElement('canvas'));
      if (layer.width !== ctx.canvas.width || layer.height !== ctx.canvas.height) {
        layer.width = ctx.canvas.width;
        layer.height = ctx.canvas.height;
      }
      const lc = layer.getContext('2d');
      if (lc) {
        lc.setTransform(1, 0, 0, 1, 0, 0);
        lc.clearRect(0, 0, layer.width, layer.height);
        lc.setTransform(ctx.getTransform());
        lc.lineWidth = 1;
        lc.setLineDash([1, 3]);
        for (const [key, path] of rings) {
          const [kind, level] = key.split(':');
          const base = kind === 'a' ? RING_ALPHA.a : RING_ALPHA[kind as keyof typeof RING_ALPHA];
          lc.strokeStyle = rgba(kind === 'a' ? AMBER : INK, (base * Number(level)) / 4);
          lc.stroke(path);
        }
        ringCache.key = ringKey;
      }
    }
    if (ringCache.canvas && ringCache.key === ringKey) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(ringCache.canvas, 0, 0);
      ctx.restore();
    }
    // 滑過的那一圈：一道波前從地球往外跑，追上那一圈時整圈亮起來
    if (hoverRing) {
      const { s, rx, a } = hoverRing;
      const color = s.amber ? AMBER : INK;
      const k = f.t === 0 ? 1 : clamp01((t - hoverAt) / HOVER_WAVE_S);
      const r = rx * (1 - (1 - k) ** 3);
      if (k < 1) {
        ctx.strokeStyle = rgba(AMBER, 0.6 * (1 - k * 0.5));
        ctx.beginPath();
        ellipse(ctx, v.ex, v.ey, r, r * v.sinE);
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(color, 0.55 * a * k);
      ctx.beginPath();
      ellipse(ctx, v.ex, v.ey, rx, rx * v.sinE);
      ctx.stroke();
    }
    for (const { s, x, y, a } of placed) {
      const on = s.id === f.hovered;
      const color = s.amber ? AMBER : INK;
      const alpha = Math.min(1, (0.5 + 0.45 * s.size) * a + (on ? 0.3 : 0));
      if (s.amber || on) glow(ctx, x, y, on ? 18 : 11, color, 0.35 * alpha);
      drawGlyph(ctx, s, x, y, alpha, on ? 1.5 : 1);
      points.push({ id: s.id, x, y, a });
    }

    // ── 地球：點的星球，向著太陽的那半邊亮 ──
    const fadeIn = clamp01(f.bloom * 3);
    const rE = v.k * EARTH_LS;
    const ga = clamp01((rE - 2.5) / 12);
    if (ga > 0) {
      const sunLen = Math.hypot(earth.x, earth.y) || 1;
      const sx = -earth.x / sunLen;
      const sy = -earth.y / sunLen;
      glow(ctx, v.ex, v.ey, rE * 1.25, INK, 0.08 * ga);
      ctx.strokeStyle = rgba(INK, 0.3 * ga);
      ctx.beginPath();
      ctx.arc(v.ex, v.ey, rE, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = `rgb(${INK})`;
      for (const g of globe) {
        const n = surface(g.lat, g.lon, days);
        const depth = depthOf(v, n);
        if (depth < 0) continue;
        const xr = n.x * v.cosP - n.y * v.sinP;
        const yr = n.x * v.sinP + n.y * v.cosP;
        const day = n.x * sx + n.y * sy > 0;
        ctx.globalAlpha = ga * (0.2 + 0.65 * depth) * (day ? 1 : 0.28);
        ctx.fillRect(v.ex + rE * xr, v.ey + rE * (yr * v.sinE - n.z * v.cosE), 1.3, 1.3);
      }
      ctx.globalAlpha = 1;
    }

    // ── 國際太空站：貼著地球繞，轉到地球後面就被擋住 ──
    const issA = clamp01((rE - 12) / 24);
    if (issA > 0.01) {
      const u = (TAU * (f.now / 1000)) / ISS_PERIOD_S;
      const d = eqToEcl({ x: Math.cos(u), y: Math.sin(u) * Math.cos(ISS_INC), z: Math.sin(u) * Math.sin(ISS_INC) });
      const pos = { x: d.x * ISS_LS, y: d.y * ISS_LS, z: d.z * ISS_LS };
      const p = project(v, pos);
      const hidden = depthOf(v, d) < 0 && Math.hypot(p.x - v.ex, p.y - v.ey) < rE;
      if (!hidden && !drawArt(ctx, 'iss', p.x, p.y, 0.95 * issA)) {
        ctx.fillStyle = rgba(INK, issA);
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
      marks.push({
        key: 'iss',
        x: p.x + ART.iss.w / 2,
        y: p.y,
        a: hidden ? 0 : issA * fadeIn,
        dist: ISS_LS - EARTH_LS,
      });
    }

    // ── 還在地球上的：繞著地球轉，地球縮成一點之後就看不到了 ──
    const homeA = fadeIn * clamp01((rE - 2) / 8);
    homes.forEach((s) => {
      if (homeA <= 0.01) return;
      const r = rE + (s.home === 'live' ? 26 : 38);
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

    // ── 離開：從台灣發出去的一道波前 ──
    if (f.launch !== undefined) drawLaunch(ctx, dot.x, dot.y, f.launch, v.diag);

    return { points, marks, inView };
  }

  return {
    draw,
    /** 琥珀點在畫面上的位置（換頁轉場的點落在這裡、離開時從這裡發射） */
    earth: (f: SkyFrame) => homeDot(view(f), f.now),
    /** 地球中心在畫面上的位置（發射的方向從這裡往台灣指出去） */
    center: (f: SkyFrame) => {
      const v = view(f);
      return { x: v.ex, y: v.ey };
    },
    /** 訊號圈的扁度（縱向半徑是橫向的幾倍）：換頁的點沿著訊號圈繞進來時照它畫 */
    ringAspect: (f: SkyFrame) => view(f).sinE,
    /** 現在畫面邊上是多遠（光秒） */
    reach: (f: SkyFrame) => view(f).D,
    /** 從地球捲到最遠跨了幾個數量級（頁面要多長） */
    decades: L1 - L0,
    distOf,
  };
}

/** 退場時鏡頭停在地球旁邊的那個斜度：波前畫成這個扁度的圈，頁面藏起來之後轉場接著畫也一樣 */
const LAUNCH_SQUASH = Math.sin(1.12);

/**
 * 離開這頁時從台灣發出去的波前：三圈，一圈比一圈晚一點。k 是 0 到 1 的進度；
 * 頁面自己畫前半段，頁面藏起來之後由轉場（Departure.residue）接著畫完
 */
export function drawLaunch(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, diag: number) {
  if (k <= 0) return;
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const p = clamp01(k * 1.4 - i * 0.2);
    if (p <= 0 || p >= 1) continue;
    const r = 6 + (1 - (1 - p) ** 2) * diag * 0.5;
    ctx.strokeStyle = rgba(AMBER, 0.55 * (1 - p));
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * LAUNCH_SQUASH, 0, 0, TAU);
    ctx.stroke();
  }
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
