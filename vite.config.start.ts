import { defineConfig, type Plugin } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { nitro } from 'nitro/vite';
import viteReact from '@vitejs/plugin-react';
// Tailwind v4 走專屬的 vite plugin 而不是 PostCSS 外掛：官方在 vite 專案推薦這條，
// 而且它讓整個 postcss.config.js 可以消失（v4 自己處理 @import 與 vendor prefix，
// postcss-import 與 autoprefixer 都不需要了）。
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

/**
 * 把 monaco 的 `min/vs` 複製進 `public/monaco/vs`，讓編輯器從**自己的網域**載入。
 *
 * 原本是走 `@monaco-editor/loader` 的預設值，也就是
 * `https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs`。三個問題：
 *
 *   1. **版本對不上**。`package.json` 原本釘的是 `monaco-editor@0.53.0`（型別用），
 *      CDN 送的卻是 0.55.1——型別檢查看到的 API 跟實際跑的差兩個 minor 版。
 *      這種落差不會有編譯錯誤，只會在某個 API 改了行為時變成執行期的怪現象。
 *
 *      ⚠ 自架時**必須把版本對齊成「線上原本在跑的那個」**（0.55.1），而不是
 *        package.json 當時釘的 0.53.0。第一版就是搞錯這件事：改成送 0.53.0 之後
 *        monaco 的 `language/css/monaco.contribution` 在初始化時丟
 *        `TypeError: Property description must be an object: undefined`，
 *        所有請求都 2xx、編輯器外框也畫得出來，只有 console 裡有那一行。
 *        自架要換的是**來源**，不是版本——換版本是另一件事，要另外驗。
 *   2. **第三方相依**。jsdelivr 掛掉或被擋（企業網路、某些地區）就打不開編輯器。
 *   3. **擋住 CSP**。要收緊 `script-src` 就得把 jsdelivr 放進白名單，
 *      等於為了一個後台功能在全站開一個外部來源。
 *
 * 為什麼複製整個 `min/vs`（約 15 MB）而不是挑需要的語言：monaco 是按需 lazy load 的，
 * 挑漏一個語言的症狀是「某種程式碼區塊的語法高亮突然沒了」，而那不會報錯。
 * 這些檔只在後台開編輯器時才會被抓，前台讀者一個 byte 都不會下載。
 *
 * 用 plugin 而不是 `prebuild` script：`pnpm dev` 也要有這些檔，而 dev 不跑 build script。
 */
function copyMonacoAssets(): Plugin {
  return {
    name: 'copy-monaco-vs',
    // buildStart 在 build 與 dev server 啟動時都會跑
    buildStart() {
      const require = createRequire(import.meta.url);
      // 用 resolve 而不是寫死 node_modules 路徑——pnpm 的實際位置在 .pnpm/ 底下。
      // ⚠ 不能 resolve 'monaco-editor/package.json'：0.56 起它的 exports 只放行
      //   `.`／`./*.js`／`./*`，那條路徑會被改寫成 `…/package.json.js` 而找不到。
      //   改從進入點往上走到套件根，這樣不依賴 exports 怎麼寫。
      const entry = require.resolve('monaco-editor');
      let pkgDir = path.dirname(entry);
      while (!fs.existsSync(path.join(pkgDir, 'package.json'))) {
        const up = path.dirname(pkgDir);
        if (up === pkgDir) throw new Error('找不到 monaco-editor 的 package.json');
        pkgDir = up;
      }
      const version = (JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as { version: string })
        .version;
      const src = path.join(pkgDir, 'min/vs');
      const destRoot = path.resolve(import.meta.dirname, 'public/monaco');
      const stamp = path.join(destRoot, '.version');

      // 版本沒變就跳過。整份複製約 15 MB，每次 dev 重啟都做一次是白等。
      if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8') === version) return;

      fs.rmSync(destRoot, { recursive: true, force: true });
      fs.mkdirSync(destRoot, { recursive: true });
      fs.cpSync(src, path.join(destRoot, 'vs'), { recursive: true });
      fs.writeFileSync(stamp, version);
      this.info(`monaco-editor@${version} → public/monaco/vs`);
    },
  };
}

