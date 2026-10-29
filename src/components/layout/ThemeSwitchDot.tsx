import { useEffect, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { onTheme, type Theme } from '@/lib/theme';
import { saturnRingOnScreen } from '@/lib/saturnSpec';
import { currentFold } from '@/lib/viewportFold';
import { absNow, latestSaturnGrow, subscribeSatellites } from '@/store/homeOrbit';
import { showcase, showcaseReady } from '@/store/themeShowcase';
import './ThemeSwitchDot.css';

/** 點在換主題之後多久開始淡入：舊的主星還在收（lib/starfieldGpu 的收約 0.5 秒），兩個疊在一起交棒 */
const SHOW_AFTER_MS = 220;
/** 新的主星長到幾成，點就交棒淡掉 */
const HANDOFF_AT = 0.15;
/** 一直等不到新的主星長出來（3D 掉了之類）就自己收掉 */
const GIVE_UP_MS = 4000;
/** 首頁以外的出場：頁面收進點、新的主星長完之後停多久、收回去要多久、頁面撐開回來 */
const PAGE_CLOSE_MS = 400;
const HOLD_MS = 800;
const PLANET_CLOSE_MS = 550;
const PAGE_OPEN_MS = 480;

const easeIn = (t: number) => t * t * t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** 3D 的主星此刻在不在畫面上：首頁、3D 在跑，衛星位置剛報過 */
function planetOnScreen() {
  let at = 0;
  subscribeSatellites((_, t) => {
    at = t;
  })();
  return absNow() - at < 500;
}

const mainOf = () => document.querySelector<HTMLElement>('.main-content-container > main');

/** 把這一頁剪成以 c 為圓心、半徑 r 的圓（跟換頁轉場的收同一個做法，layout/TransitionLayer） */
function clipPage(main: HTMLElement, c: { x: number; y: number }, r: number) {
  const box = main.getBoundingClientRect();
  main.style.clipPath = `circle(${r.toFixed(1)}px at ${(c.x - box.left).toFixed(1)}px ${(c.y - box.top).toFixed(1)}px)`;
}

const coverRadius = (c: { x: number; y: number }) =>
  Math.hypot(Math.max(c.x, window.innerWidth - c.x), Math.max(c.y, window.innerHeight - c.y));

/**
 * 頁面開著時換主題（lib/theme 的 setTheme）時的那一點。
 *
 * 首頁：主星先收成一點、再長成新的那顆（lib/starfieldGpu）。新的那顆第一次畫要先編譯，會空掉一下；
 * 這段時間主星的位置上亮著一顆訊號色的點在呼吸，新的主星從它長出來時才淡掉。
 *
 * 其他頁：主星平常不在，換了看不出來。所以讓它出場一下：這一頁收進畫面中央的一點（換頁的收法）→
 * 點換成新的顏色在呼吸 → 新的主星從點裡長出來（store/themeShowcase）→ 停一下 → 收回成點 → 這一頁撐開回來。
 * 點一下、按 Esc、換頁都會直接跳到最後。要求減少動態的訪客不演，只有顏色淡入
 *
 * 切到參宿四時那一點先像超新星一樣閃一下（ThemeSwitchDot.css 的 data-nova）
 */
export default function ThemeSwitchDot() {
  const [dot, setDot] = useState<{ x: number; y: number; on: boolean; nova: boolean } | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    let raf = 0;
    let timer = 0;
    /** 現在這一趟出場的收尾（被打斷時呼叫）；沒在出場是 null */
    let stopShowcase: (() => void) | null = null;

    /** 等新的主星長到交棒的那一成，點淡掉 */
    const handoffWhenGrown = (since: number, then?: () => void) => {
      const watch = () => {
        const g = latestSaturnGrow();
        const grown = g && g.at > since && g.planet >= HANDOFF_AT;
        if (grown || performance.now() - since > GIVE_UP_MS) {
          setDot((d) => (d ? { ...d, on: false } : d));
          then?.();
          return;
        }
        raf = window.requestAnimationFrame(watch);
      };
      raf = window.requestAnimationFrame(watch);
    };

    const onHome = (theme: Theme) => {
      const since = performance.now();
      timer = window.setTimeout(() => {
        const c = saturnRingOnScreen(window.innerWidth, window.innerHeight, currentFold());
        setDot({ x: c.x, y: c.y, on: true, nova: theme === 'betelgeuse' });
        handoffWhenGrown(since);
      }, SHOW_AFTER_MS);
    };

    const elsewhere = (theme: Theme) => {
      const main = mainOf();
      if (!main) return;
      const c = saturnRingOnScreen(window.innerWidth, window.innerHeight, currentFold());
      const reach = coverRadius(c);
      let alive = true;
      // 打斷用的兩個監聽器：收尾時一起拿掉
      const listening = new AbortController();
      const tween = (ms: number, step: (k: number) => void, done: () => void) => {
        const t0 = performance.now();
        const frame = (now: number) => {
          if (!alive) return;
          const k = Math.min(1, (now - t0) / ms);
          step(k);
          if (k < 1) raf = window.requestAnimationFrame(frame);
          else done();
        };
        raf = window.requestAnimationFrame(frame);
      };
      const finish = () => {
        alive = false;
        window.cancelAnimationFrame(raf);
        window.clearTimeout(timer);
        main.style.clipPath = '';
        listening.abort();
        stopShowcase = null;
      };
      const interrupt = () => {
        showcase('abort');
        setDot(null);
        finish();
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') interrupt();
      };
      // 4. 收成點之後，這一頁從點撐開回來
      const closePlanet = () => {
        if (!alive) return;
        showcase('hide');
        setDot({ x: c.x, y: c.y, on: true, nova: false });
        timer = window.setTimeout(() => {
          tween(
            PAGE_OPEN_MS,
            (k) => {
              clipPage(main, c, reach * easeOut(k));
              if (k > 0.3) setDot((d) => (d ? { ...d, on: false } : d));
            },
            finish,
          );
        }, PLANET_CLOSE_MS);
      };
      // 3. 長完（星球與環、五條軌道）停一下，收回成點
      const holdThenClose = (since: number) => {
        const wait = () => {
          if (!alive) return;
          const g = latestSaturnGrow();
          if (g && g.at > since && g.ring >= 1) {
            timer = window.setTimeout(closePlanet, HOLD_MS + 700);
            return;
          }
          if (performance.now() - since > GIVE_UP_MS) {
            closePlanet();
            return;
          }
          raf = window.requestAnimationFrame(wait);
        };
        raf = window.requestAnimationFrame(wait);
      };

      window.addEventListener('pointerdown', interrupt, { capture: true, signal: listening.signal });
      window.addEventListener('keydown', onKey, { capture: true, signal: listening.signal });
      stopShowcase = interrupt;
      // 1. 這一頁收進中央那一點，點亮起來
      tween(
        PAGE_CLOSE_MS,
        (k) => {
          clipPage(main, c, reach * (1 - easeIn(k)));
          if (k > 0.6) setDot((d) => d ?? { x: c.x, y: c.y, on: true, nova: theme === 'betelgeuse' });
        },
        () => {
          // 2. 新的主星從點裡長出來
          const since = performance.now();
          showcase('show');
          handoffWhenGrown(since, () => holdThenClose(since));
        },
      );
    };

    const off = onTheme((theme) => {
      stopShowcase?.();
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      if (planetOnScreen()) onHome(theme);
      else if (showcaseReady() && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) elsewhere(theme);
    });
    return () => {
      off();
      // 出場中換頁（pathname 變了）也走這裡：直接收尾
      stopShowcase?.();
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [pathname]);

  if (!dot) return null;
  return (
    <i
      className="theme-switch-dot"
      data-on={dot.on ? '' : undefined}
      data-nova={dot.nova ? '' : undefined}
      aria-hidden="true"
      style={{ left: dot.x, top: dot.y }}
      onTransitionEnd={() => {
        if (!dot.on) setDot(null);
      }}
    />
  );
}
