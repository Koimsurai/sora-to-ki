import { useEffect } from 'react';

/**
 * 這一頁自己畫背景（手記的星軌、關於的下墜）：掛著的時候背景的星星淡出讓位，離開時淡回來。
 * 機制是 html[data-sky="bare"]：3D 的星空（backdrop/StarfieldGpu）與 CSS 的備用星空都看這個屬性
 */
export function useBareSky() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.sky = 'bare';
    return () => {
      delete root.dataset.sky;
    };
  }, []);
}
