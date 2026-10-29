import { useEffect, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { setTheme, setThemeDirector, type Theme } from '@/lib/theme';
import { PLANETS, saturnRingOnScreen } from '@/lib/saturnSpec';
import { currentFold } from '@/lib/viewportFold';
import { absNow, latestSaturnGrow, subscribeSatellites } from '@/store/homeOrbit';
import { arriveFrom } from '@/store/pageTransition';
import { showcase, showcaseReady } from '@/store/themeShowcase';
import './ThemeSwitchDot.css';

/** 舊的主星收成一點要多久（lib/starfieldGpu 的收約 0.5 秒）；點在收到一半時亮起來，跟它交棒 */
const PLANET_CLOSE_MS = 550;
const DOT_IN_MS = 300;
/** 點換了色（參宿四是超新星那一閃）之後多久，新的主星開始長 */
const RECOLOR_MS = 180;
/** 新的主星長到幾成，點就交棒淡掉 */
const HANDOFF_AT = 0.15;
/** 一直等不到新的主星長出來（3D 掉了之類）就自己收掉 */
const GIVE_UP_MS = 4000;
/** 首頁以外：這一頁收進點要多久、新的主星長完之後停多久 */
const PAGE_CLOSE_MS = 320;
const HOLD_MS = 500;
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
 * 換主題的導演（lib/theme 的 requestTheme 交給它）：舊的先收、收完那一刻才換色、新的主星再從那一點長出來。
 *
 * 首頁：舊的主星收成一點（store/themeShowcase 的 collapse）→ 點在主星的位置亮起來 → 收完了才 setTheme
 * （點換色；參宿四是超新星那一閃）→ 新的主星從點裡長出來（lib/starfieldGpu），點交棒淡掉。
 *
 * 其他頁：這一頁收進畫面中央的一點（換頁的收法）→ 點換色 → 新的主星從點長出來（show）→ 停一下 →
 * 收回成點（hide）→ 點從中央飛回這一頁的錨點，這一頁接手自己的進場（store/pageTransition 的 arriveFrom），
 * 跟開場是同一個動作。點一下、按 Esc、換頁都直接收尾。
 *
 * 要求減少動態、或沒有 3D：直接換，只有顏色淡入
 */
export default function ThemeSwitchDot() {
  const [dot, setDot] = useState<{ x: number; y: number; on: boolean; nova: boolean } | null>(null);
  /** 新的主星背後那圈光：位置、半徑（px）、亮著沒 */
  const [glow, setGlow] = useState<{ x: number; y: number; r: number; on: boolean } | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    let raf = 0;
    let timer = 0;
    let alive = true;
    /** 現在這一趟的收尾（被打斷時呼叫）；沒在演是 null */
    let stop: (() => void) | null = null;
    const center = () => {
      const c = saturnRingOnScreen(window.innerWidth, window.innerHeight, currentFold());
      return { x: c.x, y: c.y };
    };
    /** 燈暗下來（星空淡出，html[data-stage]，backdrop/StarfieldGpu 與 CSSStarfield.css）／亮回來 */
    const lights = (on: boolean) => {
      if (on) delete document.documentElement.dataset.stage;
      else document.documentElement.dataset.stage = '';
    };
    /** 主星背後那圈光：大小照新主星的環（環的外緣再大一點） */
    const glowOn = (c: { x: number; y: number }, next: Theme) => {
      const ring = saturnRingOnScreen(window.innerWidth, window.innerHeight, currentFold(), PLANETS[next].ring.outer);
      setGlow({ ...c, r: ring.r * 1.35, on: true });
    };
    const glowOff = () => setGlow((g) => (g ? { ...g, on: false } : g));
    const later = (ms: number, fn: () => void) => {
      timer = window.setTimeout(() => {
        if (alive) fn();
      }, ms);
    };
    /** 等新的主星長到交棒的那一成（或等太久），點淡掉 */
    const handoffWhenGrown = (since: number, then?: () => void) => {
      const watch = () => {
        if (!alive) return;
        const g = latestSaturnGrow();
        if ((g && g.at > since && g.planet >= HANDOFF_AT) || performance.now() - since > GIVE_UP_MS) {
          setDot((d) => (d ? { ...d, on: false } : d));
          then?.();
          return;
        }
        raf = window.requestAnimationFrame(watch);
      };
      raf = window.requestAnimationFrame(watch);
    };
    /** 點換色、新的主星從點裡長出來 */
    const recolor = (c: { x: number; y: number }, next: Theme, grow: () => void) => {
      setTheme(next);
      setDot({ ...c, on: true, nova: next === 'betelgeuse' });
      later(RECOLOR_MS, grow);
    };

    const onHome = (next: Theme) => {
      const c = center();
      stop = () => {
        lights(true);
        glowOff();
        stop = null;
      };
      lights(false);
      showcase('collapse');
      later(DOT_IN_MS, () => {
        setDot({ ...c, on: true, nova: false });
        later(PLANET_CLOSE_MS - DOT_IN_MS, () =>
          // 收完了：換色，3D 收到新主題就換星、從點長出來（lib/starfieldGpu 的 setTheme）。
          // 長完停一下，光淡掉、燈亮回來
          recolor(c, next, () => {
            const since = performance.now();
            // 光等主星真的開始長出來才亮：第一次換到某個主題要先編譯，固定時間亮的話光會比星先出來
            handoffWhenGrown(since, () => {
              glowOn(c, next);
              afterGrown(since, () => later(HOLD_MS, () => stop?.()));
            });
          }),
        );
      });
    };
    /** 等新的主星連環一起長完（或等太久）才往下 */
    const afterGrown = (since: number, then: () => void) => {
      const wait = () => {
        if (!alive) return;
        const g = latestSaturnGrow();
        if ((g && g.at > since && g.ring >= 1) || performance.now() - since > GIVE_UP_MS) {
          then();
          return;
        }
        raf = window.requestAnimationFrame(wait);
      };
      raf = window.requestAnimationFrame(wait);
    };

    const elsewhere = (next: Theme) => {
      const main = mainOf();
      if (!main) {
        setTheme(next);
        return;
      }
      const c = center();
      const reach = coverRadius(c);
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
      const cleanup = () => {
        listening.abort();
        lights(true);
        stop = null;
      };
      // 被打斷：主題照樣換好、主星藏起來、這一頁回來
      const interrupt = () => {
        if (main.style.clipPath) setTheme(next);
        showcase('abort');
        setDot(null);
        setGlow(null);
        main.style.clipPath = '';
        cleanup();
      };
      window.addEventListener('pointerdown', interrupt, { capture: true, signal: listening.signal });
      window.addEventListener(
        'keydown',
        (e) => {
          if (e.key === 'Escape') interrupt();
        },
        { capture: true, signal: listening.signal },
      );
      stop = interrupt;

      // 4. 收回成點之後：點飛回這一頁的錨點、這一頁接手進場。轉場沒接（沒載到、已有一趟在跑）就從點撐開回來
      const comeBack = () => {
        cleanup();
        if (arriveFrom(c, { quiet: true })) {
          setDot(null);
          return;
        }
        tween(
          PAGE_OPEN_MS,
          (k) => {
            clipPage(main, c, reach * easeOut(k));
            if (k > 0.3) setDot((d) => (d ? { ...d, on: false } : d));
          },
          () => {
            main.style.clipPath = '';
          },
        );
      };
      // 3. 長完停一下，收回成點，光跟著淡掉
      const holdThenClose = (since: number) =>
        afterGrown(since, () =>
          later(HOLD_MS, () => {
            showcase('hide');
            glowOff();
            later(DOT_IN_MS, () => setDot({ ...c, on: true, nova: false }));
            later(PLANET_CLOSE_MS, comeBack);
          }),
        );
      // 1. 燈暗下來，這一頁收進中央那一點（舊的顏色），點亮起來
      lights(false);
      tween(
        PAGE_CLOSE_MS,
        (k) => {
          clipPage(main, c, reach * (1 - easeIn(k)));
          if (k > 0.6) setDot((d) => d ?? { ...c, on: true, nova: false });
        },
        // 2. 收完了：點換色，新的主星從點長出來
        () =>
          recolor(c, next, () => {
            const since = performance.now();
            showcase('show');
            handoffWhenGrown(since, () => {
              glowOn(c, next);
              holdThenClose(since);
            });
          }),
      );
    };

    setThemeDirector((next) => {
      stop?.();
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setTheme(next);
      else if (planetOnScreen()) onHome(next);
      else if (showcaseReady()) elsewhere(next);
      else setTheme(next);
    });
    return () => {
      // 換頁（pathname 變了）或卸載：直接收尾
      setThemeDirector(null);
      stop?.();
      alive = false;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return (
    <>
      {glow && (
        <i
          className="theme-switch-glow"
          data-on={glow.on ? '' : undefined}
          aria-hidden="true"
          style={{ left: glow.x, top: glow.y, '--glow-r': `${glow.r.toFixed(1)}px` } as React.CSSProperties}
          onTransitionEnd={(e) => {
            if (e.propertyName === 'opacity' && !glow.on) setGlow(null);
          }}
        />
      )}
      {dot && <Dot dot={dot} setDot={setDot} />}
    </>
  );
}

function Dot({
  dot,
  setDot,
}: {
  dot: { x: number; y: number; on: boolean; nova: boolean };
  setDot: (d: null) => void;
}) {
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
