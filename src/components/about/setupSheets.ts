// 設備頁（about/Setup）的六張工程圖：每一個分類一張。零件的名字與規格在 setupGear，
// 這裡只放「畫在圖紙的哪裡」：位置都是圖紙寬高的比例（中心點），大小是圖紙寬的比例。
// 機殼上零件裝在哪裡（滑過零件時那一塊亮起來）也是示意，不是實際尺寸。這裡只有資料，不碰 React。
import { APPLIANCES, BASE_II_SPECS } from './setupGear';

/** 零件線稿（public/illustrations/setup/<零件 id>.webp）；機殼另外放大一張 */
export const partArt = (id: string) => `/illustrations/setup/${id}.webp`;

/**
 * 機殼上零件的範圍（相對機殼線稿的比例）。
 * 看得到的零件用多邊形（Poly）框住，滑過時把範圍裡的線稿本身染成琥珀色；
 * 看不到的（實心側板的 P10C、老家那台、Model 5 藏在背艙的電源）用方框（Box），在那個位置用虛線畫出形狀（透視）
 */
export type Poly = [number, number][];
/** [中心 x, 中心 y, 寬, 高, 畫成什麼形狀] */
export type Box = [number, number, number, number, ShapeKind];
export type ShapeKind = 'tower' | 'chip' | 'ram' | 'board' | 'gpu' | 'stick' | 'card' | 'psu' | 'hdd' | 'case';

export const isPoly = (at: Poly | Box): at is Poly => Array.isArray(at[0]);

/**
 * Model 5 的線稿是照官方產品照描的（玻璃側板朝左前方）：上面一排三顆風扇是水冷排，
 * 中間那個公仔站在置物板上，置物板底下橫著的是顯卡，置物板左上方亮著的方塊是水冷頭（CPU 在它底下），
 * 水冷管旁邊幾條是記憶體，主機板貼在後面那面牆、擴充槽在左下。電源在主機板後面的背艙，這個角度看不到
 */
export const MODEL5_AT: Record<string, Poly | Box> = {
  radiator: [
    [0.1, 0.41],
    [0.33, 0.22],
    [0.47, 0.17],
    [0.73, 0.18],
    [0.73, 0.27],
    [0.5, 0.35],
    [0.33, 0.44],
    [0.12, 0.46],
  ],
  cpu: [
    [0.33, 0.49],
    [0.44, 0.48],
    [0.45, 0.6],
    [0.33, 0.61],
  ],
  ram: [
    [0.425, 0.41],
    [0.48, 0.41],
    [0.48, 0.5],
    [0.425, 0.5],
  ],
  board: [
    [0.3, 0.38],
    [0.62, 0.36],
    [0.62, 0.88],
    [0.15, 0.88],
    [0.15, 0.77],
    [0.3, 0.62],
  ],
  gpu: [
    [0.19, 0.65],
    [0.29, 0.6],
    [0.6, 0.6],
    [0.6, 0.74],
    [0.3, 0.76],
    [0.19, 0.76],
  ],
  m2a: [
    [0.44, 0.785],
    [0.58, 0.785],
    [0.58, 0.83],
    [0.44, 0.83],
  ],
  m2b: [
    [0.44, 0.835],
    [0.58, 0.835],
    [0.58, 0.88],
    [0.44, 0.88],
  ],
  psu: [0.42, 0.84, 0.3, 0.09, 'psu'],
};

export const P10C_AT: Record<string, Box> = {
  tower: [0.8, 0.3, 0.16, 0.18, 'tower'],
  cpu: [0.8, 0.3, 0.07, 0.06, 'chip'],
  ram: [0.89, 0.3, 0.04, 0.14, 'ram'],
  board: [0.8, 0.42, 0.3, 0.38, 'board'],
  gpu: [0.8, 0.56, 0.3, 0.08, 'gpu'],
  m2a: [0.8, 0.47, 0.14, 0.025, 'stick'],
  pcie2: [0.78, 0.64, 0.22, 0.035, 'card'],
  psu: [0.8, 0.88, 0.3, 0.1, 'psu'],
  cage: [0.72, 0.74, 0.14, 0.12, 'hdd'],
};

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

/** 圖紙上的一個零件：[零件 id, 中心 x, 中心 y, 寬, 機殼上的哪一塊] */
export type Placed = [string, number, number, number, string?];

interface CaseArt {
  /** MODEL5_AT 或 P10C_AT */
  key: 'model5' | 'p10c';
  /** setupGear 裡機殼那一項的 id（名字與規格從那裡拿） */
  id: string;
  /** 機殼線稿的寬（圖紙寬的比例） */
  w: number;
}

export type Sheet =
  | { no: number; key: string; title: string; kind: 'memory' }
  | { no: number; key: string; title: string; kind: 'build'; case: CaseArt; parts: Placed[] }
  | { no: number; key: string; title: string; kind: 'net' }
  | { no: number; key: string; title: string; kind: 'smart' }
  | { no: number; key: string; title: string; kind: 'free'; parts: Placed[]; others: string[] };

