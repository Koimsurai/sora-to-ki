// 設備頁（about/Setup）的六張工程圖：每一個分類一張。零件的名字與規格在 setupGear，
// 這裡只放「畫在圖紙的哪裡」：圖紙上的位置是圖紙寬高的比例，底稿上的位置是底稿寬高的比例。
// 這裡只有資料，不碰 React。
import { APPLIANCES, BASE_II_SPECS } from './setupGear';

/** 零件線稿（public/illustrations/setup/<零件 id>.webp）：網路與智慧家庭那兩張的節點 */
export const partArt = (id: string) => `/illustrations/setup/${id}.webp`;

/** 多邊形（[x, y] 的陣列） */
type Poly = [number, number][];
/** [中心 x, 中心 y, 寬, 高, 畫成什麼形狀]：老家那台的草圖上，用虛線畫出零件的形狀（透視） */
export type Box = [number, number, number, number, ShapeKind];
export type ShapeKind = 'chip' | 'ram' | 'board' | 'gpu' | 'psu' | 'hdd' | 'case';

/** 老家那台的草圖上（相對插圖的比例） */
export const MEMORY_AT: Record<string, Box> = {
  cpu: [0.42, 0.2, 0.06, 0.07, 'chip'],
  gpu: [0.4, 0.39, 0.2, 0.05, 'gpu'],
  ram: [0.48, 0.21, 0.025, 0.12, 'ram'],
  board: [0.41, 0.3, 0.2, 0.4, 'board'],
  psu: [0.4, 0.58, 0.2, 0.09, 'psu'],
  storage: [0.19, 0.24, 0.12, 0.07, 'hdd'],
  case: [0.33, 0.35, 0.44, 0.66, 'case'],
};

/** 底稿上的一個零件：範圍（滑過時範圍裡的線染成琥珀色）、引線落在哪、編號圈擺在哪 */
export interface Callout {
  /** setupGear 的零件 id（名字與規格從那裡拿） */
  id: string;
  poly: Poly[];
  at: [number, number];
  balloon: [number, number];
}

/** 一條尺寸線：量 a 到 b，整條往 off 的方向平移出去（兩端拉延伸線）；off 是 0 就直接畫在 a、b 之間（直徑） */
export interface Dim {
  a: [number, number];
  b: [number, number];
  off: [number, number];
  label: string;
}

/**
 * 一張工程概念設計圖：AI 生的爆炸軸測線稿當底稿（白底黑線轉成暖白透明），
 * 編號、引線、尺寸線、零件表都是程式疊上去的
 */
export interface Drawing {
  src: string;
  /** 底稿的高寬比 */
  ratio: number;
  /** 底稿在圖紙上的左上角與寬（圖紙寬高的比例） */
  x: number;
  y: number;
  w: number;
  parts: Callout[];
  dims: Dim[];
}

/** 百分比寫的平面座標（x1, y1, x2, y2⋯）→ 多邊形（0–1） */
const pct = (...v: number[]): Poly => {
  const out: Poly = [];
  for (let i = 0; i + 1 < v.length; i += 2) out.push([v[i] / 100, v[i + 1] / 100]);
  return out;
};
const pt = (x: number, y: number): [number, number] => [x / 100, y / 100];