/**
 * dev server 的 /api：瀏覽器打的 /api 轉給 BACKEND_URL（正式環境是 nginx 在轉）。
 * 不用 vite 的 server.proxy：Nitro 的開發中介層排在它前面，/api 會先被當成頁面回 404。
 * 只放讀取：拿線上後端預覽時，按讚、留言這類寫入不會真的寫進去
 */
function devApiProxy(): Plugin {
  const target = process.env.BACKEND_URL ?? 'http://127.0.0.1:3009';
  return {
    name: 'koimsurai:dev-api-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api', (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.statusCode = 405;
          res.end();
          return;
        }
        fetch(`${target}/api${req.url ?? ''}`, { method: req.method, headers: { accept: req.headers.accept ?? '*/*' } })
          .then(async (r) => {
            res.statusCode = r.status;
            const type = r.headers.get('content-type');
            if (type) res.setHeader('content-type', type);
            res.end(Buffer.from(await r.arrayBuffer()));
          })
          .catch(next);
      });
      // 相簿的圖與文章上傳的圖：正式環境是 nginx 直接從這兩個目錄給（location /nas-images/、/uploads/），
      // dev 照做一份唯讀的。少了 /uploads 的話，文章裡的圖（前後比對、內文圖片）在 dev 上全是破圖
      const types: Record<string, string> = {
        '.webp': 'image/webp',
        '.jpeg': 'image/jpeg',
        '.jpg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
      };
      const serveDir = (mount: string, dir: string) => {
        const root = path.resolve(dir);
        server.middlewares.use(mount, (req, res, next) => {
          const file = path.resolve(root, `.${decodeURIComponent((req.url ?? '').split('?')[0])}`);
          if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            next();
            return;
          }
          const type = types[path.extname(file).toLowerCase()];
          if (type) res.setHeader('content-type', type);
          fs.createReadStream(file).pipe(res);
        });
      };
      serveDir('/nas-images', process.env.NAS_GALLERY_DIR ?? '/mnt/hdd16tb_01/nas-storage/gallery');
      serveDir('/uploads', process.env.UPLOADS_DIR ?? '/mnt/hdd16tb_01/Blog/uploads');
    },
  };
}

// 不做 prerender,改走 ISR(見下方 routeRules)。理由是實測出來的,不是偏好:
//   在 nitro/vite + TanStack Start 下,prerender 產出的 HTML 寫進 .output/public 後
//   *不會被 nitro 註冊成靜態資產* —— /assets/*.css 與 /favicon.ico 都 200,唯獨
//   /blog/index.html、/en/index.html 一律 404,實際請求每次都重新 SSR(連打兩次 md5 不同)。
//   等於 prerender 生出 111 個檔案卻沒有任何一個被送出過,純粹浪費 build 時間。
// 拿掉它同時消滅:build 期打 https://koimsurai.com 撈文章清單(build 依賴線上站活著),
// 以及為了 prerender 內部 crawler 而綁 server/preview host 的 hack。
// ISR 已實測能給出同樣完整的 HTML(/blog 有文章標題與連結、/blog/$id 有內文與 meta)。

// 非預設語系的網址前綴（src/lib/locales 的 PREFIX）。預設語系是站台設定、建置時不知道，所以五個都列：
// 預設語系自己的前綴是 404，多一條快取規則沒有影響
const LOCALE_PREFIXES = ['en', 'ja', 'ko', 'zh-cn', 'zh-tw'];
// UI 頁(全 5 語都有)。加新頁只要加名字,ISR 規則會自動涵蓋 5 個語系路徑。
const UI_PAGES = [
  'about',
  'setup',
  'bookshelf',
  'activity',
  'music',
  'thinking',
  'messages',
  'portfolio',
  'friends',
  'watch/library',
  'watch',
  'blog',
  'unsubscribe',
  'about-site',
  'history',
  'photos',
];