/** 老家那張放最前面，編號是 0：跟作品頁的 VoltiCar 一樣，是起點 */
export const SHEETS: Sheet[] = [
  { no: 0, key: 'base-ii', title: 'BASE II', kind: 'memory' },
  {
    no: 1,
    key: 'main-rig',
    title: 'THE WHITE BUILD',
    kind: 'build',
    case: { key: 'model5', id: 'model-5', w: 0.3 },
    parts: [
      ['rtx-4070ti-super', 0.12, 0.12, 0.15, 'gpu'],
      ['ryzen-9900x', 0.1, 0.36, 0.08, 'cpu'],
      ['crucial-t500', 0.12, 0.56, 0.12, 'm2a'],
      ['kioxia-exceria', 0.12, 0.72, 0.12, 'm2b'],
      ['eskimo-360', 0.88, 0.1, 0.15, 'radiator'],
      ['xpg-lancer', 0.89, 0.3, 0.12, 'ram'],
      ['b650-a', 0.89, 0.48, 0.08, 'board'],
      ['leadex-vii', 0.88, 0.68, 0.09, 'psu'],
    ],
  },
  {
    no: 2,
    key: 'server',
    title: 'HOME SERVER',
    kind: 'build',
    case: { key: 'p10c', id: 'p10c', w: 0.24 },
    parts: [
      ['rtx-5060ti', 0.12, 0.08, 0.14, 'gpu'],
      ['ryzen-8700g', 0.1, 0.27, 0.08, 'cpu'],
      ['gm7000', 0.12, 0.44, 0.12, 'm2a'],
      ['nanokvm-pcie', 0.12, 0.6, 0.1, 'pcie2'],
      ['prime-tx', 0.12, 0.77, 0.08, 'psu'],
      ['phantom-spirit', 0.88, 0.09, 0.1, 'tower'],
      ['fury-beast', 0.89, 0.3, 0.12, 'ram'],
      ['x870e-tomahawk', 0.89, 0.48, 0.08, 'board'],
      ['hc550', 0.88, 0.67, 0.07, 'cage'],
    ],
  },
  { no: 3, key: 'network', title: 'NETWORK', kind: 'net' },
  { no: 4, key: 'smart-home', title: 'SMART HOME', kind: 'smart' },
  {
    no: 5,
    key: 'peripherals',
    title: 'PERIPHERALS',
    kind: 'free',
    parts: [
      ['xg27acs', 0.27, 0.36, 0.27],
      ['mv7-plus', 0.56, 0.26, 0.08],
      ['mx-board-31s', 0.6, 0.7, 0.31],
      ['g502-x', 0.84, 0.36, 0.08],
    ],
    // 沒畫成線稿的其他周邊：列在圖紙角落
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
    { id: 'nanokvm-pcie', x: 0.12, y: 0.8, w: 0.07, name: 'NanoKVM', sub: 'PCIe IP-KVM' },
    { name: 'The White Build', x: 0.36, y: 0.48, sub: 'rig' },
    { id: 'pixel-8-pro', x: 0.33, y: 0.72, w: 0.03, name: 'Pixel 8 Pro' },
    { id: 'blade-14', x: 0.41, y: 0.72, w: 0.07, name: 'Blade 14' },
    { id: 'google-tv-streamer', x: 0.58, y: 0.46, w: 0.07, sub: 'matterHub' },
    { id: 'tapo-d230s1', x: 0.58, y: 0.74, w: 0.06, name: 'Tapo H200', sub: 'doorbellHub', end: ['doorbell', 'Wi-Fi'] },
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

/** 零件線稿旁邊的小標（GPU、CPU⋯）：型號的類別，不翻 */
export const PART_TAG: Record<string, string> = {
  'rtx-4070ti-super': 'GPU',
  'ryzen-9900x': 'CPU',
  'model-5': 'CASE',
  'eskimo-360': 'COOLER',
  'xpg-lancer': 'MEMORY',
  xg27acs: 'DISPLAY',
  'mx-board-31s': 'KEYBOARD',
  'g502-x': 'MOUSE',
  'mv7-plus': 'MIC',
  'b650-a': 'BOARD',
  'leadex-vii': 'PSU',
  'crucial-t500': 'SSD',
  'kioxia-exceria': 'SSD',
  'rtx-5060ti': 'GPU',
  'ryzen-8700g': 'CPU',
  'x870e-tomahawk': 'BOARD',
  'fury-beast': 'MEMORY',
  'phantom-spirit': 'COOLER',
  'prime-tx': 'PSU',
  p10c: 'CASE',
  gm7000: 'SSD',
  hc550: 'HDD',
  'nanokvm-pcie': 'KVM',
  'zenwifi-bd5': 'ROUTER',
  'qg-u1050': 'SWITCH',
};

/** 智慧家庭的訊號流程：Home Assistant 發出去，經過各個中樞，最後到家裡的哪一樣東西 */
export const SMART = {
  hubs: [
    { id: 'google-tv-streamer', y: 0.16, w: 0.07, via: 'Matter', to: 'voice' },
    { id: 'switchbot-hub3', y: 0.35, w: 0.05, via: 'Matter', to: 'climate' },
    { id: 'rm4-pro', y: 0.54, w: 0.05, via: 'IR', to: 'ac' },
    { id: 'esp32-cc1101', y: 0.72, w: 0.06, via: '433MHz', to: 'light' },
    { id: 'tapo-d230s1', y: 0.9, w: 0.05, via: 'Wi-Fi', to: 'door' },
  ],
  others: APPLIANCES,
} as const;
