// 首頁那顆土星的設定：3D 版（lib/starfieldGpu）與此站點遊樂場的平面版（about/colophonSaturn）共用這一份，
// 兩邊畫出來的才是同一顆。只有數字，不碰 three。
import type { Theme } from './theme';
import type { Fold } from './viewportFold';
import { focusY } from './viewportShape';

/** 俯角與側傾，跟提案的示意一樣：從上方 24° 往下看，整組往右下斜 11° */
export const TILT = 0.42;
export const ROLL = -0.2;

/** 光從左上前方來（世界座標，只取方向） */
export const SUN: [number, number, number] = [-0.75, 0.45, 0.5];

/**
 * 真實土星的雲帶（Cassini 的影像）：[緯度°, 寬度°, 亮度增減]。赤道帶最亮最寬，兩側的赤道帶狀雲（NEB/SEB）
 * 最暗，往兩極一亮一暗越來越窄，極區整片暗下去；北緯 78° 那條是北極六角形的邊。
 * 正緯度只寫北半球，南半球用 mirror 標記照抄（南北不完全對稱，所以有幾條只寫一邊）
 */
const SATURN_BANDS: [lat: number, width: number, delta: number, mirror: boolean][] = [
  [0, 9, 0.26, false],
  [17, 4, -0.3, true],
  [22.5, 2.5, 0.08, true],
  [28, 2, -0.14, true],
  [33, 2.5, 0.06, true],
  [38, 1.6, -0.12, true],
  [43, 2.4, 0.05, true],
  [48, 1.5, -0.13, true],
  [53, 2, 0.03, true],
  [58, 1.8, -0.1, true],
  [-63, 2.5, -0.08, false],
  [64, 2, -0.06, false],
  [72, 5, -0.2, true],
  [78, 0.9, 0.16, false],
  [86, 6, -0.3, true],
];

/** 雲帶展開成南北兩半各一條（mirror 的那些） */
export const SATURN_BANDS_FULL: [lat: number, width: number, delta: number][] = SATURN_BANDS.flatMap(([c, w, d, m]) =>
  m
    ? [
        [c, w, d],
        [-c, w, d],
      ]
    : [[c, w, d]],
);

/**
 * 真實土星環的徑向結構（Cassini 的掩星量測，單位是土星赤道半徑）：[內緣, 外緣, 亮度]。
 * 由內到外 D、C、B（分四段，B 環中段最亮最密）、卡西尼縫、A、F；A 環裡的恩克縫、基勒縫另外挖掉
 */
export const RING_SEGMENTS: [inner: number, outer: number, tone: number][] = [
  [1.11, 1.236, 0.08],
  [1.239, 1.527, 0.26],
  [1.527, 1.64, 0.62],
  [1.64, 1.75, 0.88],
  [1.75, 1.88, 1],
  [1.88, 1.951, 0.8],
  [1.951, 2.025, 0.1],
  [2.025, 2.267, 0.62],
  [2.322, 2.33, 0.4],
];
/** A 環裡的縫（恩克縫、基勒縫）與 C 環的麥斯威爾縫：[位置, 半寬] */
export const RING_GAPS: [at: number, half: number][] = [
  [2.214, 0.006],
  [2.265, 0.003],
  [1.45, 0.006],
];
export const RING_INNER = 1.11;
export const RING_OUTER = 2.34;

/** 五顆衛星的軌道半徑（星球半徑是 1），由內到外對應首頁的五個分區（data/siteSections） */
export const ORBITS = [2.9, 3.55, 4.25, 4.95, 5.7];
/** 第 i 顆衛星起始的角度（錯開）與角速度（越外圈越慢，克卜勒的味道就好） */
export const satellitePhase = (i: number) => 0.7 + i * 1.37;
export const satelliteSpeed = (r: number) => 0.16 / Math.sqrt(r);

/** 星球每列刷痕的密度：星球半徑 1 上有幾列；環是每單位半徑幾圈 */
export const PLANET_ROWS = 22;
export const RING_ROWS = 34;
/** 最濃的地方線也只佔一列的幾成：線與線之間永遠留一道黑縫 */
export const PLANET_COVER = 0.76;
export const RING_COVER = 0.64;

/**
 * 主星的長相（主題預設，lib/theme）：3D（lib/starfieldGpu）與開場的小環（__root.tsx）照這份畫。
 * 畫法全部一樣（刻線、太陽從左上前方來），換的只是數字，所以每個主題的主星都是同一支筆畫的
 */
