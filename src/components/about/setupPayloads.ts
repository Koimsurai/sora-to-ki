// 設備頁（about/Setup）的圖紙資料：太空梭貨艙裡的四件酬載，加上遠處軌道上的老家那台。
// 零件的名字與規格在 setupGear；這裡只放「畫在哪裡」，座標都是底稿寬高的百分比（0–100）。
// 只有資料，不碰 React，也給 scripts/setup-part-maps.ts 讀（它照 seeds / points 切出每個零件的像素）。
import { BASE_II_SPECS } from './setupGear';

/** 百分比座標 [x, y] */
export type Pt = [number, number];

/**
 * 底稿上一個有編號的零件。
 * at：引線落點；b：編號圈。seeds（多邊形）與 points 是切零件用的種子：
 * 落在種子裡的線就是這個零件，其餘相連的線由腳本沿著線條長出去分給最近的零件（見 scripts/setup-part-maps.ts）。
 * at 本身也是種子
 */
interface Callout {
  id: string;
  at: Pt;
  b: Pt;
  seeds?: Pt[][];
  /** 只認多邊形裡獨立的小碎片（浮起來的鍵帽）：剛好穿過那裡的長線（桌緣）不算 */
  loose?: Pt[][];
  points?: Pt[];
}

/** 網路圖紙上程式畫的連線：有線走等角圖的地面方向（直角），無線是點線 */
interface Link {
  from: Pt;
  to: Pt;
  wired?: boolean;
}

type PayloadKey = 'main-rig' | 'server' | 'network' | 'peripherals';

export interface Payload {
  /** 也是翻譯檔 setup.cat.<key> 與 setup.bay.lede.<key> */
  key: PayloadKey;
  no: number;
  en: string;
  /** 底稿檔名（public/illustrations/setup/<art>.webp）；零件編號圖是 <art>.parts.png */
  art: string;
  /** 底稿的高寬比 */
  ratio: number;
  parts: Callout[];
  /** 零件表裡圖上沒有編號的（備用、換下來的） */
  others?: string[];
  /** 零件表裡標「圖上未繪出」的 */
  unseen?: string[];
  links?: Link[];
  /** 訊號圈的中心（路由器底部） */
  rings?: Pt;
  /** 另外兩張圖紙上的主機：標「見第幾張」 */
  refs?: { at: Pt; sheet: number }[];
  telemetry?: boolean;
  /** 接在這台上的智慧家庭裝置（setupGear 的 id）與寫到它的文章 id */
  devices?: { id: string; posts: number[] }[];
  /** 跟這台有關的紀錄（文章 id） */
  records?: number[];
}

