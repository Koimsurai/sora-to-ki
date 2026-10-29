import { useEffect, useState } from 'react';
import { onTheme } from '@/lib/theme';
import { saturnRingOnScreen } from '@/lib/saturnSpec';
import { currentFold } from '@/lib/viewportFold';
import { absNow, latestSaturnGrow, subscribeSatellites } from '@/store/homeOrbit';
import './ThemeSwitchDot.css';

/** 點在換主題之後多久開始淡入：舊的主星還在收（lib/starfieldGpu 的收約 0.5 秒），兩個疊在一起交棒 */
const SHOW_AFTER_MS = 220;
/** 新的主星長到幾成，點就交棒淡掉 */
const HANDOFF_AT = 0.15;
/** 一直等不到新的主星長出來（3D 掉了之類）就自己收掉 */
const GIVE_UP_MS = 4000;

/** 3D 的主星此刻在不在畫面上：首頁、3D 在跑，衛星位置剛報過 */
function planetOnScreen() {
  let at = 0;
  subscribeSatellites((_, t) => {
    at = t;
  })();
  return absNow() - at < 500;
}

/**
 * 頁面開著時換主題（lib/theme 的 setTheme），首頁的主星先收成一點、再長成新的那顆（lib/starfieldGpu）。
 * 新的那顆第一次畫要先編譯，會空掉半秒左右；這段時間主星的位置上亮著一顆訊號色的點在呼吸，
 * 新的主星從它長出來時才淡掉。跟開場「點長成星球」是同一個動作
 */
export default function ThemeSwitchDot() {
  const [dot, setDot] = useState<{ x: number; y: number; on: boolean } | null>(null);
  useEffect(() => {
    let raf = 0;
    let timer = 0;
    const off = onTheme(() => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      if (!planetOnScreen()) return;
      const since = performance.now();
      timer = window.setTimeout(() => {
        const c = saturnRingOnScreen(window.innerWidth, window.innerHeight, currentFold());
        setDot({ x: c.x, y: c.y, on: true });
        const watch = () => {
          const g = latestSaturnGrow();
          const grown = g && g.at > since + SHOW_AFTER_MS && g.planet >= HANDOFF_AT;
          if (grown || performance.now() - since > GIVE_UP_MS) {
            setDot((d) => (d ? { ...d, on: false } : d));
            return;
          }
          raf = window.requestAnimationFrame(watch);
        };
        raf = window.requestAnimationFrame(watch);
      }, SHOW_AFTER_MS);
    });
    return () => {
      off();
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, []);
  if (!dot) return null;
  return (
    <i
      className="theme-switch-dot"
      data-on={dot.on ? '' : undefined}
      aria-hidden="true"
      style={{ left: dot.x, top: dot.y }}
      onTransitionEnd={() => {
        if (!dot.on) setDot(null);
      }}
    />
  );
}