const WHITE_BUILD: Drawing = {
  src: '/illustrations/setup/sheet-white-build.webp',
  ratio: 1251 / 1500,
  x: 0.02,
  y: 0.07,
  w: 0.66,
  parts: [
    {
      id: 'rtx-4070ti-super',
      poly: [pct(18, 69, 22.5, 66, 44.5, 77, 44.5, 91, 43, 92.5, 21, 84.5, 18, 80)],
      at: pt(31, 80),
      balloon: pt(9, 90),
    },
    {
      id: 'ryzen-9900x',
      poly: [pct(47, 44.6, 50.3, 42.6, 53.6, 44.6, 50.3, 46.8)],
      at: pt(50.3, 44.7),
      balloon: pt(59, 36),
    },
    {
      id: 'eskimo-360',
      poly: [
        pct(36.5, 6.5, 44.5, 1.5, 70, 17.5, 69.5, 23, 60.5, 26.5, 36.5, 10.5),
        pct(36.5, 10, 41, 11, 46.5, 33, 53.5, 33.5, 53.5, 41.5, 46, 41.5, 44.5, 35, 36.5, 16),
      ],
      at: pt(53, 13),
      balloon: pt(78, 7),
    },
    {
      id: 'xpg-lancer',
      poly: [pct(53.5, 44.5, 56.5, 42, 65.5, 47.5, 65.5, 53, 62, 54.5, 53.5, 48)],
      at: pt(60, 48),
      balloon: pt(81, 35),
    },
    {
      id: 'b650-a',
      poly: [pct(31, 60.5, 39, 50.5, 49.5, 47, 60, 54, 57, 60, 45, 71.5, 31, 61.5)],
      at: pt(37, 60),
      balloon: pt(27, 50),
    },
    {
      id: 'crucial-t500',
      poly: [pct(48.5, 73, 50, 72, 57.5, 76.5, 56, 78.5)],
      at: pt(53, 75.2),
      balloon: pt(63, 70),
    },
    {
      id: 'kioxia-exceria',
      poly: [pct(45, 77, 46.5, 76, 54, 80.5, 52.5, 82.5)],
      at: pt(49.5, 79.3),
      balloon: pt(52, 90),
    },
    {
      id: 'leadex-vii',
      poly: [pct(73.5, 70, 84, 70, 87.5, 69.5, 95, 74, 95, 90, 86, 95, 79, 90.5, 79, 76)],
      at: pt(87, 82),
      balloon: pt(97, 63),
    },
    {
      id: 'model-5',
      poly: [
        pct(1.5, 27, 23.5, 11.5, 24.5, 13, 24.5, 47, 13, 55, 13, 73.5, 1.5, 66),
        pct(28.5, 33, 46.5, 20, 78, 40.5, 77.5, 86, 59.5, 98.5, 55, 98, 28.5, 82),
      ],
      at: pt(72, 62),
      balloon: pt(67, 99),
    },
  ],
  dims: [{ a: pt(44, 1.5), b: pt(69.8, 17.5), off: pt(2.2, -3.4), label: '360' }],
};

const HOME_SERVER: Drawing = {
  src: '/illustrations/setup/sheet-server.webp',
  ratio: 1274 / 1500,
  x: 0.02,
  y: 0.07,
  w: 0.66,
  parts: [
    {
      id: 'phantom-spirit',
      poly: [pct(37.5, 7, 43, 1.5, 60, 9.5, 60, 22.5, 50, 30.5, 44.5, 29.5, 37.5, 20)],
      at: pt(44, 15),
      balloon: pt(29, 6),
    },
    { id: 'ryzen-8700g', poly: [pct(46, 55, 49, 52.5, 52, 55, 49, 58)], at: pt(49, 55.2), balloon: pt(60, 36) },
    {
      id: 'fury-beast',
      poly: [pct(53.5, 43, 57, 40.5, 65, 45, 65, 50, 62, 52, 53.5, 47)],
      at: pt(59, 46),
      balloon: pt(81, 34),
    },
    {
      id: 'x870e-tomahawk',
      poly: [pct(31, 58.5, 38.5, 52, 38.5, 49, 50, 45, 59, 51, 59, 53.5, 50, 61, 46, 68.5, 31, 60)],
      at: pt(37, 58),
      balloon: pt(27, 48),
    },
    {
      id: 'rtx-5060ti',
      poly: [pct(18, 67, 22, 64, 44.5, 74.5, 44.5, 89, 43, 91, 18.5, 80)],
      at: pt(31, 76),
      balloon: pt(8, 76),
    },
    {
      id: 'ip-kvm',
      poly: [pct(17.5, 83.5, 19.5, 82.5, 29, 87, 29, 95.5, 25, 95.5, 18.5, 93)],
      at: pt(23.5, 89),
      balloon: pt(10, 94),
    },
    { id: 'gm7000', poly: [pct(48.5, 70, 50, 69, 57.5, 73.5, 56, 75.5)], at: pt(53, 72.3), balloon: pt(62, 66) },
    {
      id: 'hc550',
      poly: [pct(64.5, 90, 67, 87.5, 81.5, 94, 81.5, 96, 73.5, 98.5, 64.5, 92.5)],
      at: pt(73, 93),
      balloon: pt(90, 99),
    },
    {
      id: 'prime-tx',
      poly: [pct(78, 68, 84, 67, 87.5, 66.5, 95, 71, 95, 87, 86, 92, 79, 88, 79, 73)],
      at: pt(87, 79),
      balloon: pt(97, 60),
    },
    {
      id: 'p10c',
      poly: [
        pct(1.5, 25, 23.5, 10, 24.5, 11, 24.5, 52, 13, 58, 13, 71.5, 1.5, 64),
        pct(28.5, 31, 42.5, 22.5, 78, 39, 78, 82, 68, 88, 59, 95, 28.5, 77),
      ],
      at: pt(71, 60),
      balloon: pt(63, 99),
    },
  ],
  dims: [{ a: pt(51, 11), b: pt(58.5, 22), off: [0, 0], label: 'Ø120' }],
};

