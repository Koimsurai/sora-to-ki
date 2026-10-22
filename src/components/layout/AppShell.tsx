import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { ClientOnly, useRouterState } from '@tanstack/react-router';
import { stripLocalePrefix } from '@/i18n/start-i18n';
import Header from './Header';
import Footer from './Footer';
import ScrollToTop from './ScrollToTop';
import CSSStarfield from '@/components/backdrop/CSSStarfield';
import NebulaBackground from '@/components/backdrop/NebulaBackground';
import BackToTopButton from './BackToTopButton';

// 桌面 WebGL 背景/開場 + 互動式 overlay → 純 client(three.js / portal 不進 SSR)
// GPU 探測跟這支 chunk 的下載同時起跑，不要等元件掛上才開始：開場要等探測做完才播
// （理由見 SpaceBackdropShell 的 introReady），越早開始，開場前要等的時間越短。
const SpaceBackdropShell = lazy(() => {
  void import('@/lib/webglSupport').then((m) => m.probeHardwareGpu());
  return import('@/components/backdrop/SpaceBackdropShell');
});
const CommandPalette = lazy(() => import('./CommandPalette'));
const ContextMenu = lazy(() => import('./ContextMenu'));

// 全域 app 殼(對齊舊 App.tsx 的 Layout + App 疊法):Header / Footer / 背景 / chrome 包住路由內容(children = <Outlet/>)。
// admin 隱藏 Header/Footer/CommandPalette;photos 隱藏 Footer。
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

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bare = stripLocalePrefix(pathname); // 去 locale 前綴(無前導斜線)

  // 文章內頁（BlogPost）是重 lazy chunk（BlogPost.css + shiki + mermaid，134 KB gzip）。頁面 idle 後
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
  const isAdminPage = bare === 'admin' || bare.startsWith('admin/');
  const isPhotoPage = bare === 'photos';
  const isHomePage = bare === '';

  return (
    <div className="App">
      <ScrollToTop />
      {/* CSS 星空底:手機唯一背景;桌面是 3D 載入前的秒出 placeholder。SSR 即出。 */}
      <CSSStarfield />
      <ClientOnly fallback={null}>
        <Suspense fallback={null}>
          <SpaceBackdropShell />
        </Suspense>
      </ClientOnly>
      {/* 首頁的暗幕與紫色星雲常駐在這裡、換頁時淡入淡出：掛在首頁元件裡的話，它跟著首頁一起卸載，
          飛行途中的土星會瞬間變亮。DOM 順序在 3D canvas 之後（同一個 z-index，後畫的在上面） */}
      <div className={`sky-nebula${isHomePage ? ' is-shown' : ''}`} aria-hidden="true">
        <NebulaBackground />
      </div>

      <div
        className="main-content-container"
        style={{ position: 'relative', zIndex: 10, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        {!isAdminPage && <Header />}
        <main style={{ flex: '1 0 auto' }}>{children}</main>
        {/* 手記的面板一路延伸到底、首頁以一句話收尾、關於頁停在地心，這幾頁不放 footer（demo） */}
        {!isAdminPage && !isPhotoPage && bare !== 'blog' && bare !== 'about' && !isHomePage && <Footer />}
        {!isAdminPage && (
          <ClientOnly fallback={null}>
            <Suspense fallback={null}>
              <CommandPalette />
            </Suspense>
          </ClientOnly>
        )}

        {/* ⚠ 必須在 .main-content-container **裡面**。它是 position: fixed，所以放哪都不影響版面，
            但放在外面會讓它跟容器（z-index: 10）同一層互比——而容器裡的一切（頂欄、modal、
            命令面板）都被壓在那個 10 底下。實測過：放外面時 `.back-to-top` 的 1000 會蓋住
            寫著 10000 的 `.cmdk-backdrop`，命令面板開著時回頂端鈕還浮在上面。 */}
        <BackToTopButton isHomePage={isHomePage} />
      </div>

      {/* 右鍵選單刻意留在容器外：它要能開在任何東西之上，包含全螢幕檢視。 */}
      {!isAdminPage && (
        <ClientOnly fallback={null}>
          <Suspense fallback={null}>
            <ContextMenu />
          </Suspense>
        </ClientOnly>
      )}

      {/* 首訪首頁等開場就緒時的底色（樣式與理由見 index.css 的 .intro-veil），平常完全透明。
          fixed + z-index 決定疊層，放最後是為了不讓前面兄弟節點的 DOM 路徑位移（computed-style 基準靠路徑比對） */}
      {isHomePage && <div className="intro-veil" aria-hidden />}
    </div>
  );
}
