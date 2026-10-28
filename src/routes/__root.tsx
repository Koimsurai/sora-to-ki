// 全域樣式/字型 —— 對齊舊 main.tsx 的 entry import(P2 之前漏掉導致全站無 Tailwind/CSS 變數/字型 → 全破版)。
// index.css 先載(@tailwind base + :root 變數 + body/grain/:lang 字型切換),component CSS 才能覆蓋。
import '@fontsource-variable/tasa-orbiter';
// 翻新用的兩套拉丁字：Instrument Serif（整段英文的大字，只有 400）與 Fira Code（日期、數字、標籤）。
// 中文的思源宋體不在這裡，它是按頁裁字（layout/SerifFontLoader）
import '@fontsource/instrument-serif/400.css';
import '@fontsource-variable/fira-code';
import '../index.css';
import '../App.css';
import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { Outlet, createRootRouteWithContext, HeadContent, Scripts, useRouterState } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { ParallaxProvider } from 'react-scroll-parallax';
import { AuthProvider } from '../contexts/AuthContext';
import { localeFromPathname } from '@/i18n/start-i18n';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { SUPPORTED_LOCALES } from '../lib/locales';
import { LOCALE_TO_OG } from '@/seo/seoMeta';
import AppShell from '@/components/layout/AppShell';
import NotFound from '@/components/layout/NotFound';
import { localeWrap } from '@/i18n/localePage';
import { RING_OUTER, RING_SEGMENTS } from '@/lib/saturnSpec';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: '宙と木 · Koimsurai' },
      { name: 'theme-color', content: '#0a0a0c' },
    ],
    // PWA:manifest 過去從沒被掛上 → 瀏覽器根本看不到它,站台不可安裝。
    links: [
      { rel: 'manifest', href: '/site.webmanifest' },
      // feed 自動探索：瀏覽器擴充、聚合器、部分 AI 爬蟲都靠這一行才找得到。
      // 指向既有的 /rss（後端 handlers/rss.rs）——/rss.xml 只是 301 過去的別名。
      { rel: 'alternate', type: 'application/rss+xml', title: 'Koimsurai 手記', href: '/rss' },
      // 圖示由 scripts/gen-icons.mjs 從 scripts/icons/ 的 SVG 產生。
      // 分頁列（沒有底板、跟著主題換色）與 Google 搜尋（有底板）是兩支檔案，圖案一樣，機制寫在 gen-icons.mjs 檔頭：
      // Google 那邊靠 robots.txt 只對 Googlebot-Image 擋掉前兩者；分頁列這邊 **SVG 要排最後**
      // （Firefox 取最後宣告的那支，Chrome 有 SVG 就用 SVG）。
      { rel: 'icon', type: 'image/png', sizes: '96x96', href: '/favicon-96.png' },
      { rel: 'icon', href: '/favicon.ico', sizes: '16x16 32x32' },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      // 滿版無圓角：iOS 自己裁圓角，透明的角會被填成黑色。
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
  }),
  // 未知路由 → 站內 404 頁(在 AppShell 內,保留導覽列);localeWrap 提供 i18n + locale。
  notFoundComponent: localeWrap(NotFound),
  component: RootComponent,
});

function RootComponent() {
  useServiceWorker();
  return (
    <RootDocument>
      <AppShell>
        <Outlet />
      </AppShell>
    </RootDocument>
  );
}

// 註冊 /sw.js(只快取 /assets/* 與離線頁,不碰 HTML —— HTML 交給 Nitro 的 ISR)。
// 取代 serve.mjs 時代那支「自毀 SW」:它的任務(清掉更早 SPA PWA 的殘留)已完成,
// 回訪者的瀏覽器會用這份新的取代它。
function useServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onLoad = () =>
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        /* SW 註冊失敗無妨 */
      });
    // 等 load 之後再註冊,避免跟首屏資源搶頻寬
    if (document.readyState === 'complete') onLoad();
    else {
      window.addEventListener('load', onLoad, { once: true });
      return () => window.removeEventListener('load', onLoad);
    }
  }, []);
}

