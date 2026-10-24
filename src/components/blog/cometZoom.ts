// 碎念列表點進一則時的交棒：列表頁收的時候往那一則放大，把「放大到哪裡、怎麼放大」留在這裡，
// 單則頁掛上時拿去排同一段彗尾，看起來就是同一個鏡頭繼續看下去。重新整理、從別頁來都沒有。
import type { ZoomSpec } from './comet';

/** 往一則碎念放大幾倍 */
export const COMET_ZOOM = 2.4;
/** 放大進去要多久（毫秒）：轉場最多等頁面收 0.8 秒（layout/TransitionLayer） */
export const ZOOM_MS = 700;

let handoff: (ZoomSpec & { id: string }) | null = null;

export function setCometZoom(spec: ZoomSpec & { id: string }) {
  handoff = spec;
}

/** 這一則的交棒（id 對得上才算）。只讀不清：開發模式的 StrictMode 會把初始化跑兩次 */
export function peekCometZoom(id: string): ZoomSpec | null {
  return handoff?.id === id ? handoff : null;
}

/** 單則頁掛好之後清掉，下一次從別頁進來的就不會拿到舊的 */
export function clearCometZoom() {
  handoff = null;
}

/**
 * 反過來：從單則頁回列表時，列表頁一開始停在放大的那一段（那一則在畫面上的 T），再拉遠回整條彗星。
 * 單則頁收的時候留下「是哪一則、它停在畫面的哪裡」
 */
let back: { id: string; T: { x: number; y: number } } | null = null;

export function setCometZoomOut(spec: { id: string; T: { x: number; y: number } }) {
  back = spec;
}

/** 只讀不清（同上）；列表頁掛好之後用 clearCometZoomOut 清掉 */
export function peekCometZoomOut() {
  return back;
}

export function clearCometZoomOut() {
  back = null;
}
