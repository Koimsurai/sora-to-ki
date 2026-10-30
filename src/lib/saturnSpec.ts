// 首頁那顆土星的設定：3D 版（lib/starfieldGpu）與此站點遊樂場的平面版（about/colophonBody）共用這一份，
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
/** 吸積盤的螺旋條紋有多斜：角度隨 ln(半徑) 偏移幾倍（越大越像緊緊捲起來的螺旋） */
export const DISK_SHEAR = 3.2;
/** 吸積盤的刷痕最濃時佔一列的幾成：比土星的環（RING_COVER）密，盤看起來是厚實的一層 */
export const DISK_COVER = 0.8;

/**
 * 主星的長相（主題預設，lib/theme）：3D（lib/starfieldGpu）與開場的小環（__root.tsx）照這份畫。
 * 畫法全部一樣（刻線、太陽從左上前方來），換的只是數字，所以每個主題的主星都是同一支筆畫的
 */
export interface PlanetSpec {
  /**
   * planet：有表面的星球（刻線畫的球）。blackhole：主星是一片陰影，沒有任何刻線；
   * 外面一圈光子環、被重力彎到陰影上下的盤影（lib/starfieldGpu 的 lens），吸積盤拆前後兩半夾住它
   */
  kind: 'planet' | 'blackhole' | 'star';
  /** 雲帶，南北已展開：[緯度°, 寬度°, 亮度增減] */
  bands: [lat: number, width: number, delta: number][];
  /** 底子的亮度（雲帶加減在它上面） */
  base: number;
  /** 球面的刷痕：星球半徑 1 上有幾列、最濃時線佔一列的幾成 */
  rows: number;
  cover: number;
  /**
   * 筆觸：wave 是線上下起伏多大（列的幾成）、swell 是粗細起伏多大、floor 是斷開的地方還剩幾成。
   * 土星起伏大、斷得多（手繪的刷痕）；海王星是一顆帶霧的光滑球，線平順、幾乎不斷
   */
  stroke: { wave: number; swell: number; floor: number };
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
     * 都卜勒增亮：盤上朝我們轉來的那一側（左邊）亮多少、另一側暗多少（0 是沒有）。
     * 黑洞的吸積盤轉得接近光速，2019 年事件視界望遠鏡拍的 M87* 就是一側特別亮
     */
    doppler: number;
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
  /** 主星會脹縮（參宿四）：半徑變化多少（幾成）、脹縮一次幾秒、亮度跟著變多少（幾成） */
  pulse?: { amp: number; period: number; light: number };
  /** 北極的六角形（土星）：離北極幾度、線寬幾度、多亮 */
  hexagon?: { colat: number; width: number; delta: number };
  /** 冰噴泉（土星的土衛二）：第幾顆衛星身後拖著一縷冰粒 */
  plume?: number;
  /** 伴星（參宿四的 Siwarha）：繞主星的半徑（星球半徑）、大小、轉一圈幾秒。不是分區、沒有字卡 */
  companion?: { a: number; size: number; period: number };
  /**
   * 每條軌道自己的形狀（黑洞的 S 星、海王星的崔頓與海衛二）：一條一筆，由內到外。
   * 沒給的話是同一個平面上的正圓（ORBITS）
   */
  stars?: StarOrbit[];
}

/**
 * S 星的軌道：銀河系中心的黑洞（人馬座 A*）周圍那群恆星。根策爾與蓋茲兩個團隊追了三十年，
 * 靠它們的軌道證明那裡有四百萬倍太陽質量的黑洞（2020 年諾貝爾物理獎）。軌道是扁橢圓、黑洞在焦點上，
 * 各自傾斜、互相交錯；GRAVITY 2020 年量到 S2 的軌道在進動（史瓦西進動），整條橢圓慢慢繞著黑洞轉。
 * a 半長軸（星球半徑）、e 離心率、incl 傾角°、node 升交點經度°、peri 近點方向°、precession 進動（°/秒）
 */
export interface StarOrbit {
  a: number;
  e: number;
  incl: number;
  node: number;
  peri: number;
  precession: number;
}

const ringMid = (i: number): [number, number] => {
  const [inner, outer, tone] = RING_SEGMENTS[i];
  return [(inner + outer) / 2, tone ** 0.75];
};

/**
 * 土星的衛星照真實的間距排：土衛一 Mimas、土衛二 Enceladus、土衛三 Tethys、土衛四 Dione、土衛五 Rhea
 * （3.08、3.95、4.89、6.26、8.74 個土星半徑，越外面隔得越開）。畫面放不下原比例，照同一個間距的節奏
 * 對到環外（2.6）到原本的最外圈（5.7）之間。都在赤道面上、近乎正圓
 */
