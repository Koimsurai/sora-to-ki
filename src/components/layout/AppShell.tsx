import { createElement, lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { ClientOnly, useRouterState } from '@tanstack/react-router';
import { stripLocalePrefix } from '@/i18n/start-i18n';
import SiteNav from './SiteNav';
import ScrollToTop from './ScrollToTop';
import ThemePreviewSwitch from './ThemePreviewSwitch';
import ThemeSwitchDot from './ThemeSwitchDot';
import CSSStarfield from '@/components/backdrop/CSSStarfield';
import { loadSpaceBackdropShell } from '@/components/backdrop/prewarm';
import type * as TransitionLayerModule from './TransitionLayer';
import { landingReferrer } from '@/lib/visitContext';
import { installStaleChunkReload } from '@/lib/staleChunkReload';
import { installRefold } from '@/lib/viewportFold';

// 重新部署後舊分頁載不到新 chunk 時重整一次（lib/staleChunkReload）。要在模組載入時就掛：
// 下面那些 lazy 的 import 在第一次 render 就開始了，等 useEffect 才掛會漏掉
installStaleChunkReload();
// 摺疊機摺起來或攤開時內容淡入（lib/viewportFold）
installRefold();

// 桌面 WebGL 背景/開場 + 互動式 overlay → 純 client(three.js / portal 不進 SSR)
// 3D 背景殼：chunk 與 GPU 探測在主程式一開始就起跑（backdrop/prewarm），越早開始，首頁的土星越早出現。
// 載好就直接掛，不用 React.lazy：Suspense 在內容載好之後還會再等約 300ms 才顯示，首頁的開場要等 3D 的第一幀
let spaceBackdropShell: ComponentType | null = null;
function LoadedSpaceBackdropShell() {
  return spaceBackdropShell ? createElement(spaceBackdropShell) : null;
}
const CommandPalette = lazy(() => import('./CommandPalette'));
const ContextMenu = lazy(() => import('./ContextMenu'));
const SerifFontLoader = lazy(() => import('./SerifFontLoader'));

// 換頁轉場與開場：跟上面的背景殼同一個理由，不用 React.lazy。開場要等它掛上才開始算「等完了沒」，
// 而 React.lazy 的版本要等 React 接手整頁才開始下載、載好之後 Suspense 又再等約 300ms：
// 文章頁實測（跨國網路、中階 CPU）chunk 在 2.9 秒才開始抓，開場程式 4.0 秒才跑。
// 模組一載入就開始下載，React 接手完就能掛。
// ⚠ 後台不先載：後台不演轉場，以前也從來不載這個 chunk，它帶的 CSS 一進後台就改了層疊順序
// （實測後台狀態標籤的顏色被蓋掉）。從後台切回前台時才補下載
const isAdminPath = (path: string) => /^admin(\/|$)/.test(stripLocalePrefix(path));
let transitionLayerChunk: Promise<typeof TransitionLayerModule> | null = null;
const loadTransitionLayer = () => (transitionLayerChunk ??= import('./TransitionLayer'));
if (typeof window !== 'undefined' && !isAdminPath(window.location.pathname)) {
  loadTransitionLayer().catch(() => undefined);
}
let transitionLayer: ComponentType | null = null;
function LoadedTransitionLayer() {
  return transitionLayer ? createElement(transitionLayer) : null;
}

// 全域 app 殼(對齊舊 App.tsx 的 Layout + App 疊法):導覽列 / 背景 / chrome 包住路由內容(children = <Outlet/>)。
// admin 隱藏導覽列/CommandPalette。
export default function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  // Core Web Vitals 上報（B4）：client-only、動態載入（web-vitals 不進關鍵 bundle）
  useEffect(() => {
    void import('@/lib/reportWebVitals').then((m) => m.initWebVitals());
  }, []);

  // 錯誤上報 → 自架 GlitchTip。同樣動態載入（@sentry/react 不進關鍵 bundle）。
  //
  // ⚠️ 掛在 AppShell 而不是更早的位置，代價是**它初始化之前的錯誤抓不到**
  //   （hydration 之前、以及 AppShell 自己 render 失敗的情況）。
  //   要抓那些就得進 SSR 產的 inline script，而那跟 CSP 的 'unsafe-inline' 綁在一起，
  //   等收緊那條時再一起處理。目前的取捨是：不為了少數幾類錯誤把 SDK 提到關鍵路徑上。
  useEffect(() => {
    void import('@/lib/errorReporting').then((m) => m.initErrorReporting());
  }, []);

  // 這次造訪從哪個網站連進來：趁還沒重新整理先記下（lib/visitContext，按愛心時帶給後端）
  useEffect(() => {
    landingReferrer();
  }, []);

  const [backdropLoaded, setBackdropLoaded] = useState(spaceBackdropShell !== null);
  useEffect(() => {
    let alive = true;
    loadSpaceBackdropShell()
      .then((m) => {
        spaceBackdropShell = m.default;
        if (alive) setBackdropLoaded(true);
      })
      // chunk 載不到（剛部署完、舊的 hash 不在了）：留下 CSS 星空
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bare = stripLocalePrefix(pathname); // 去 locale 前綴(無前導斜線)
  const isAdminPage = isAdminPath(pathname);

  const [transitionLoaded, setTransitionLoaded] = useState(transitionLayer !== null);
  useEffect(() => {
    if (isAdminPage || transitionLayer) return;
    let alive = true;
    loadTransitionLayer()
      .then((m) => {
        transitionLayer = m.default;
        if (alive) setTransitionLoaded(true);
      })
      // 載不到：沒有轉場，開場由 head 那段腳本 6 秒後自己收掉（lib/bootRing，同原本 lazy 失敗時）
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [isAdminPage]);

  // 文章內頁（BlogPost）是重 lazy chunk（BlogPost.css + 程式碼高亮 + mermaid，134 KB gzip）。頁面 idle 後
  // 先暖起來——否則首次點進文章會先閃一下 BlogPostPage 極簡 fallback（純 sans-serif 無樣式）
  // 才換成完整版。暖過後 Suspense 立即解析、fallback 不再出現。import 路徑與路由的 lazy
  // 同一支 → Vite dedupe 同 chunk。requestIdleCallback 不搶首屏；Safari 無此 API 退 setTimeout。
  // 只在有文章連結的頁面暖（首頁、文章列表、文章頁）：以前每一頁都下載，/music、/setup 這些
  // 頁面根本點不到文章，手機上白白多吃 134 KB 加一個 64–79ms 的長影格。
  const linksToPosts = bare === '' || bare === 'blog' || bare.startsWith('blog/');
  useEffect(() => {
    if (!linksToPosts) return;
    const warm = () => {
      void import('@/components/blog/BlogPost');
    };
    const ric = (window as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (ric) {
      ric(warm);
      return;
    }
    const warmTimer = setTimeout(warm, 1500);
    return () => clearTimeout(warmTimer);
  }, [linksToPosts]);

  return (
    <div className="App">
      <ScrollToTop />
      {/* CSS 星空底:手機唯一背景;桌面是 3D 載入前的秒出 placeholder。SSR 即出。 */}
      <CSSStarfield />
      <ClientOnly fallback={null}>{backdropLoaded && <LoadedSpaceBackdropShell />}</ClientOnly>

      <div
        className="main-content-container"
        style={{ position: 'relative', zIndex: 10, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        {!isAdminPage && <SiteNav />}
        <main style={{ flex: '1 0 auto' }}>{children}</main>
        {/* 換頁轉場：在內容容器裡、導覽列底下（見 TransitionLayer.css）。後台不演 */}
        {!isAdminPage && transitionLoaded && (
          <ClientOnly fallback={null}>
            <LoadedTransitionLayer />
          </ClientOnly>
        )}
        {!isAdminPage && (
          <ClientOnly fallback={null}>
            <Suspense fallback={null}>
              <CommandPalette />
            </Suspense>
          </ClientOnly>
        )}
      </div>

      {/* 右鍵選單刻意留在容器外：它要能開在任何東西之上，包含全螢幕檢視。後台不掛 */}
      {!isAdminPage && (
        <ClientOnly fallback={null}>
          <Suspense fallback={null}>
            <ContextMenu />
          </Suspense>
        </ClientOnly>
      )}
      {/* 換主題時主星收成的那一點（lib/theme）：只在首頁的 3D 主星在畫面上時出現 */}
      {!isAdminPage && (
        <ClientOnly fallback={null}>
          <ThemeSwitchDot />
        </ClientOnly>
      )}
      {/* 主題預覽的切換：只在 dev 出現（lib/theme） */}
      {import.meta.env.DEV && !isAdminPage && (
        <ClientOnly fallback={null}>
          <ThemePreviewSwitch />
        </ClientOnly>
      )}
      {/* 思源宋體的按頁裁字：前後台都要（2026-10 後台翻新之後，後台的標題、內容與表單也是宋體） */}
      <ClientOnly fallback={null}>
        <Suspense fallback={null}>
          <SerifFontLoader />
        </Suspense>
      </ClientOnly>
    </div>
  );
}
