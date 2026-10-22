// 有自己天空的頁面（首頁、手記…）配合換頁飛行的進退場。
//
//   進場：飛過來的話，等鏡頭快抵達才出現——在 page 元素上掛 .is-arriving，並把
//         「離鏡頭快抵達還有多久」寫進 --arrive-delay，各頁的 CSS 自己決定怎麼出現。
//         直接打開這一頁（沒有飛行）就照常出場。
//   退場：卸載的那一刻把整頁複製一份蓋在原地，播一段退場動畫再拿掉——
//         不然換頁時內容是瞬間消失的，跟還在飛的鏡頭對不上。
import { useLayoutEffect, type RefObject } from 'react';
import { flightElapsed } from '@/lib/skyFlight';

export interface SkyPageOptions {
  /** 這一頁的天空（lib/starfieldGpu 的 SkyMode） */
  sky: string;
  /** 頁面真的畫出來了（資料載完）：之前沒有東西可以動 */
  ready: boolean;
  /** 鏡頭飛到一半的哪個時間點，內容開始出現（ms） */
  arriveAt: number;
  /** 退場的動畫（套在蓋在原地的那一份複製上）。跟 stillHere 一樣要傳穩定的值（模組層的常數） */
  leave: { keyframes: Keyframe[]; options: KeyframeAnimationOptions };
  /** 現在的網址還是不是這一頁：開發模式的 StrictMode 會在原地卸載再掛回來，那不是真的離開 */
  stillHere: () => boolean;
}

export function useSkyPage(pageRef: RefObject<HTMLElement | null>, opts: SkyPageOptions) {
  const { sky, ready, arriveAt, leave, stillHere } = opts;
  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el || !ready) return;
    const elapsed = flightElapsed(sky);
    if (elapsed !== null) {
      el.classList.add('is-arriving');
      el.style.setProperty('--arrive-delay', `${Math.max(0, arriveAt - elapsed)}ms`);
    }
    return () => {
      if (stillHere()) return;
      const r = el.getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.className = 'sky-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      const clone = el.cloneNode(true) as HTMLElement;
      clone.classList.remove('is-arriving');
      // 複製出來的節點會把進場動畫從頭再播一次
      for (const n of [clone, ...clone.querySelectorAll<HTMLElement>('*')]) n.style.animation = 'none';
      // cloneNode 不會複製 canvas 畫好的內容，要自己抄一份
      const sources = el.querySelectorAll('canvas');
      clone.querySelectorAll('canvas').forEach((dst, i) => {
        const src = sources[i];
        dst.width = src.width;
        dst.height = src.height;
        dst.getContext('2d')?.drawImage(src, 0, 0);
      });
      Object.assign(clone.style, {
        position: 'absolute',
        top: `${r.top}px`,
        left: `${r.left}px`,
        width: `${r.width}px`,
        margin: '0',
      });
      ghost.append(clone);
      document.body.append(ghost);
      const anim = ghost.animate(leave.keyframes, { fill: 'forwards', ...leave.options });
      anim.onfinish = () => ghost.remove();
    };
  }, [pageRef, ready, sky, arriveAt, leave, stillHere]);
}
