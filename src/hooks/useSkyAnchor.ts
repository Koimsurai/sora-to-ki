// 讓碎念天空的土星停在某個元素上（store/skyAnchor）：元素的中心是土星的中心，
// 星球半徑是元素寬度的 RADIUS 倍（環伸到半徑的 2.2 倍，剛好收在元素裡）。
// 卸載時送最後一筆視窗座標，土星從離開那一刻在畫面上的位置出發。沒有 3D 星空的話沒有人收。
// 碎念頁頁首的點陣畫布要跟格子對齊，自己量（見 MomentsSky），這裡是給單則頁這種沒有畫布的頁面。
import { useEffect, type RefObject } from 'react';
import { claimSkyAnchor } from '@/store/skyAnchor';

const RADIUS = 0.22;

export function useSkyAnchor(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const anchor = claimSkyAnchor();
    const measure = (fixed: boolean) => {
      const r = el.getBoundingClientRect();
      const sx = fixed ? 0 : window.scrollX;
      const sy = fixed ? 0 : window.scrollY;
      return {
        x: r.left + sx + r.width / 2,
        y: r.top + sy + r.height / 2,
        r: r.width * RADIUS,
        gx: 0,
        gy: fixed ? -window.scrollY : 0,
        fixed,
      };
    };
    const send = () => anchor.set(measure(false));
    const ro = new ResizeObserver(send);
    ro.observe(el);
    window.addEventListener('resize', send);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', send);
      anchor.release(measure(true));
    };
  }, [ref]);
}
