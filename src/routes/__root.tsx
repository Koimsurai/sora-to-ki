// 全域樣式/字型 —— 對齊舊 main.tsx 的 entry import(P2 之前漏掉導致全站無 Tailwind/CSS 變數/字型 → 全破版)。
// index.css 先載(@tailwind base + :root 變數 + body/grain/:lang 字型切換),component CSS 才能覆蓋。
import '@fontsource-variable/tasa-orbiter';
import '@fontsource-variable/tasa-explorer';
import '../index.css';
import '../App.css';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  useRouterState,
} from '@tanstack/react-router';
import { HelmetProvider } from 'react-helmet-async';
import { ParallaxProvider } from 'react-scroll-parallax';
import { AuthProvider } from '../contexts/AuthContext';
import { PageVisibilityProvider } from '../contexts/PageVisibilityContext';
import { ArticlePreviewProvider } from '../components/article-preview/ArticlePreviewContext';
import { LocaleProvider, localeFromPathname } from '../start-i18n';
import AppShell from '../components/AppShell';
import NotFound from '../components/NotFound';
import { localeWrap } from '../localePage';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: '宙と木 · Koimsurai' },
    ],
  }),
  // 未知路由 → 站內 404 頁(在 AppShell 內,保留導覽列);localeWrap 提供 i18n + locale。
  notFoundComponent: localeWrap(NotFound),
  component: RootComponent,
});

// PageVisibilityProvider 是受控的(需 isVisible)。SSR 預設 visible,client 端追蹤 document.hidden。
function PageVisibilityBridge({ children }: Readonly<{ children: ReactNode }>) {
  const [isVisible, setIsVisible] = useState(true);
  useEffect(() => {
    const onChange = () => setIsVisible(!document.hidden);
    onChange();
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return <PageVisibilityProvider isVisible={isVisible}>{children}</PageVisibilityProvider>;
}

function RootComponent() {
  return (
    <RootDocument>
      <AppShell>
        <Outlet />
      </AppShell>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  // <html lang> 依路由的 locale 動態設定(SEO/可及性);SSR + client 都從 pathname 推得,一致無 mismatch
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const locale = localeFromPathname(pathname);
  return (
    <html lang={locale}>
      <head>
        <HeadContent />
      </head>
      <body>
        {/* 全域 providers(對齊舊 App.tsx 疊法);HelmetProvider 是 SEOHead 過渡 bridge */}
        <HelmetProvider>
          <AuthProvider>
            <ParallaxProvider>
              <PageVisibilityBridge>
                {/* 依 URL locale 的 i18n context 提到 root：讓 AppShell 的 Header/Footer/chrome 也拿到正確語言。
                    否則 chrome 在 per-page LocaleProvider 之外 → fallback 到 react-i18next 全域 instance,
                    prerender 多頁時語言互相洩漏(navbar 變別頁的語言)→ hydration text mismatch(React #418)。 */}
                <ArticlePreviewProvider>
                  <LocaleProvider locale={locale}>{children}</LocaleProvider>
                </ArticlePreviewProvider>
              </PageVisibilityBridge>
            </ParallaxProvider>
          </AuthProvider>
        </HelmetProvider>
        <Scripts />
      </body>
    </html>
  );
}
