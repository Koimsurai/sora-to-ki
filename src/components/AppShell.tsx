import { lazy, Suspense, type ReactNode } from 'react';
import { ClientOnly, useRouterState } from '@tanstack/react-router';
import { stripLocalePrefix } from '../start-i18n';
import Header from './Header';
import Footer from './Footer';
import ScrollToTop from './ScrollToTop';
import CSSStarfield from './CSSStarfield';
import BackToTopButton from './BackToTopButton';

// 桌面 WebGL 背景/開場 + 互動式 overlay → 純 client(three.js / portal 不進 SSR)
const SpaceBackdropShell = lazy(() => import('./SpaceBackdropShell'));
const CommandPalette = lazy(() => import('./CommandPalette'));
const ArticlePreviewCard = lazy(() => import('./article-preview/ArticlePreviewCard'));

// 全域 app 殼(對齊舊 App.tsx 的 Layout + App 疊法):Header / Footer / 背景 / chrome 包住路由內容(children = <Outlet/>)。
// admin 隱藏 Header/Footer/CommandPalette;photos 隱藏 Footer。
export default function AppShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bare = stripLocalePrefix(pathname); // 去 locale 前綴(無前導斜線)
  const isAdminPage = bare === 'admin' || bare.startsWith('admin/');
  const isPhotoPage = bare === 'photos';
  const isHomePage = bare === '';

  return (
    <div className="App">
      <ScrollToTop />
      {/* CSS 星空底:手機唯一背景;桌面是 3D 載入前的秒出 placeholder。SSR 即出。 */}
      <CSSStarfield />
      <ClientOnly fallback={null}>
        <Suspense fallback={null}><SpaceBackdropShell /></Suspense>
      </ClientOnly>

      <div
        className="main-content-container"
        style={{ position: 'relative', zIndex: 10, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
      >
        {!isAdminPage && <Header />}
        <main style={{ flex: '1 0 auto' }}>{children}</main>
        {!isAdminPage && !isPhotoPage && <Footer />}
        {!isAdminPage && (
          <ClientOnly fallback={null}>
            <Suspense fallback={null}><CommandPalette /></Suspense>
          </ClientOnly>
        )}
      </div>

      <BackToTopButton isHomePage={isHomePage} />
      <ClientOnly fallback={null}>
        <Suspense fallback={null}><ArticlePreviewCard /></Suspense>
      </ClientOnly>
    </div>
  );
}