// ── ISR / SWR route rules ───────────────────────────────────────────────────
// 一頁 → 該頁 5 個語系路徑(/x + /en/x …)。
const localeVariants = (page: string): string[] => [`/${page}`, ...LOCALE_PREFIXES.map((l) => `/${l}/${page}`)];
// 這裡只設 swr（伺服器端 ISR 快取），HTML 的 Cache-Control 不在這層管。
//
// 原因：nitro 的 `swr: n` 會吐出 `public, max-age=n, s-maxage=n`，那個 max-age 是**瀏覽器**端的，
// 而部署後 assets 全換 hash、舊檔消失 → 這 n 秒內的回訪者從磁碟快取讀到舊 HTML → 動態 import
// 去要已刪除的 chunk → 404 → mermaid／SketchBlock 整塊不渲染（2026-07-28 實測：10 支 chunk 404、
// 圖表全空）。在 routeRules 加 `headers: { 'cache-control': ... }` 沒有用——SWR 會把整個回應連同
// 自己算出的 header 存進快取、命中時重放，實測會覆蓋掉這裡設的值。
//
// 所以改在 nginx 處理（/etc/nginx/sites-available/koimsurai）：HTML 降到 max-age=60，
// /assets/ 獨立一個 location 保住 immutable。改那邊時記得 nginx 的 add_header 不繼承，
// 安全標頭要在該 block 內補齊。
const swrRules = (paths: string[], seconds: number) => Object.fromEntries(paths.map((p) => [p, { swr: seconds }]));

// 刻意採「白名單」而非 '/**' 全站包:全站包是 fail-open —— 日後新增任何讀 cookie/header 或
// render 使用者資料的頁面,都會被預設公開快取且沒人會察覺。白名單則是新頁預設不快取,最壞只是少個快取。
// 明確不快取(因此不列於此):
//   /              → createServerFn 讀 cookie/Accept-Language 做 302 導向,快取會把首位訪客的語言發給所有人
//   /admin/**      → 後台
//   /auth/**       → 登入流程
//   /unsubscribe   → 帶 token 的使用者專屬頁
// 可安全快取的前提:登入狀態只存在 client 的 localStorage(AuthContext 在 useEffect 才讀),
// 所以 SSR 一律 render 未登入外殼,HTML 對所有訪客相同。
const ISR_PAGES = UI_PAGES.filter((p) => p !== 'blog' && p !== 'unsubscribe');
const ISR_ROUTE_RULES = {
  ...swrRules(ISR_PAGES.flatMap(localeVariants), 3600),
  ...swrRules(localeVariants('blog'), 300), // 列表頁:發新文要早點出現 → 5 分鐘
  ...swrRules(
    localeVariants('blog').map((p) => `${p}/**`),
    3600,
  ), // 文章頁:內容幾乎不動 → 1 小時
};