export const PAYLOADS: Payload[] = [
  {
    key: 'main-rig',
    no: 1,
    en: 'THE WHITE BUILD',
    art: 'sheet-white-build',
    ratio: 1251 / 1500,
    parts: [
      {
        id: 'rtx-4070ti-super',
        at: [31, 80],
        b: [9, 90],
        seeds: [
          [
            [18, 69],
            [22.5, 66],
            [44.5, 77],
            [44.5, 91],
            [43, 92.5],
            [21, 84.5],
            [18, 80],
          ],
        ],
      },
      {
        id: 'ryzen-9900x',
        at: [50.3, 44.7],
        b: [59, 36],
        seeds: [
          [
            [47, 44.6],
            [50.3, 42.6],
            [53.6, 44.6],
            [50.3, 46.8],
          ],
        ],
      },
      {
        id: 'eskimo-360',
        at: [53, 13],
        b: [78, 7],
        seeds: [
          [
            [36.5, 6.5],
            [44.5, 1.5],
            [70, 17.5],
            [69.5, 23],
            [60.5, 26.5],
            [36.5, 10.5],
          ],
          [
            [36.5, 10],
            [41, 11],
            [46.5, 33],
            [53.5, 33.5],
            [53.5, 41.5],
            [46, 41.5],
            [44.5, 35],
            [36.5, 16],
          ],
        ],
      },
      {
        id: 'xpg-lancer',
        at: [60, 48],
        b: [81, 35],
        seeds: [
          [
            [53.5, 44.5],
            [56.5, 42],
            [65.5, 47.5],
            [65.5, 53],
            [62, 54.5],
            [53.5, 48],
          ],
        ],
      },
      {
        id: 'b650-a',
        at: [37, 60],
        b: [27, 50],
        seeds: [
          [
            [31, 60.5],
            [39, 50.5],
            [49.5, 47],
            [60, 54],
            [57, 60],
            [45, 71.5],
            [31, 61.5],
          ],
        ],
      },
      {
        id: 'crucial-t500',
        at: [53, 75.2],
        b: [63, 70],
        seeds: [
          [
            [48.5, 73],
            [50, 72],
            [57.5, 76.5],
            [56, 78.5],
          ],
        ],
      },
      {
        id: 'kioxia-exceria',
        at: [49.5, 79.3],
        b: [52, 90],
        seeds: [
          [
            [45, 77],
            [46.5, 76],
            [54, 80.5],
            [52.5, 82.5],
          ],
        ],
      },
      // 左邊界停在機殼右側那條邊之外（x 77.8），進機殼的電源線由電源本體沿線長過去
      {
        id: 'leadex-vii',
        at: [87, 82],
        b: [97, 63],
        seeds: [
          [
            [78.8, 70],
            [84, 70],
            [87.5, 69.5],
            [95, 74],
            [95, 90],
            [86, 95],
            [79, 90.5],
            [79, 76],
          ],
        ],
      },
      {
        id: 'model-5',
        at: [72, 62],
        b: [67, 99],
        points: [
          [77.5, 66],
          [77.5, 71],
        ],
        seeds: [
          [
            [1.5, 27],
            [23.5, 11.5],
            [24.5, 13],
            [24.5, 47],
            [13, 55],
            [13, 73.5],
            [1.5, 66],
          ],
          [
            [28.5, 33],
            [46.5, 20],
            [78, 40.5],
            [77.5, 86],
            [59.5, 98.5],
            [55, 98],
            [28.5, 82],
          ],
        ],
      },
    ],
  },
  {
    key: 'server',
    no: 2,
    en: 'HOME SERVER',
    art: 'sheet-server',
    ratio: 1274 / 1500,
    telemetry: true,
    parts: [
      {
        id: 'phantom-spirit',
        at: [44, 15],
        b: [29, 6],
        seeds: [
          [
            [37.5, 7],
            [43, 1.5],
            [60, 9.5],
            [60, 22.5],
            [50, 30.5],
            [44.5, 29.5],
            [37.5, 20],
          ],
        ],
      },
      {
        id: 'ryzen-8700g',
        at: [49, 55.2],
        b: [60, 36],
        seeds: [
          [
            [46, 55],
            [49, 52.5],
            [52, 55],
            [49, 58],
          ],
        ],
      },
      {
        id: 'fury-beast',
        at: [59, 46],
        b: [81, 34],
        seeds: [
          [
            [53.5, 43],
            [57, 40.5],
            [65, 45],
            [65, 50],
            [62, 52],
            [53.5, 47],
          ],
        ],
      },
      {
        id: 'x870e-tomahawk',
        at: [37, 58],
        b: [27, 48],
        seeds: [
          [
            [31, 58.5],
            [38.5, 52],
            [38.5, 49],
            [50, 45],
            [59, 51],
            [59, 53.5],
            [50, 61],
            [46, 68.5],
            [31, 60],
          ],
        ],
      },
      {
        id: 'rtx-5060ti',
        at: [31, 76],
        b: [8, 76],
        seeds: [
          [
            [18, 67],
            [22, 64],
            [44.5, 74.5],
            [44.5, 89],
            [43, 91],
            [18.5, 80],
          ],
        ],
      },
      {
        id: 'ip-kvm',
        at: [23.5, 89],
        b: [10, 94],
        seeds: [
          [
            [17.5, 83.5],
            [19.5, 82.5],
            [29, 87],
            [29, 95.5],
            [25, 95.5],
            [18.5, 93],
          ],
        ],
      },
      {
        id: 'gm7000',
        at: [53, 72.3],
        b: [62, 66],
        seeds: [
          [
            [48.5, 70],
            [50, 69],
            [57.5, 73.5],
            [56, 75.5],
          ],
        ],
      },
      {
        id: 'hc550',
        at: [73, 93],
        b: [90, 99],
        seeds: [
          [
            [64.5, 90],
            [67, 87.5],
            [81.5, 94],
            [81.5, 96],
            [73.5, 98.5],
            [64.5, 92.5],
          ],
        ],
      },
      {
        id: 'prime-tx',
        at: [87, 79],
        b: [97, 60],
        seeds: [
          [
            [78, 68],
            [84, 67],
            [87.5, 66.5],
            [95, 71],
            [95, 87],
            [86, 92],
            [79, 88],
            [79, 73],
          ],
        ],
      },
      {
        id: 'p10c',
        at: [71, 60],
        b: [63, 99],
        // 機殼頂邊（塔散壓在上面）、前門邊（硬碟貼著它）
        points: [
          [55, 28.2],
          [65, 32.6],
          [75, 37.1],
          [70, 76],
          [70, 84],
        ],
        seeds: [
          [
            [1.5, 25],
            [23.5, 10],
            [24.5, 11],
            [24.5, 52],
            [13, 58],
            [13, 71.5],
            [1.5, 64],
          ],
          [
            [28.5, 31],
            [42.5, 22.5],
            [78, 39],
            [78, 82],
            [68, 88],
            [59, 95],
            [28.5, 77],
          ],
        ],
      },
    ],
    others: ['headless-adaptor'],
    devices: [
      { id: 'google-tv-streamer', posts: [72] },
      { id: 'switchbot-hub3', posts: [] },
      { id: 'rm4-pro', posts: [71] },
      { id: 'esp32-cc1101', posts: [71] },
      { id: 'doorbell', posts: [] },
    ],
    records: [73, 74, 67],
  },
  {
    key: 'network',
    no: 3,
    en: 'NETWORK',
    art: 'sheet-network',
    ratio: 1155 / 1840,
    parts: [
      {
        id: 'zenwifi-bd5',
        at: [50, 30],
        b: [32, 8],
        points: [
          [40, 10],
          [56, 52],
        ],
      },
      { id: 'qg-u1050', at: [24, 74], b: [9, 88], points: [[18, 79]] },
      {
        id: 'blade-14',
        at: [82, 40],
        b: [96, 12],
        points: [
          [80, 25],
          [80, 65],
        ],
      },
      { id: 'pixel-8-pro', at: [76, 86], b: [92, 93], points: [[70, 88]] },
      { id: 'google-tv-streamer', at: [60, 68], b: [50, 93], points: [[56, 70]] },
    ],
    links: [
      { from: [24, 73], to: [53, 53], wired: true },
      { from: [15, 69], to: [21, 75], wired: true },
      { from: [28, 62], to: [26, 72], wired: true },
      { from: [53, 53], to: [80, 62] },
      { from: [53, 53], to: [74, 82] },
      { from: [53, 53], to: [64, 71] },
    ],
    rings: [53, 53],
    refs: [
      { at: [2, 31], sheet: 1 },
      { at: [22, 23], sheet: 2 },
    ],
  },
  {
    key: 'peripherals',
    no: 4,
    en: 'PERIPHERALS',
    art: 'sheet-desk',
    ratio: 1024 / 1096,
    parts: [
      { id: 'xg27acs', at: [45, 12], b: [22, 5], points: [[52, 24]] },
      {
        id: 'mx-board-31s',
        at: [42, 36],
        b: [28, 63],
        points: [
          [34, 33],
          [55, 37],
        ],
        loose: [
          [
            [31, 26],
            [56, 26],
            [56, 32],
            [31, 32],
          ],
        ],
      },
      { id: 'g502-x', at: [59, 40], b: [60, 65] },
      { id: 'mv7-plus', at: [67, 17], b: [62, 3] },
      {
        id: 'psa1-plus',
        at: [86, 22],
        b: [96, 12],
        points: [
          [92, 35],
          [76, 10],
        ],
      },
      { id: 't100', at: [28, 23], b: [9, 16], points: [[66, 31]] },
      {
        id: 'revon-elite',
        at: [85, 64],
        b: [97, 70],
        // 桌面後緣（喇叭、懸臂夾具都貼著它）、桌框、兩邊的腳、控制面板
        points: [
          [5, 32],
          [96, 40],
          [24, 25.2],
          [35, 27.5],
          [55, 31.3],
          [75, 35.1],
          [90, 38],
          [20, 42],
          [84, 53],
          [18, 70],
          [8, 80],
          [30, 70],
          [72, 90],
          [95, 85],
          [67, 48],
        ],
      },
    ],
    unseen: ['infinite-s'],
    others: [
      'g502-hero',
      'mx-board-20s',
      'mk882',
      'alloy-fps',
      'pixel-buds-pro2',
      'cloud-ii',
      'arctis-nova-7',
      'quadcast',
    ],
  },
];

/**
 * 老家那台：遠處軌道上的一顆舊衛星。沒有照片，規格照記憶寫；
 * 編號圈對到衛星線稿的哪個部位是借喻（電源接太陽能板、顯示卡接天線），順序跟 BASE_II_SPECS 一樣
 */
export const BASE = {
  key: 'base-ii' as const,
  no: 0,
  en: 'BASE II',
  calls: [
    [60, 36, 72, 17],
    [50, 42, 47, 19],
    [40, 55, 27, 73],
    [56, 49, 80, 41],
    [68, 60, 87, 76],
    [46, 62, 48, 85],
    [36, 50, 15, 52],
  ] as [number, number, number, number][],
  specs: BASE_II_SPECS,
};

/** 圖紙與零件編號圖的網址 */
export const artSrc = (art: string) => `/illustrations/setup/${art}.webp`;
export const partsSrc = (art: string) => `/illustrations/setup/${art}.parts.png`;