export interface PlanetSpec {
  /** 雲帶，南北已展開：[緯度°, 寬度°, 亮度增減] */
  bands: [lat: number, width: number, delta: number][];
  /** 底子的亮度（雲帶加減在它上面） */
  base: number;
  /** 球面的刷痕：星球半徑 1 上有幾列、最濃時線佔一列的幾成 */
  rows: number;
  cover: number;
  /**
   * 刷痕往訊號色偏多少（0 是墨色）。目前都是 0：訊號色只出現在「你在這裡」那一個點上，
   * 整顆星球偏過去等於拿訊號色塗一大片（試過海王星 0.4，跟站上的配色規則衝突）
   */
  tint: number;
  /** 兩極從 [全暗, 開始暗] 這段緯度（°）暗下去 */
  pole: [dark: number, from: number];
  /** 斑點（風暴）：[經度 rad, 緯度°, 東西半寬°, 南北半寬°, 亮度增減] */
  spots: [lon: number, lat: number, wLon: number, wLat: number, delta: number][];
  ring: {
    /** [內緣, 外緣, 亮度]，單位是星球半徑 */
    segments: [inner: number, outer: number, tone: number][];
    gaps: [at: number, half: number][];
    inner: number;
    outer: number;
    /**
     * 環上的弧：[半徑, 從幾 rad, 到幾 rad, 亮度]。整圈的環很淡，只有這幾段亮——跟著環一起轉。
     * 沒有的話是 []
     */
    arcs: [r: number, from: number, to: number, tone: number][];
    /** 環整體的濃度（土星 1；海王星的環很暗，只剩弧與幾道細線） */
    gain: number;
    /**
     * 環切成一圈圈刷痕（RING_ROWS）。海王星的環每一道都比一列刷痕還細，切了會剛好落在縫裡消失，
     * 所以不切，直接照亮度畫成細線
     */
    brushed: boolean;
  };
  /** 開場那道小環畫哪幾圈：[半徑（星球半徑）, 亮度] */
  boot: [r: number, tone: number][];
  /** 反方向公轉的衛星（由內到外第幾顆，0 起算） */
  retrograde: number[];
}

const ringMid = (i: number): [number, number] => {
  const [inner, outer, tone] = RING_SEGMENTS[i];
  return [(inner + outer) / 2, tone ** 0.75];
};

const SATURN: PlanetSpec = {
  bands: SATURN_BANDS_FULL,
  base: 0.52,
  rows: PLANET_ROWS,
  cover: PLANET_COVER,
  tint: 0,
  pole: [80, 48],
  spots: [],
  ring: {
    segments: RING_SEGMENTS,
    gaps: RING_GAPS,
    inner: RING_INNER,
    outer: RING_OUTER,
    arcs: [],
    gain: 1,
    brushed: true,
  },
  // B 環最亮的那段與 A 環，中間空出來的就是卡西尼縫
  boot: [ringMid(4), ringMid(7)],
  retrograde: [],
};

/** 角度（°）→ rad */
const deg = (d: number) => (d * Math.PI) / 180;

/**
 * 海王星（Voyager 2 的影像）：赤道一帶偏暗、中緯度一亮一暗，南緯 60° 以南一圈暗帶。
 * 南緯 22° 的大暗斑，它南緣的白色伴雲，南緯 42° 那朵跑得最快的白雲（Scooter），南緯 55° 的小暗斑（中心有一點白）。
 *
 * 跟土星要一眼分得出來，靠的是輪廓：土星是一大片亮環，海王星是一顆幾乎光滑的藍球，環暗到只剩四段弧。
 * 所以條紋的增減只有土星的一半左右，刷痕更細更密
 */
const NEPTUNE: PlanetSpec = {
  bands: [
    [0, 14, -0.06],
    [-24, 6, 0.05],
    [24, 7, 0.04],
    [-40, 4, -0.04],
    [-46, 3, 0.05],
    [44, 5, 0.03],
    [-66, 9, -0.12],
    [66, 9, -0.08],
  ],
  base: 0.58,
  rows: 34,
  cover: 0.56,
  tint: 0,
  pole: [72, 44],
  spots: [
    [0.4, -22, 13, 6.5, -0.62],
    [0.42, -29, 7, 1.6, 0.55],
    [2.3, -42, 4, 1.5, 0.5],
    [4.3, -55, 4.5, 2.6, -0.45],
    [4.3, -55, 1.2, 0.8, 0.6],
  ],
  // 由內到外：Galle（寬、很淡）、Le Verrier（細）、Lassell（淡的一片）、Arago（細）、Adams（細，上面有弧）
  ring: {
    segments: [
      [1.66, 1.74, 0.03],
      [2.142, 2.156, 0.22],
      [2.156, 2.3, 0.015],
      [2.306, 2.316, 0.1],
      [2.532, 2.548, 0.16],
    ],
    gaps: [],
    inner: 1.6,
    outer: 2.6,
    // Adams 環上的弧，照順序是 Courage、Liberté、Égalité、Fraternité（實際只佔 40° 左右，這裡拉長一點才看得見）
    arcs: [
      [2.54, deg(0), deg(4), 1],
      [2.54, deg(9), deg(19), 1],
      [2.54, deg(24), deg(38), 1],
      [2.54, deg(45), deg(66), 1],
    ],
    gain: 1,
    brushed: false,
  },
  // 開場那道小環：Le Verrier 與 Adams（Adams 上的弧照載入的階段一段段亮起來，index.css 的 #boot）
  boot: [
    [2.149, 0.6],
    [2.54, 0.5],
  ],
  // 崔頓：太陽系唯一一顆反方向公轉的大衛星。最外圈那顆倒著繞，看久了才會發現
  retrograde: [4],
};

