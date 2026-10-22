// 碎念頁的土星停在哪：頁首那張點陣畫布告訴 3D 星空「土星要停在這裡、格子從這裡開始」，
// 3D 的土星就飛到這個位置、原地碎成同一個格子的像素（見 lib/starfieldGpu 的 perch）。
// 頁面與星空是兩棵不相干的元件樹（星空在 worker 裡），所以走一個模組層的訂閱。

/** 都是頁面座標（CSS 像素，含捲動）：x/y 土星中心、r 星球半徑、gx/gy 點陣格子的原點 */
export interface SkyAnchor {
  x: number;
  y: number;
  r: number;
  gx: number;
  gy: number;
  /**
   * 座標是視窗座標、不跟著捲動。頁首卸載（離開碎念頁）時送的最後一筆是這種：
   * 換頁時捲動會被拉回頂端，土星要從「離開那一刻在畫面上的位置」出發，不能跟著跳
   */
  fixed?: boolean;
}

let current: SkyAnchor | null = null;
let owner: symbol | null = null;
const listeners = new Set<(anchor: SkyAnchor | null) => void>();

const publish = (anchor: SkyAnchor) => {
  current = anchor;
  for (const fn of listeners) fn(anchor);
};

/**
 * 拿到送位置的權利：set 是「土星停在這裡」，release 是卸載時送的最後一筆（視窗座標）。
 * release 只有在還是最後一個拿到權利的人時才算數——新的頁面先掛上、舊的才卸載的情況
 * （例如 hydration 失敗重繪），舊的那筆不能蓋掉新頁面的位置
 */
export const claimSkyAnchor = () => {
  const me = Symbol('sky-anchor');
  owner = me;
  return {
    set(anchor: SkyAnchor) {
      if (owner === me) publish(anchor);
    },
    release(anchor: SkyAnchor) {
      if (owner === me) publish({ ...anchor, fixed: true });
    },
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