const DESK: Drawing = {
  src: '/illustrations/setup/sheet-desk.webp',
  ratio: 1066 / 1500,
  x: 0.02,
  y: 0.12,
  w: 0.68,
  parts: [
    {
      id: 'xg27acs',
      poly: [
        pct(32.5, 1.5, 69, 26, 69, 59.5, 32.5, 34),
        pct(41, 60, 51.5, 51.5, 64, 62, 55, 71.5),
        pct(52.5, 21, 57.5, 21, 57.5, 60.5, 52.5, 60.5),
      ],
      at: pt(44, 20),
      balloon: pt(22, 10),
    },
    {
      id: 'mx-board-31s',
      poly: [pct(20, 69, 29, 61, 26, 55, 28.5, 54.5, 31, 56.5, 49, 70, 55, 79.5, 55, 83, 51, 91, 20, 72)],
      at: pt(33, 74),
      balloon: pt(10, 48),
    },
    {
      id: 'g502-x',
      poly: [pct(57.5, 87, 61, 85, 68, 86.5, 70, 91, 66, 96, 58.5, 94)],
      at: pt(63, 91),
      balloon: pt(80, 92),
    },
    {
      id: 'mv7-plus',
      poly: [pct(65.5, 63.5, 71, 59.5, 73.5, 52, 76, 48, 77.5, 50, 77, 60, 79, 66, 79, 73, 73.5, 74.5, 65.5, 69.5)],
      at: pt(72, 67),
      balloon: pt(82, 55),
    },
  ],
  dims: [{ a: pt(33.8, 4), b: pt(67.8, 57.5), off: [0, 0], label: '27"' }],
};

export type Sheet =
  | { no: number; key: string; title: string; kind: 'memory' }
  | {
      no: number;
      key: string;
      title: string;
      kind: 'drawing';
      drawing: Drawing;
      telemetry?: boolean;
      others?: string[];
    }
  | { no: number; key: string; title: string; kind: 'net' }
  | { no: number; key: string; title: string; kind: 'smart' };

/** 老家那張放最前面，編號是 0：跟作品頁的 VoltiCar 一樣，是起點 */
export const SHEETS: Sheet[] = [
  { no: 0, key: 'base-ii', title: 'BASE II', kind: 'memory' },
  { no: 1, key: 'main-rig', title: 'THE WHITE BUILD', kind: 'drawing', drawing: WHITE_BUILD },
  { no: 2, key: 'server', title: 'HOME SERVER', kind: 'drawing', drawing: HOME_SERVER, telemetry: true },
  { no: 3, key: 'network', title: 'NETWORK', kind: 'net' },
  { no: 4, key: 'smart-home', title: 'SMART HOME', kind: 'smart' },
  {
    no: 5,
    key: 'peripherals',
    title: 'PERIPHERALS',
    kind: 'drawing',
    drawing: DESK,
    // 底稿上沒畫的其他周邊：列在零件表底下
    others: [
      'g502-hero',
      'mx-board-20s',
      'mk882',
      'alloy-fps',
      'pixel-buds-pro2',
      'cloud-ii',
      'arctis-nova-7',
      'quadcast',
      'psa1-plus',
      't100',
    ],
  },
];

/** 老家那台的開機自檢：規格一行一行打出來，每一行對應草圖上的一塊 */
export const POST_LINES = BASE_II_SPECS.map((s) => ({
  ...s,
  region:
    { CPU: 'cpu', GPU: 'gpu', RAM: 'ram', MB: 'board', PSU: 'psu', Storage: 'storage', Case: 'case' }[s.label] ??
    'case',
}));

/**
 * 網路配線圖：最上面是網際網路與路由器，下面一條匯流排分成四路（有線、兩個 Wi-Fi、IoT），
 * 每一路底下掛著接在上面的東西。文字是翻譯檔 setup.topo.* 的 key 就翻，不是就照原文
 * （型號、頻段、協定不翻）；id 是 setupGear 的零件（有線稿、名字從那裡拿）
 */
interface NetNode {
  id?: string;
  name?: string;
  sub?: string;
  x: number;
  y: number;
  /** 線稿的寬（圖紙寬的比例） */
  w?: number;
  /** 再往右拉一條虛線，接到它控制的東西：[那樣東西, 用什麼訊號] */
  end?: [string, string];
}

