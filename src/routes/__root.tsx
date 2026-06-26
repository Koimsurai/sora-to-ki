import type { ReactNode } from 'react';
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  useRouterState,
} from '@tanstack/react-router';
import { HelmetProvider } from 'react-helmet-async';
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
        {/* 過渡 bridge:讓現有 SEOHead(react-helmet-async)頁面不致崩;SEO 之後逐頁改用 Start head() */}
        <HelmetProvider>{children}</HelmetProvider>
        <Scripts />
      </body>
    </html>
  );
}
