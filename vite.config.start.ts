import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import path from 'node:path';

// P2 slice 1：獨立的 Start 設定，只驗證 prerender 工具鏈在 web/ 的真實依賴樹下能跑。
// 之後的切片才會把正式 vite.config.js 的 plugin（PWA / image-opt / proxy / react-compiler）逐一併進來。
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // react-helmet-async 是 CJS,要 vite 轉譯才能在 SSR 用具名匯出(過渡 bridge,之後 SEOHead→head() 就可移除)
  ssr: {
    noExternal: ['react-helmet-async'],
  },
  plugins: [
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true,
        // `/` 不靜態化 — 交給 server 端 beforeLoad 依 Accept-Language 導向。其餘語系頁各自 prerender。
        filter: (page) => page.path !== '/',
      },
      pages: [
        { path: '/en' },
        { path: '/ja' },
        { path: '/ko' },
        { path: '/zh-cn' },
        { path: '/about' },
        { path: '/en/about' },
        { path: '/ja/about' },
        { path: '/ko/about' },
        { path: '/zh-cn/about' },
        { path: '/setup' },
        { path: '/en/setup' },
        { path: '/ja/setup' },
        { path: '/ko/setup' },
        { path: '/zh-cn/setup' },
      ],
    }),
    viteReact(),
  ],
});
