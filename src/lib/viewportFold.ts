// 摺疊機摺起來時的兩半（Viewport Segments API）。
//
// 攤平時 window.viewport.segments 只有一段（或沒有這個 API），這裡回 null，版面照 viewportShape 的尺寸判斷。
// 摺起來時回報兩段：書本式（內螢幕橫拿）摺痕是直的、左右兩半；筆電式（內螢幕直拿）摺痕是橫的、上下兩半。
// Safari 27.1 藏在功能旗標後面，Android 摺疊機的 Chromium 是開著的；DevTools 選摺疊裝置也模擬得出來。
// 純函式加一個訂閱，不碰 React；畫布在 worker 裡，所以兩半用普通物件傳，不傳 DOMRect。

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** book：摺痕直的，first 是左半；laptop：摺痕橫的，first 是上半 */
export interface Fold {
  pose: 'book' | 'laptop';
  first: Box;
  second: Box;
}

const box = (r: Box): Box => ({ x: r.x, y: r.y, width: r.width, height: r.height });

/** 只認剛好兩段的情況：三段以上的裝置還沒有，不猜 */
export function foldOf(segments: readonly Box[] | null | undefined): Fold | null {
  if (segments?.length !== 2) return null;
  const [a, b] = segments;
  if (Math.abs(a.y - b.y) < 1) {
    const [l, r] = a.x <= b.x ? [a, b] : [b, a];
    return { pose: 'book', first: box(l), second: box(r) };
  }
  const [t, d] = a.y <= b.y ? [a, b] : [b, a];
  return { pose: 'laptop', first: box(t), second: box(d) };
}

export function currentFold(): Fold | null {
  if (typeof window === 'undefined') return null;
  const viewport = (window as { viewport?: { segments?: readonly Box[] | null } }).viewport;
  return foldOf(viewport?.segments);
}

/** 摺痕的中心線（CSS 像素）：書本式是 x，筆電式是 y */
export const creaseAt = (fold: Fold) =>
  fold.pose === 'book'
    ? (fold.first.x + fold.first.width + fold.second.x) / 2
    : (fold.first.y + fold.first.height + fold.second.y) / 2;

/** 一點若落在摺痕附近，挪到它那一半的中間（琥珀點永遠不停在摺痕上） */
export function offCrease<P extends { x: number; y: number }>(p: P, fold: Fold | null, margin = 24): P {
  if (!fold) return p;
  const at = creaseAt(fold);
  if (fold.pose === 'book') {
    if (Math.abs(p.x - at) > margin) return p;
    const half = p.x < at ? fold.first : fold.second;
    return { ...p, x: half.x + half.width / 2 };
  }
  if (Math.abs(p.y - at) > margin) return p;
  const half = p.y < at ? fold.first : fold.second;
  return { ...p, y: half.y + half.height / 2 };
}

const QUERIES = ['(horizontal-viewport-segments: 2)', '(vertical-viewport-segments: 2)'];
/** SSR 沒有 window，沒有東西可以退訂 */
const noop = () => undefined;

/** 摺起來或攤開時通知（resize 不一定會發，兩個 media query 都聽） */
export function subscribeFold(onChange: () => void): () => void {
  if (typeof window === 'undefined') return noop;
  const lists = QUERIES.map((q) => window.matchMedia(q));
  for (const l of lists) l.addEventListener('change', onChange);
  window.addEventListener('resize', onChange);
  return () => {
    for (const l of lists) l.removeEventListener('change', onChange);
    window.removeEventListener('resize', onChange);
  };
}