export default defineConfig(({ command }) => ({
  // Sentry 的 tree-shaking 旗標。這些是 SDK 內部拿來包住整段功能的常數，
  // 在 build 時替換成 false，那幾塊就會被搖掉。
  //
  // ⚠️ 但這幾個旗標只是**次要**的那一半。真正決定大小的是 import 的寫法：
  //   `const Sentry = await import('@sentry/browser')` 這種 namespace import 會讓
  //   bundler 不敢搖掉任何 export（理論上可以動態存取），整包 Replay(rrweb) +
  //   Feedback + browserTracing 都留著 → 135 KB gz。改成 `const { init } = await
  //   import(...)` 之後是 26 KB gz。見 src/lib/errorReporting.ts。
  //
  // ⚠️ 這幾個常數要**存在**才行（不然 SDK 裡的 `typeof __SENTRY_DEBUG__` 會炸），
  //   所以是 define 成 false 而不是刪掉。
  define: {
    __SENTRY_DEBUG__: 'false',
    __SENTRY_TRACING__: 'false',
    __RRWEB_EXCLUDE_CANVAS__: 'true',
    __RRWEB_EXCLUDE_IFRAME__: 'true',
    __RRWEB_EXCLUDE_SHADOW_DOM__: 'true',
    // 打包進來的 UMD 套件一律不准碰頁面上的 AMD 載入器。
    //
    // ⚠️ 後台的 Monaco 是從 /monaco/vs 以 AMD 方式載入的，會在 window 掛一個帶 `amd` 的
    //    `define`。這是單頁應用，切到前台之後它還在：打包進來的 UMD 套件若判斷順序是
    //    「先看 AMD、才看 CommonJS」，就會改去呼叫那個 define，匯出落空，AMD 載入器在第二次
    //    匿名呼叫時丟出 `Can only have one anonymous define call per script file`。
    //    只有「先開過後台編輯器」的分頁會發生，乾淨的瀏覽器看不到。以前 Sketch 區塊在瀏覽器裡
    //    用 Excalidraw 畫圖時踩過（2026-10 改成伺服器畫之後，那幾個套件已經不在了），留著當防護。
    //    把裸識別字 `define` 換成 undefined，`typeof define` 就恆為 'undefined'，UMD 全走
    //    CommonJS / ESM 分支。只影響打包的程式碼：Monaco 本身不在打包裡，而它內部的
    //    `globalThis.define.amd` 是屬性存取，不是裸識別字，不會被換掉。
    define: 'undefined',
  },
  build: {
    // 'hidden' = 產生 .map 檔，但**不在 bundle 結尾寫 sourceMappingURL**。
    //
    // 為什麼不是 true：那會在 bundle 結尾寫 sourceMappingURL，瀏覽器 devtools 會自動
    // 去抓——等於主動把原始碼推給每個開 devtools 的人。
    // 為什麼不是 false：那 GlitchTip 上的 stack trace 全是 minify 過的
    // （`t.f is not a function` 這種），幾乎讀不出東西——等於白裝。
    //
    // ⚠️ 'hidden' **只拿掉那行註解，不會阻止 .map 被供應**。實測過：
    //   /assets/AdminDashboard-*.js.map 直接 200，整站原始碼可下載。
    //   真正把它擋掉的是 Dockerfile 最後那步 `find ... -delete`（上傳完就刪），
    //   加上 nginx 的 `location ~ \.map$ { return 404; }`。
    sourcemap: 'hidden',
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(import.meta.dirname, './src') },
      // recharts 依賴 decimal.js-light；rolldown 的 prod build 對它的 CJS 版做 interop 時把 default
      // 二次包裝（default.default）→ recharts 內 `new Decimal()` 變 `new G.default` 而爆
      // "G.default is not a constructor"（dev 的 esbuild 不會）。強制指向它的 ESM 版（乾淨的
      // export default Decimal）迴避。用 bare 子路徑當 replacement（從匯入者 recharts 的 context
      // 解析 → pnpm/Docker 下 decimal.js-light 不在頂層也找得到，不寫死絕對路徑）；
      // regex 精確匹配 decimal.js-light（不含子路徑）避免 replacement 被再次 alias。
      { find: /^decimal\.js-light$/, replacement: 'decimal.js-light/decimal.mjs' },
    ],
  },
  // react-helmet-async 是 CJS,要 vite 轉譯才能在 SSR 用具名匯出(過渡 bridge,之後 SEOHead→head() 可移除)
  ssr: { noExternal: ['react-helmet-async'] },
  plugins: [
    devApiProxy(),
    copyMonacoAssets(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    nitro({
      config: {
        serverDir: './server', // 掃 server/routes/ 的檔案系統路由(預設不掃 → 404)
        // 按頁裁字（server/routes/fonts/serif）在執行期才 require subset-font：它要用 require.resolve
        // 找 HarfBuzz 的 wasm，打包進來就找不到。整包追蹤進 .output，連同它載入的 wasm 套件。
        // 少了這行，本機從專案目錄跑產物照樣正常（借用了專案的 node_modules），進了映像才 500
        traceDeps: ['subset-font*', 'harfbuzzjs*', 'fontverter*', 'wawoff2*', 'woff2sfnt-sfnt2woff*'],
        // ISR：node-server preset 內建 SWR（TTL 過期先回舊、背景重生，不需 CDN）。
        // 只在 build 出來的正式版套用：dev 也套的話，改完程式碼重新整理會先拿到快取裡的舊 HTML（瀏覽器端
        // 還會照 max-age=3600 再存一份），跟新的 JS 對不上 → hydration 失敗、整棵樹在 client 重建，
        // 開場那層停在舊的樣子（實際遇過：舊版的進度圈沒有新 CSS 可套，畫成一個黑圈）
        routeRules: command === 'build' ? ISR_ROUTE_RULES : {},
        // 靜態資產（/assets 的 JS、CSS）建置時先壓好 brotli 與 gzip，供應時照 Accept-Encoding 挑。
        // nginx 官方套件沒有 brotli 模組（自己編的話每次升 nginx 都得重編），放在這裡誰部署都一樣。
        // ⚠ Dockerfile 在這之後才往 JS 裡寫 debug id：壓縮檔要在那之後重壓一次（scripts/recompress-public-assets.mjs），
        //   否則讀者拿到的 .br 是沒有 debug id 的舊內容，GlitchTip 對不回原始碼
        compressPublicAssets: { gzip: true, brotli: true },
      },
    }),
  ],
}));