const SATURN_MOONS = [3.08, 3.95, 4.89, 6.26, 8.74].map((a) => ({
  a: 2.6 + ((a - 3.08) * (5.7 - 2.6)) / (8.74 - 3.08),
  e: 0,
  incl: 0,
  node: 0,
  peri: 0,
  precession: 0,
}));

const SATURN: PlanetSpec = {
  kind: 'planet',
  // 北緯 78° 那條是北極六角形的邊，改由 hexagon 畫成真的六角形
  bands: SATURN_BANDS_FULL.filter(([lat]) => lat !== 78),
  base: 0.52,
  rows: PLANET_ROWS,
  cover: PLANET_COVER,
  stroke: { wave: 0.8, swell: 0.45, floor: 0.05 },
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
    doppler: 0,
  },
  // B 環最亮的那段與 A 環，中間空出來的就是卡西尼縫
  boot: [ringMid(4), ringMid(7)],
  retrograde: [],
  stars: SATURN_MOONS,
  // 北極六角形：北緯 78° 一圈六角形的噴流（航海家號 1981 年發現，卡西尼號拍得最清楚）。首頁是從北方往下看，看得到
  hexagon: { colat: 12, width: 1.4, delta: 0.85 },
  // 土衛二南極的冰噴泉把冰粒噴進軌道，形成了 E 環
  plume: 1,
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
  kind: 'planet',
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
  stroke: { wave: 0.25, swell: 0.12, floor: 0.75 },
  tint: 0,
  pole: [72, 44],
  // 黑白裡認得出海王星，靠的是暗斑（刻線中間空掉的橢圓，邊緣一圈亮雲）與幾道細長的亮白卷雲。
  // 暗斑都是外面一圈較寬的亮、裡面較窄的暗，相減就是「邊緣亮、中間的線變得很細」（全空掉的話像挖了一個洞）。
  // 首頁是從北方 24° 往下看：航海家 2 號那個南緯 22° 的大暗斑會擠在下緣、壓在環的影子裡，
  // 所以另外照 2018 年哈伯拍到的北半球暗斑放一個在看得到的那一面（經度負的是左邊，太陽從左上前方來）
  spots: [
    [-0.95, 23, 24, 11, 0.6],
    [-0.95, 23, 16, 7, -1.05],
    [-0.88, 15, 14, 1.8, 0.9],
    // 哈伯 1994 年以後在北半球看過好幾個暗斑：另一側經度再放一個小的，轉到哪都比較常看得到一個
    [2.2, 31, 16, 7.5, 0.5],
    [2.2, 31, 11, 5, -0.95],
    // 航海家 2 號的大暗斑與它南緣的白雲
    [-0.55, -22, 24, 11, 0.6],
    [-0.55, -22, 16, 7, -1.05],
    [-0.5, -32, 14, 1.8, 0.9],
    [0.9, -42, 5, 1.4, 0.7],
    [2.6, -55, 5, 3, -0.6],
    [2.6, -55, 1.2, 0.9, 0.8],
    // 卷雲：東西拉得很長、南北很窄的亮帶
    [-1.4, 27, 35, 0.9, 0.7],
    [1.8, 31, 28, 0.8, 0.6],
    [3.6, -36, 30, 0.8, 0.6],
    [-2.6, 41, 22, 0.7, 0.5],
  ],
  // 真實的海王星環由內到外是 Galle、Le Verrier、Lassell、Arago、Adams，但 Galle 與 Lassell 是很淡、很寬的一片，
  // 畫出來像一塊髒汙。只留最清楚的兩道細環：Le Verrier 與 Adams（上面有弧），跟開場那道小環是同一組，交棒時接得上
  ring: {
    segments: [
      [2.142, 2.156, 0.45],
      [2.532, 2.548, 0.35],
    ],
    gaps: [],
    inner: 2,
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
    doppler: 0,
  },
  // 開場那道小環：Le Verrier 與 Adams（Adams 上的弧照載入的階段一段段亮起來，index.css 的 #boot）
  boot: [
    [2.149, 0.6],
    [2.54, 0.5],
  ],
  // 崔頓：太陽系唯一一顆反方向公轉的大衛星，倒著繞（第 4 條，見下面的 stars）
  retrograde: [3],
  // 海王星的衛星照真實的樣子：內側的小衛星（Proteus、Larissa、Galatea…）都在赤道面上、近乎正圓；
  // 崔頓的軌道相對赤道傾斜 157°（逆行而且斜了 23°）；海衛二（Nereid）離心率 0.75，是太陽系已知軌道最扁的衛星——
  // 畫面放不下那麼扁，取 0.38（遠點 6.2、近點 2.8，還在 Adams 環外面）。不進動
  stars: [
    { a: 2.9, e: 0, incl: 0, node: 0, peri: 0, precession: 0 },
    { a: 3.55, e: 0, incl: 0, node: 0, peri: 0, precession: 0 },
    { a: 4.25, e: 0, incl: 0, node: 0, peri: 0, precession: 0 },
    { a: 4.95, e: 0, incl: 23, node: 40, peri: 0, precession: 0 },
    { a: 4.5, e: 0.38, incl: 7, node: 200, peri: 120, precession: 0 },
  ],
};

