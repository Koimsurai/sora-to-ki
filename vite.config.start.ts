import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import path from 'node:path';

const API_BASE = 'https://koimsurai.com';
const PREFIX: Record<string, string> = { 'zh-TW': '', 'zh-CN': 'zh-cn', en: 'en', ja: 'ja', ko: 'ko' };

// data-driven prerender:build 時打 /api/posts,逐篇 × available_locales 生成要靜態化的文章頁。
// 之後幫某篇補一個語系翻譯 → 下次 build(或 ISR 即時)就自動多那條 URL,不用改 code。
async function blogPages(): Promise<{ path: string }[]> {
  try {
    const res = await fetch(`${API_BASE}/api/posts?limit=100`);
    const { posts } = (await res.json()) as { posts: { id: number; available_locales?: string[] }[] };
    return posts.flatMap((p) =>
      (p.available_locales ?? ['zh-TW']).flatMap((loc) => {
        const pre = PREFIX[loc];
        if (pre === undefined) return [];
        return [{ path: pre ? `/${pre}/blog/${p.id}` : `/blog/${p.id}` }];
      }),
    );
  } catch {
    return []; // API 抓不到就只 prerender 靜態頁,不擋 build
  }
}

const LOCALE_PREFIXES = ['en', 'ja', 'ko', 'zh-cn'];
// UI 頁(全 5 語都有):每頁生 default(/x)+ 4 個前綴(/en/x …)。加新頁只要加名字。
const UI_PAGES = ['about', 'setup', 'bookshelf', 'activity', 'music', 'cinema', 'anime', 'thinking', 'messages', 'portfolio', 'friends', 'watch/library', 'watch'];
const STATIC_PAGES = [
  ...LOCALE_PREFIXES.map((p) => ({ path: `/${p}` })),
  ...UI_PAGES.flatMap((page) => [
    { path: `/${page}` },
    ...LOCALE_PREFIXES.map((loc) => ({ path: `/${loc}/${page}` })),
  ]),
];

export default defineConfig(async () => ({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  // react-helmet-async 是 CJS,要 vite 轉譯才能在 SSR 用具名匯出(過渡 bridge,之後 SEOHead→head() 可移除)
  ssr: { noExternal: ['react-helmet-async'] },
  plugins: [
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: false, // 用明確的 pages 清單;不跟著頁面連結亂爬(會誤踩 RSS/API/外部連結)
        filter: (page) => page.path !== '/', // / 交給 server 做 Accept-Language 導向
      },
      pages: [...STATIC_PAGES, ...(await blogPages())],
    }),
    viteReact(),
  ],
}));
