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
import { localeFromPathname } from '../start-i18n';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: '宙と木 · Koimsurai' },
    ],
  }),
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
      <Outlet />
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
                <ArticlePreviewProvider>{children}</ArticlePreviewProvider>
              </PageVisibilityBridge>
            </ParallaxProvider>
          </AuthProvider>
        </HelmetProvider>
        <Scripts />
      </body>
    </html>
  );
}