/**
 * 黑洞：主星是一片陰影（事件視界的影子），沒有任何刻線。外面一圈很細的光子環，
 * 吸積盤是一圈圈刷痕、越往內越亮，朝我們轉來的那一側較亮（都卜勒增亮，同 M87* 的照片）；
 * 盤的背面被重力彎到陰影的上方與下方（《星際效應》的 Gargantua 那個樣子），畫在 lib/starfieldGpu 的 lens
 */
const BLACK_HOLE: PlanetSpec = {
  kind: 'blackhole',
  bands: [],
  base: 0,
  rows: PLANET_ROWS,
  cover: PLANET_COVER,
  stroke: { wave: 0.8, swell: 0.45, floor: 0.05 },
  tint: 0,
  pole: [90, 89],
  spots: [],
  ring: {
    // 內緣在陰影外約 15%：盤的內緣是最內穩定軌道（史瓦西半徑的 3 倍），陰影看起來約 2.6 倍，再往內物質站不住、直接掉進去
    segments: [
      [1.17, 1.45, 1],
      [1.45, 1.8, 0.8],
      [1.8, 2.2, 0.55],
      [2.2, 2.6, 0.3],
    ],
    gaps: [],
    inner: 1.15,
    outer: 2.65,
    arcs: [],
    gain: 1,
    brushed: true,
    doppler: 0.55,
  },
  // 開場不畫環：物質旋進來的螺旋臂與光子環另外畫（__root.tsx 的 BootSwirl）
  boot: [],
  retrograde: [],
  // 近點都在吸積盤外（≥ 2.6），遠點不超過土星最外圈軌道太多（≤ 6），畫面才放得下
  stars: [
    { a: 3.3, e: 0.18, incl: 8, node: 20, peri: 40, precession: 0.8 },
    { a: 3.7, e: 0.3, incl: 24, node: 110, peri: 200, precession: 0.6 },
    { a: 4.1, e: 0.24, incl: 14, node: 250, peri: 300, precession: 0.5 },
    { a: 4.5, e: 0.33, incl: 32, node: 60, peri: 120, precession: 0.4 },
    { a: 4.9, e: 0.2, incl: 18, node: 170, peri: 10, precession: 0.3 },
  ],
};

/**
 * 參宿四：獵戶座肩上的紅超巨星，放到太陽的位置表面會超過木星的軌道。它自己發光——沒有晨昏線，
 * 亮度照邊緣變暗（中間亮、邊緣暗）；表面只有幾個巨大的對流胞（少數表面被直接拍到的恆星，VLT 與 ALMA 的影像）。
 * 它是半規則變星，大約每 400 天脹縮一次（pulse，這裡縮成幾秒）。
 * 2019–2020 年的大暗化：它暗到只剩三分之一，哈伯查出是南半球噴出一大團物質、冷卻成塵埃擋住了光（spots 裡那塊暗的）。
 * 2025 年確認的伴星 Siwarha：很暗、離參宿四很近（比所有分區的軌道都內側），貼著它繞（companion）。
 * 參宿四沒有已知的行星，五條軌道是網站的分區，畫成點線像一圈圈拋出去的塵埃殼
 */
const BETELGEUSE: PlanetSpec = {
  kind: 'star',
  bands: [],
  base: 0.62,
  rows: 26,
  cover: 0.72,
  stroke: { wave: 2.4, swell: 0.4, floor: 0.2 },
  tint: 0,
  pole: [95, 94],
  spots: [
    // 大暗化的塵埃
    [0.3, -35, 42, 22, -0.55],
    // 表面的熱斑
    [-0.8, 22, 16, 12, 0.3],
    [2, -6, 20, 15, 0.25],
  ],
  ring: { segments: [], gaps: [], inner: 1.05, outer: 1.6, arcs: [], gain: 0, brushed: true, doppler: 0 },
  // 開場不畫環：恆星的輪廓在呼吸，外面一圈圈塵埃殼照載入階段出現（__root.tsx 的 BootShells）
  boot: [],
  retrograde: [],
  pulse: { amp: 0.07, period: 7, light: 0.22 },
  companion: { a: 1.6, size: 0.12, period: 11 },
};

export const PLANETS: Record<Theme, PlanetSpec> = {
  saturn: SATURN,
  neptune: NEPTUNE,
  blackhole: BLACK_HOLE,
  betelgeuse: BETELGEUSE,
};

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