export const NET: { buses: { label: string; sub: string; x: number; dashed: boolean }[]; nodes: NetNode[] } = {
  buses: [
    { label: 'netWired', sub: 'ETHERNET', x: 0.12, dashed: false },
    { label: 'Wi-Fi 5 GHz', sub: 'netMain', x: 0.36, dashed: true },
    { label: 'Wi-Fi 2.4 GHz', sub: 'netMain', x: 0.58, dashed: true },
    { label: 'IoT 2.4 GHz', sub: 'netIot', x: 0.8, dashed: true },
  ],
  nodes: [
    { id: 'qg-u1050', x: 0.12, y: 0.46, w: 0.07, sub: 'switch' },
    { name: 'Home Server', x: 0.12, y: 0.63, sub: 'Home Assistant' },
    { id: 'ip-kvm', x: 0.12, y: 0.8, w: 0.07, sub: 'PCIe' },
    { name: 'The White Build', x: 0.36, y: 0.48, sub: 'rig' },
    { id: 'pixel-8-pro', x: 0.33, y: 0.72, w: 0.03, name: 'Pixel 8 Pro' },
    { id: 'blade-14', x: 0.41, y: 0.72, w: 0.07, name: 'Blade 14' },
    { id: 'google-tv-streamer', x: 0.58, y: 0.46, w: 0.07, sub: 'matterHub' },
    { id: 'doorbell', x: 0.58, y: 0.74, w: 0.06, name: 'doorbellHub', end: ['doorbell', 'Wi-Fi'] },
    { id: 'switchbot-hub3', x: 0.8, y: 0.42, w: 0.05, sub: 'sensors' },
    { id: 'rm4-pro', x: 0.8, y: 0.58, w: 0.05, sub: 'irBlaster', end: ['ac', 'IR'] },
    {
      id: 'esp32-cc1101',
      x: 0.8,
      y: 0.74,
      w: 0.06,
      name: 'ESP32-C3 + CC1101',
      sub: 'rfBlaster',
      end: ['light', '433MHz'],
    },
    { name: 'appliances', x: 0.8, y: 0.9, sub: 'appliancesSub' },
  ],
};

/**
 * 太空船的子系統：把主機當成一艘太空船來畫系統圖。
 * C&DH 指令與資料處理（運算）、EPS 電力、TCS 熱控、DATA 資料記錄、COMM 通訊、
 * BUS 主體（太空船的「本體」就叫 bus，零件都掛在上面）、STRUCT 結構、CREW 乘員介面
 */
export const SUBSYSTEMS = ['C&DH', 'EPS', 'TCS', 'DATA', 'COMM', 'BUS', 'STRUCT', 'CREW'] as const;
export type Subsystem = (typeof SUBSYSTEMS)[number];

/** 零件線稿旁邊的小標：[子系統, 零件類別]（型號的類別，不翻） */
export const PART_TAG: Record<string, [Subsystem, string]> = {
  'rtx-4070ti-super': ['C&DH', 'GPU'],
  'ryzen-9900x': ['C&DH', 'CPU'],
  'model-5': ['STRUCT', 'CASE'],
  'eskimo-360': ['TCS', 'COOLER'],
  'xpg-lancer': ['C&DH', 'MEMORY'],
  xg27acs: ['CREW', 'DISPLAY'],
  'mx-board-31s': ['CREW', 'KEYBOARD'],
  'g502-x': ['CREW', 'MOUSE'],
  'mv7-plus': ['CREW', 'MIC'],
  'b650-a': ['BUS', 'BOARD'],
  'leadex-vii': ['EPS', 'PSU'],
  'crucial-t500': ['DATA', 'SSD'],
  'kioxia-exceria': ['DATA', 'SSD'],
  'rtx-5060ti': ['C&DH', 'GPU'],
  'ryzen-8700g': ['C&DH', 'CPU'],
  'x870e-tomahawk': ['BUS', 'BOARD'],
  'fury-beast': ['C&DH', 'MEMORY'],
  'phantom-spirit': ['TCS', 'COOLER'],
  'prime-tx': ['EPS', 'PSU'],
  p10c: ['STRUCT', 'CASE'],
  gm7000: ['DATA', 'SSD'],
  hc550: ['DATA', 'HDD'],
  'ip-kvm': ['COMM', 'KVM'],
  router: ['COMM', 'ROUTER'],
  'qg-u1050': ['COMM', 'SWITCH'],
};

/** 智慧家庭的訊號流程：Home Assistant 發出去，經過各個中樞，最後到家裡的哪一樣東西 */
export const SMART = {
  hubs: [
    { id: 'google-tv-streamer', y: 0.16, w: 0.07, via: 'Matter', to: 'voice' },
    { id: 'switchbot-hub3', y: 0.35, w: 0.05, via: 'Matter', to: 'climate' },
    { id: 'rm4-pro', y: 0.54, w: 0.05, via: 'IR', to: 'ac' },
    { id: 'esp32-cc1101', y: 0.72, w: 0.06, via: '433MHz', to: 'light' },
    { id: 'doorbell', y: 0.9, w: 0.05, via: 'Wi-Fi', to: 'door' },
  ],
  others: APPLIANCES,
} as const;
