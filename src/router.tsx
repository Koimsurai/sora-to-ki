import { hashKey, QueryClient } from '@tanstack/react-query';
import type { SiteConfig } from '@koimsurai/api-types';
import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { siteConfigQueryOptions } from '@/data/siteConfig';
import { setSiteIdentity } from '@/lib/siteIdentity';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  // 每次 getRouter() 建新 QueryClient（SSR 每請求一個，避免跨請求資料洩漏）。
  const queryClient = new QueryClient();
  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
  });
  // 接上 SSR dehydrate/hydrate + 提供 QueryClientProvider 給 React tree（不必手動包）。
  setupRouterSsrQueryIntegration({ router, queryClient });
  // 站台身分（lib/siteIdentity）跟著站台設定的查詢走，不靠 root 的 beforeLoad：瀏覽器水合時
  // 各路由的 head() 會在 beforeLoad 之前重算一次，那時還是預設的 My Site。
  // 快取一拿到資料（含 SSR 帶過來、水合灌回去的那份）就寫進去
  const siteConfigHash = hashKey(siteConfigQueryOptions.queryKey);
  queryClient.getQueryCache().subscribe(({ query }) => {
    if (query.queryHash !== siteConfigHash) return;
    const data = query.state.data as SiteConfig | undefined;
    if (data) setSiteIdentity(data);
  });
  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
  interface HistoryState {
    /** 換了路徑但捲動由目的頁自己負責，不要捲回頂端（文章頁切語系，見 blog/useRetune） */
    keepScroll?: boolean;
  }
}
