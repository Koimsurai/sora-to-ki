// 背景星空跟著換頁的鏡頭轉（layout/TransitionLayer 寫，backdrop 的兩種星空讀）。
//
// 換頁時鏡頭追著琥珀點移動，背景的星空也要跟著挪（遠的東西挪得少），看起來才是鏡頭在動。
// 挪過去就留在那裡、不歸位：歸位的那一下會像整片背景被拉回去。所以這裡記的是「累積」的位移，
// 單位是畫面上的像素（正的 x 是星空往右）。WebGPU 的星空把它換成鏡頭轉的角度（球面上的星沒有邊界），
// CSS 的星空是平鋪的圖，照圖塊大小取餘數就不會露出邊。

export interface SkyPan {
  x: number;
  y: number;
}

let pan: SkyPan = { x: 0, y: 0 };
const listeners = new Set<(p: SkyPan) => void>();

export function setSkyPan(x: number, y: number) {
  pan = { x, y };
  for (const fn of listeners) fn(pan);
}

export const skyPan = (): SkyPan => pan;

export function subscribeSkyPan(fn: (p: SkyPan) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