/**
 * 開場那道小環是載入條，只畫兩圈：B 環最亮的那段與 A 環（lib/saturnSpec 的 RING_SEGMENTS 第 5、8 段），
 * 中間空出來的就是卡西尼縫。半徑照 3D 土星環的比例縮（3D 環外緣是 26px），亮度照那一段的亮度
 * （跟 3D 的刷痕一樣取 0.75 次方），長大交棒時兩圈正好落在 3D 環最亮的兩道上
 */
const BOOT_RINGS = RING_SEGMENTS.filter((_, i) => i === 4 || i === 7).map(([inner, outer, tone]) => ({
  r: (((inner + outer) / 2) * 26) / RING_OUTER,
  tone: tone ** 0.75,
}));
/** 開場那道行星環的一半（後半圈或前半圈）。半徑與傾角見 index.css 的 #boot 那段 */
function BootRing({ half }: { half: 'back' | 'front' }) {
  const id = `boot-${half}`;
  return (
    <svg className={`boot-ring is-${half}`} viewBox="-40 -40 80 80">
      <defs>
        <clipPath id={id}>
          <rect x="-40" y={half === 'back' ? -40 : 0} width="80" height="40" />
        </clipPath>
      </defs>
      {/* 傾角：往右下斜 11.5°，從上方 24° 往下看（ry = r · sin 24°），跟 lib/saturnSpec 的 TILT／ROLL 一樣 */}
      <g transform="rotate(11.5)" clipPath={`url(#${id})`}>
        {BOOT_RINGS.map(({ r, tone }) => (
          <g key={r} style={{ '--tone': tone } as CSSProperties}>
            <ellipse className="boot-ring-base" rx={r} ry={r * 0.408} />
            <ellipse className="boot-ring-prog" rx={r} ry={r * 0.408} pathLength={1} />
          </g>
        ))}
      </g>
    </svg>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  // <html lang> 依路由的 locale 動態設定(SEO/可及性);SSR + client 都從 pathname 推得,一致無 mismatch
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const locale = localeFromPathname(pathname);
  return (
    // suppressHydrationWarning：head 裡那段開場腳本在 React 接手前就在 <html> 掛上 data-boot 與 --boot-p，
    // 這是刻意的（paint 之前就要藏住頁面），不是不一致。只壓 <html> 這一層的屬性，子孫照常檢查
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* WebMCP origin trial。沒有 token，navigator.modelContext 不存在，Lighthouse 的
            「已註冊的 WebMCP 工具 / 結構定義有效」永遠停在「不適用」。
            兩顆並存是刻意的：各瀏覽器只驗自己簽的那顆、忽略其餘，Chrome 與 Edge 的 trial
            是分開註冊的。都綁 https://koimsurai.com:443。
            ⚠ 到期日不同，Edge 那顆先死 —— 到期後只會靜默失效，不會有任何錯誤訊息。
              Edge   2026-09-11（不含子網域）
              Chrome 2026-11-17（含子網域） */}
        <meta
          httpEquiv="origin-trial"
          content="A1SldNowolVg1sn7ieRrEhM/+ptfGqSwkO9IJUZEx9FnvUqYS7TP3dn3k76moSbRXOsIriHl/qZaF79Nmc11UI8AAABNeyJvcmlnaW4iOiJodHRwczovL2tvaW1zdXJhaS5jb206NDQzIiwiZmVhdHVyZSI6IldlYk1DUCIsImV4cGlyeSI6MTc4OTA5MzU2Mn0="
        />
        <meta
          httpEquiv="origin-trial"
          content="A5pLccd3+DBvsAJK4qQsCeO0JYYH6byAGRIs9HSZt1L5aN6VxBxemVEVKDLMb6MUgVQKo0h45pK58LUHChNQeAkAAAB0eyJvcmlnaW4iOiJodHRwczovL2tvaW1zdXJhaS5jb206NDQzIiwiZmVhdHVyZSI6IldlYk1DUCIsImV4cGlyeSI6MTc5NDg3MzYwMCwiaXNTdWJkb21haW4iOnRydWUsImlzVGhpcmRQYXJ0eSI6dHJ1ZX0="
        />
        {/* og:locale:alternate 依規格要「一語系一個標籤」重複出現，但 head() 的 meta 會被依
            property 去重（官方文件：same name or property will be overridden by the last
            occurrence），只留得下一個 → 等於錯誤宣告「只有某一種語言」。這裡直接寫進 document
            head 繞過那層去重。
            代價：RootDocument 拿不到單篇文章的 available_locales，所以一律列出其餘四語。
            og 這個標籤只是給社群平台的語言提示，不像 hreflang 會有重複內容的風險，
            過度宣告可以接受；hreflang 那邊仍然是逐篇照實際譯文輸出。 */}
        {SUPPORTED_LOCALES.filter((l) => l !== locale).map((l) => (
          <meta key={l} property="og:locale:alternate" content={LOCALE_TO_OG[l]} />
        ))}
        {/* pre-paint：套用文章閱讀字體偏好 → html[data-blog-font]。偏好在 localStorage、server 讀不到，
               原本是 BlogPost 掛載後才 setState，等於「首屏用預設 serif 畫完、再整篇換字體重排」——
               回訪讀者每次進文章都吃一次。字體棧定義在 index.css 的 --blog-font-<id>。
               只收 /^[a-z-]{1,20}$/：localStorage 是使用者可改的，不驗就等於把任意字串寫進 attribute。

            ⚠️ 試過但無效、別再加：`history.scrollRestoration='manual'`。
            動機是「長文章重新整理時瀏覽器搶先還原捲動位置」——實測還原發生在 160ms、當時 SSR HTML
            還沒解析完（docH 只有 2792，最終 7109），同一個 scrollTop 對應的內容完全不同 → CLS 0.4252。
            但把宣告放這裡沒有用：瀏覽器的還原是 navigation commit 的一部分，比 <head> 的同步 script
            更早，scrollY 依然被設成 1972/docH 2792。改成 manual 之後位移反而從「5 次中 3 次」變成
            必現（改由 router 還原，時序更固定）。真正要解得從「SSR HTML 解析完成前不要有可捲動高度」
            或 router 還原時機下手，不是這一行。 */}
        <script
          // 這裡是唯一選項：這段必須在 paint 之前「同步」跑完（<script src> 或 useEffect
          // 都太晚，文章會先用錯字體排一次）。內容是原始碼寫死的字串常量，
          // 沒有變數插值、沒有使用者輸入直接落地（localStorage 那個值有白名單格式驗證），
          // 不存在注入面。
          // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var f=localStorage.getItem('blogFont');if(f&&/^[a-z-]{1,20}$/.test(f)){document.documentElement.setAttribute('data-blog-font',f);}}catch(e){}})()",
          }}
        />
        {/* 開場（index.css 的 #boot、layout/TransitionLayer 的 enter）：在 paint 之前掛上 html[data-boot]，
            頁面就先藏在夜色後面、不會先閃出來；外圈那道線照載入的階段推（--boot-p）。
            轉場掛上之後接手：畫滿那一圈，點飛向這一頁的錨點，夜色淡掉。
            不演的：後台、要求減少動態、自動化瀏覽器（e2e 與爬蟲不必等一段動畫）。
            同一個分頁重新整理時是 quick（不再刻意停留）。6 秒後一定拿掉：轉場的程式沒載到也不會卡住 */}
        <script
          // 同上：必須在 paint 之前同步跑完。內容是寫死的字串常量，沒有變數插值也沒有使用者輸入
          // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var d=document.documentElement;if(navigator.webdriver||/^\\/admin(\\/|$)/.test(location.pathname)||matchMedia('(prefers-reduced-motion: reduce)').matches)return;var q=sessionStorage.getItem('koim-boot');sessionStorage.setItem('koim-boot','1');d.setAttribute('data-boot',q?'quick':'');var set=function(v){if(d.hasAttribute('data-boot'))d.style.setProperty('--boot-p',String(v))};set(0.12);document.addEventListener('DOMContentLoaded',function(){set(0.45)});if(document.fonts)document.fonts.ready.then(function(){set(0.65)});addEventListener('load',function(){set(0.85)});setTimeout(function(){d.removeAttribute('data-boot');d.style.removeProperty('--boot-p')},6000)}catch(e){}})()",
          }}
        />
        {/* Plausible 分析。未設 VITE_PLAUSIBLE_SCRIPT 就整個不輸出 —— dev 與 e2e 都不設。
            （腳本本身也會忽略 localhost、127 開頭的位址與 file: 協定，但那是第二道防線。）

            這是 v3 的寫法，不是官網那些教學裡的 data-domain 版本（v3 稱之為 legacy）。
            站台名與「Outbound links / File downloads / Form submissions」等選項都烤在
            那支站台專屬腳本（pa-XXXX.js）裡，所以這裡不需要、也蓋不掉 domain。

            ⚠️ endpoint 一定要覆蓋，這是整個同源設計的關鍵。腳本裡是：
                  Object.assign(i={endpoint:"https://plausible.koimsurai.com/api/event",
                                  domain:"koimsurai.com",…}, o, {domain:i.domain})
               `o` 就是 init() 傳進來的物件、合併在預設之後 —— 所以 endpoint 蓋得掉，
               domain 蓋不掉（最後又被寫回）。不覆蓋的話事件會往 plausible.koimsurai.com
               送，那是跨源：撞 CSP 的 connect-src 'self'，也會被內容攔截器擋。

            ⚠️ 兩支 <script> 的順序無所謂，也不需要等載入 —— 這正是上面能用 async 的原因。
               下面那段先把設定存進 plausible.o，站台腳本載入後自己會讀
               （`plausible.o && S(plausible.o)`）。

            站長自己不算進去，兩層：
              · transformRequest 回 null 的事件不送 —— /admin 底下一律不送（後台不是讀者會看的頁面）。
                它跟 endpoint 一樣是 init() 的選項，照上面那個 Object.assign 合併得進去。
              · 開過後台的瀏覽器會被 AdminLayout 設上 localStorage.plausible_ignore = "true"，
                腳本看到就整個不送（v3 的 track() 裡寫死的檢查）。所以在前台逛也不算。
              Plausible 的 Shields 也能擋 IP，但家用與手機網路的 IP 會換，靠不住。

            對應的 nginx 在 /etc/nginx/sites-available/koimsurai：
            location ^~ /s/js/ 與 location = /s/event。
            SPA 換頁不必額外處理：腳本自己 patch 了 history.pushState 並監聽 popstate。 */}
        {/* 只在正式建置輸出：dev 沒有 nginx 轉發 /s/js/，那支腳本一定 404（.env 裡有設，是給 docker build 用的） */}
        {import.meta.env.PROD && import.meta.env.VITE_PLAUSIBLE_SCRIPT ? (
          <>
            <script async src={`/s/js/${import.meta.env.VITE_PLAUSIBLE_SCRIPT}`} />
            <script
              // 內容是原始碼寫死的字串常量（唯一的變數是上面那個 build 時就決定的檔名，
              // 而它不進這段），沒有使用者輸入落地。CSP 的 script-src 已含 'unsafe-inline'。
              // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
              dangerouslySetInnerHTML={{
                __html:
                  "window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init({endpoint:'/s/event',transformRequest:function(p){return/^\\/admin(\\/|$)/.test(location.pathname)?null:p}})",
              }}
            />
          </>
        ) : null}
      </head>
      <body>
        {/* 開場的夜色與那顆點（只在 html[data-boot] 時顯示，見上面 head 裡那段） */}
        {/* 開場的進度是一道行星環（跟首頁土星同一個傾角、同一份環的結構）：後半圈在點後面、前半圈疊在點上。
            首頁換頁時它長大、交棒給 3D 土星的環（layout/TransitionLayer） */}
        <div id="boot" aria-hidden="true">
          <BootRing half="back" />
          <i className="boot-dot" />
          <BootRing half="front" />
          {/* 畫環的筆尖：沿著同一道橢圓走到進度的最前端，後面拖三顆漸淡的點 */}
          <div className="boot-pen">
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
        {/* 全域 providers(對齊舊 App.tsx 疊法)。SEOHead 已退休 → HelmetProvider/react-helmet-async 一併移除。 */}
        <AuthProvider>
          <ParallaxProvider>
            {/* 依 URL locale 的 i18n context 提到 root：讓 AppShell 的 Header/Footer/chrome 也拿到正確語言。
                否則 chrome 在 per-page LocaleProvider 之外 → fallback 到 react-i18next 全域 instance,
                prerender 多頁時語言互相洩漏(navbar 變別頁的語言)→ hydration text mismatch(React #418)。 */}
            <LocaleProvider locale={locale}>{children}</LocaleProvider>
          </ParallaxProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
