import { useEffect, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { currentTheme, setTheme, setThemeDirector, type Theme } from '@/lib/theme';
import { PLANETS, saturnRingOnScreen } from '@/lib/saturnSpec';
import { currentFold } from '@/lib/viewportFold';
import { absNow, latestSaturnGrow, subscribeSatellites } from '@/store/homeOrbit';
import { arriveFrom } from '@/store/pageTransition';
import { borrowSky, showcase, showcaseReady, skyBorrowable } from '@/store/themeShowcase';
import './ThemeSwitchDot.css';

/** 舊的主星收成一點要多久（lib/starfieldGpu 的收約 0.5 秒）；點在收到一半時亮起來，跟它交棒 */
const PLANET_CLOSE_MS = 550;
const DOT_IN_MS = 300;
/**
 * 點換了色之後多久，新的主星開始長。參宿四那一點先像超新星一樣閃一下（ThemeSwitchDot.css 的 data-nova，0.7 秒）：
 * 等閃光退完才長，不然主星長在那團光底下會被整片染色，點交棒時光一收、星球看起來就閃一下
 */
const RECOLOR_MS = 180;
const NOVA_MS = 700;
/** 新的主星長到幾成，點就交棒淡掉 */
const HANDOFF_AT = 0.15;
/** 一直等不到新的主星長出來（3D 掉了之類）就自己收掉 */
const GIVE_UP_MS = 4000;
/** 首頁以外：這一頁收進點要多久、新的主星長完之後停多久 */
const PAGE_CLOSE_MS = 320;
const HOLD_MS = 500;
const PAGE_OPEN_MS = 480;

/**
 * 首頁以外，新的主星出場一次要兩三秒：讀者通常會連換幾個比較，每次都等就煩了。
 * 這一次瀏覽（分頁）裡只完整演第一次，之後換色完點直接沿著頁面的線接回去
 */
const SHOWN_KEY = 'koim-theme-showcased';
const showcasedBefore = () => {
  try {
    return sessionStorage.getItem(SHOWN_KEY) === '1';
  } catch {
    return false;
  }
};
const markShowcased = () => {
  try {
    sessionStorage.setItem(SHOWN_KEY, '1');
  } catch {
    // 存不了就每次都完整演，不影響換主題本身
  }
};

const easeIn = (t: number) => t * t * t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;

interface Pt {
  x: number;
  y: number;
}

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
function clipPage(main: HTMLElement, c: Pt, r: number) {
  const box = main.getBoundingClientRect();
  main.style.clipPath = `circle(${r.toFixed(1)}px at ${(c.x - box.left).toFixed(1)}px ${(c.y - box.top).toFixed(1)}px)`;
}

const coverRadius = (c: Pt) =>
  Math.hypot(Math.max(c.x, window.innerWidth - c.x), Math.max(c.y, window.innerHeight - c.y));

/** 燈暗下來（星空淡出，html[data-stage]，backdrop/StarfieldGpu 與 CSSStarfield.css）／亮回來 */
const lights = (on: boolean) => {
  if (on) delete document.documentElement.dataset.stage;
  else document.documentElement.dataset.stage = '';
};

/**
 * 換主題的導演（lib/theme 的 requestTheme 交給它）：舊的先收、收完那一刻才換色、新的主星再從那一點長出來。
 * 換場的那幾秒燈暗下來，新的主星背後一圈主題色的光。
 *
 * 首頁：舊的主星收成一點（store/themeShowcase 的 collapse）→ 點在主星的位置亮起來 → 收完了才 setTheme
 * （點換色；參宿四是超新星那一閃）→ 新的主星從點裡長出來（lib/starfieldGpu），點交棒淡掉、光亮起來。
 *
 * 其他頁：這一頁收進畫面中央的一點 → 點換色 → 新的主星從點長出來（show）→ 停一下 → 收回成點（hide）→
 * 點從中央沿著這一頁的線接回去，這一頁原地淡回來（store/pageTransition 的 arriveFrom，quiet）。
 * 主星出場在同一次瀏覽裡只演第一次（showcasedBefore），之後換完色就直接接回去。
 * 點一下、按 Esc、換頁都直接收尾。
 *
 * 同一時間只演一趟：還沒換色前又選了別的，直接把目標換掉；已經換色了才選，排在這一趟之後接著演。
 * 手機在首頁以外平常沒有 3D，第一次出場時借回來（store/themeShowcase 的 borrowSky）。
 * 要求減少動態、或沒有 3D：直接換，只有顏色淡入
 */
export default function ThemeSwitchDot() {
  const [dot, setDot] = useState<{ x: number; y: number; on: boolean; nova: boolean } | null>(null);
  /** 新的主星背後那圈光：位置、半徑（px）、亮著沒 */
  const [glow, setGlow] = useState<{ x: number; y: number; r: number; on: boolean } | null>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // 關掉的點與光淡出之後拿掉。不能只靠 transitionend：關掉時本來就透明（快速切換時會發生）就沒有淡出、事件不會來
  const dotOff = dot !== null && !dot.on;
  const glowOffNow = glow !== null && !glow.on;
  useEffect(() => {
    if (!dotOff) return;
    const t = window.setTimeout(() => setDot((d) => (d && !d.on ? null : d)), 450);
    return () => window.clearTimeout(t);
  }, [dotOff]);
  useEffect(() => {
    if (!glowOffNow) return;
    const t = window.setTimeout(() => setGlow((g) => (g && !g.on ? null : g)), 900);
    return () => window.clearTimeout(t);
  }, [glowOffNow]);

  useEffect(() => {
    let raf = 0;
    /** 排著的計時器：同時可能有好幾個（收回成點的同時排了點亮起來），收尾時全部清掉 */
    const timers = new Set<number>();
    let alive = true;
    /** 這一趟要換成哪個（還沒換色前可以被換掉）、換過色了沒、演完之後接著要演的 */
    let target: Theme | null = null;
    let recolored = false;
    let queued: Theme | null = null;
    /** 現在這一趟被打斷時的收尾；沒在演是 null */
    let stop: (() => void) | null = null;

    const center = (): Pt => {
      const c = saturnRingOnScreen(window.innerWidth, window.innerHeight, currentFold());
      return { x: c.x, y: c.y };
    };
    const later = (ms: number, fn: () => void) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (alive) fn();
      }, ms);
      timers.add(id);
    };
    const clearTimers = () => {
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
    };
    /** 主星背後那圈光：先以暗的狀態掛上，下一幀才亮——一掛上就是亮的話沒有淡入的起點，光會直接跳出來 */
    const glowOn = (c: Pt, theme: Theme) => {
      const ring = saturnRingOnScreen(window.innerWidth, window.innerHeight, currentFold(), PLANETS[theme].ring.outer);
      setGlow({ ...c, r: ring.r * 1.35, on: false });
      raf = window.requestAnimationFrame(() => {
        raf = window.requestAnimationFrame(() => setGlow((g) => (g ? { ...g, on: true } : g)));
      });
    };
    const glowOff = () => setGlow((g) => (g ? { ...g, on: false } : g));

    /** 一趟演完：燈亮回來；有排隊的就接著演 */
    const done = () => {
      lights(true);
      borrowSky(false);
      stop = null;
      target = null;
      const next = queued;
      queued = null;
      if (next && next !== currentTheme()) start(next);
    };

    /** 等新的主星長到交棒的那一成（或等太久），點淡掉、光亮起來 */
    const handoffWhenGrown = (c: Pt, theme: Theme, since: number, then: () => void) => {
      const watch = () => {
        if (!alive) return;
        const g = latestSaturnGrow();
        if ((g && g.at > since && g.planet >= HANDOFF_AT) || performance.now() - since > GIVE_UP_MS) {
          setDot((d) => (d ? { ...d, on: false } : d));
          glowOn(c, theme);
          then();
          return;
        }
        raf = window.requestAnimationFrame(watch);
      };
      raf = window.requestAnimationFrame(watch);
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
    /** 收完了：照「現在的目標」換色（點換色、參宿四先閃一下），閃光退完才讓新的主星長 */
    const recolor = (c: Pt, grow: (theme: Theme) => void) => {
      const theme = target ?? currentTheme();
      recolored = true;
      setTheme(theme);
      const nova = theme === 'betelgeuse';
      setDot({ ...c, on: true, nova });
      later(nova ? NOVA_MS : RECOLOR_MS, () => grow(theme));
    };

    const onHome = () => {
      const c = center();
      stop = () => {
        window.cancelAnimationFrame(raf);
        clearTimers();
        const want = queued ?? target;
        queued = null;
        if (want && want !== currentTheme()) setTheme(want);
        setDot(null);
        setGlow(null);
        done();
      };
      lights(false);
      showcase('collapse');
      later(DOT_IN_MS, () => {
        setDot({ ...c, on: true, nova: false });
        later(PLANET_CLOSE_MS - DOT_IN_MS, () =>
          // 收完了：換色，3D 收到新主題就換星、從點長出來（lib/starfieldGpu 的 setTheme）。長完停一下，光淡掉、燈亮回來
          recolor(c, (theme) => {
            const since = performance.now();
            handoffWhenGrown(c, theme, since, () =>
              afterGrown(since, () =>
                later(HOLD_MS, () => {
                  glowOff();
                  done();
                }),
              ),
            );
          }),
        );
      });
    };

    const elsewhere = () => {
      const main = mainOf();
      if (!main) {
        if (target) setTheme(target);
        done();
        return;
      }
      const c = center();
      const reach = coverRadius(c);
      const listening = new AbortController();
      const tween = (ms: number, step: (k: number) => void, finish: () => void) => {
        const t0 = performance.now();
        const frame = (now: number) => {
          if (!alive) return;
          const k = Math.min(1, (now - t0) / ms);
          step(k);
          if (k < 1) raf = window.requestAnimationFrame(frame);
          else finish();
        };
        raf = window.requestAnimationFrame(frame);
      };
      // 被打斷：主題照樣換好（排隊的優先）、主星藏起來、這一頁回來
      const interrupt = () => {
        listening.abort();
        window.cancelAnimationFrame(raf);
        clearTimers();
        const want = queued ?? target;
        queued = null;
        if (want && want !== currentTheme()) setTheme(want);
        showcase('abort');
        setDot(null);
        setGlow(null);
        main.style.clipPath = '';
        done();
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

      // 4. 收回成點之後：點直直飛回這一頁的錨點、這一頁原地淡回來。轉場沒接（沒載到、已有一趟在跑）就從點撐開回來
      const comeBack = () => {
        listening.abort();
        if (arriveFrom(c, { quiet: true })) {
          setDot(null);
          done();
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
            done();
          },
        );
      };
      // 1. 燈暗下來，這一頁收進中央那一點（舊的顏色），點亮起來
      lights(false);
      tween(
        PAGE_CLOSE_MS,
        (k) => {
          clipPage(main, c, reach * (1 - easeIn(k)));
          if (k > 0.6) setDot((d) => d ?? { ...c, on: true, nova: false });
        },
        // 2. 收完了：點換色，新的主星從點長出來；3. 長完停一下，收回成點，光跟著淡掉。
        // 這一次瀏覽已經看過出場了：換完色直接接回去
        () =>
          recolor(c, (theme) => {
            if (showcasedBefore()) {
              comeBack();
              return;
            }
            markShowcased();
            const since = performance.now();
            showcase('show');
            handoffWhenGrown(c, theme, since, () =>
              afterGrown(since, () =>
                later(HOLD_MS, () => {
                  showcase('hide');
                  glowOff();
                  later(DOT_IN_MS, () => setDot({ ...c, on: true, nova: false }));
                  later(PLANET_CLOSE_MS, comeBack);
                }),
              ),
            );
          }),
      );
    };

    const start = (next: Theme) => {
      target = next;
      recolored = false;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setTheme(next);
        done();
      } else if (planetOnScreen()) onHome();
      else if (showcaseReady()) elsewhere();
      else if (skyBorrowable() && !showcasedBefore()) {
        // 手機在首頁以外：3D 借回來演第一次出場。還沒就緒也先開始收這一頁，主星等 3D 好了才長（等不到就照樣接回去）
        borrowSky(true);
        elsewhere();
      } else {
        setTheme(next);
        done();
      }
    };

    setThemeDirector((next) => {
      // 正在演：還沒換色就直接換目標；已經換色了就排到這一趟之後
      if (target !== null) {
        if (!recolored) target = next;
        else queued = next;
        return;
      }
      start(next);
    });
    return () => {
      // 換頁（pathname 變了）或卸載：直接收尾
      setThemeDirector(null);
      stop?.();
      borrowSky(false);
      alive = false;
      window.cancelAnimationFrame(raf);
      clearTimers();
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
      {dot && (
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
      )}
    </>
  );
}
