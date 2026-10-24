// 手機後備星空 —— 純 CSS（兩層 box-shadow 星點 + 緩慢漂移），零 JS 渲染迴圈。
// 取代桌面的 Three.js Canvas，讓手機不必載入 vendor-three。
// 換頁的鏡頭移動時兩層跟著挪（store/skyPan）：遠的那層挪得少。圖是平鋪的，照圖塊大小取餘數就不會露出邊
import { useEffect, useRef } from 'react';
import { subscribeSkyPan } from '@/store/skyPan';
import './CSSStarfield.css';

/** 兩層的圖塊大小（跟 CSSStarfield.css 的 background-size 一樣）與跟著鏡頭挪的比例 */
const FAR = { w: 340, h: 240, depth: 0.6 };
const NEAR = { w: 420, h: 320, depth: 1 };

const wrap = (v: number, m: number) => ((v % m) + m) % m;

export default function CSSStarfield() {
  const farRef = useRef<HTMLDivElement>(null);
  const nearRef = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      subscribeSkyPan(({ x, y }) => {
        for (const [el, l] of [
          [farRef.current, FAR],
          [nearRef.current, NEAR],
        ] as const) {
          if (el) el.style.translate = `${wrap(x * l.depth, l.w).toFixed(1)}px ${wrap(y * l.depth, l.h).toFixed(1)}px`;
        }
      }),
    [],
  );
  return (
    <div className="css-starfield" aria-hidden="true">
      <div className="css-stars css-stars--far" ref={farRef} />
      <div className="css-stars css-stars--near" ref={nearRef} />
    </div>
  );
}
