import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// 前端單元測試（vitest）。與 vite.config.start.ts 分離：
// 測試不需要 TanStack Start/Nitro 插件，獨立 config 啟動快且零副作用。
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
