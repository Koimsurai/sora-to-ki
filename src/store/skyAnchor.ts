// 碎念頁的土星停在哪：頁面那張點陣畫布告訴 3D 星空「土星要停在這裡、格子從這裡開始」，
// 3D 的土星就停到這個位置、碎成同一個格子的像素（見 lib/starfieldGpu 的 perched 與 blink）。
// 頁面與星空是兩棵不相干的元件樹（星空在 worker 裡），所以走一個模組層的訂閱。

/**
 * 視窗座標（CSS 像素）：x/y 土星中心、r 星球半徑、gx/gy 點陣格子的原點。
 * 點陣天空是固定在視窗上的背景，所以不含捲動
 */
export interface SkyAnchor {
  x: number;
  y: number;
  r: number;
  gx: number;
  gy: number;
}

let current: SkyAnchor | null = null;
let owner: symbol | null = null;
const listeners = new Set<(anchor: SkyAnchor | null) => void>();

const publish = (anchor: SkyAnchor) => {
  current = anchor;
  for (const fn of listeners) fn(anchor);
};

/**
 * 拿到送位置的權利。只有最後一個拿到權利的人送的才算數：新的頁面先掛上、舊的才卸載的情況
 * （例如 hydration 失敗重繪），舊的那份畫布不能再改土星的位置
 */
export const claimSkyAnchor = () => {
  const me = Symbol('sky-anchor');
  owner = me;
  return (anchor: SkyAnchor) => {
    if (owner === me) publish(anchor);
  };
};

/** 訂閱的當下先收到一次目前的值 */
export const subscribeSkyAnchor = (fn: (anchor: SkyAnchor | null) => void) => {
  listeners.add(fn);
  fn(current);
  return () => {
    listeners.delete(fn);
  };
};