export const PLANETS: Record<Theme, PlanetSpec> = { saturn: SATURN, neptune: NEPTUNE };

/**
 * 首頁土星佔的那一塊（CSS 像素）：中心與可用的寬高。3D 背景與換頁的錨點都照這個。
 * 橫的畫面置中；直的手機提到 46%，下面留給手指；摺疊機直拿與直式平板再往上提到摺痕以上（lib/viewportShape）。
 * 摺起來時星球本體放進第一半（書本式左半、筆電式上半），另一半是五個分區的目錄
 */
/** 書本式摺起來時再放大幾倍：左半一整頁是插圖，照整個畫面的尺寸算會顯得縮在角落 */
const BOOK_ZOOM = 1.3;

export function saturnFrame(w: number, h: number, fold: Fold | null) {
  // 背景是連續的：外圈軌道可以越過摺痕，只有星球本體待在第一半。
  // 書本式的本體在左半偏右一點、照比左半寬一些的那塊縮放；筆電式在上半中間、照整個畫面縮放
  if (fold?.pose === 'book') {
    const b = fold.first;
    return { x: b.x + b.width * 0.5, y: b.y + b.height / 2, width: b.width * 1.25, height: b.height, zoom: BOOK_ZOOM };
  }
  if (fold) return { x: w / 2, y: fold.first.y + fold.first.height / 2, width: w, height: h, zoom: 1 };
  return { x: w / 2, y: h * (h > w ? focusY(w, h, 0.46) : 0.5), width: w, height: h, zoom: 1 };
}

/** 土星那層的鏡頭在 z = 0 的平面上，畫面半高是幾個單位（lib/starfieldGpu 的 saturnCam） */
export const SATURN_VIEW_HALF = 3.84;
/**
 * 整組的大小：0.63 讓星球半徑約是畫面高度的 8%，最外圈軌道半徑 5.7 × 0.63 ≈ 3.6，寬螢幕放得下；
 * 窄的視窗照長寬比再縮
 */
export const BASE_SCALE = 0.63;
/**
 * 放進 boxW × boxH 那一塊（CSS 像素，畫面高 viewH）要縮到多少：寬照長寬比、高留給扁的軌道。
 * 整個畫面時高那一項比 BASE_SCALE 大，不起作用；摺起來只剩上半時才是它在限制
 */
export const fitScale = (boxW: number, boxH: number, viewH: number) =>
  Math.min(BASE_SCALE, (0.6 * boxW) / viewH, (1.3 * boxH) / viewH);

/** 長（換頁落地、開場）時星球與環各從第幾秒長到第幾秒；其餘的軌道與衛星在 lib/starfieldGpu 的 GROW */
const GROW_PLANET = [0, 0.45] as const;
const GROW_RING = [0.15, 0.6] as const;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const growSpan = ([from, to]: readonly [number, number], t: number) =>
  easeOutCubic(Math.min(1, Math.max(0, (t - from) / (to - from))));

/**
 * 開始長之後 t 秒，星球與環各長到幾成（0 到 1）。3D 土星照這個長，開場那道小環也照這個
 * 跟著長、跟著淡（layout/TransitionLayer），兩邊才對得上
 */
export const saturnGrowAt = (t: number) => ({ planet: growSpan(GROW_PLANET, t), ring: growSpan(GROW_RING, t) });

/**
 * 首頁 3D 土星的環在畫面上的中心與外緣半徑（CSS 像素）。開場那道小環在換頁時長大，
 * 要剛好長到這個大小，跟 3D 的環交棒（layout/TransitionLayer）
 */
export function saturnRingOnScreen(w: number, h: number, fold: Fold | null, outer = RING_OUTER) {
  const f = saturnFrame(w, h, fold);
  const scale = fitScale(f.width, f.height, h) * f.zoom;
  return { x: f.x, y: f.y, r: ((outer * scale) / SATURN_VIEW_HALF) * (h / 2) };
}
