# TS 遷移交接（給下個 session）

> ## ✅ 遷移完成（2026-06-24）
> **整個 `web/src` 已 100% TypeScript：162 個 `.ts/.tsx`、0 個 `.jsx/.js`。`tsc --noEmit` 0 error、`eslint src` 0 error（430 warnings 為可接受 backlog）、`pnpm build` 綠。**
>
> 本 session（接續）完成的：
> - **R3F 群（最硬的 dep blocker）**：根因是 `@types/three` 版本衝突 → 用 devDependency 釘到單一 0.181（drei peer）+ 動態元件改 `React.createElement`。轉完 TwinklingStars / Saturn3D / StarfieldWorkerScene / spaceWorker（`.jsx`→`.tsx`，SpaceBackdrop 的 `new URL` 也改）/ ZeroGravityLibrary / SpaceBackdrop。
> - **內容頁**：Cinema、Bookshelf、Anime、Music、Activity（各自定 API 型別介面 + `??` + `getTime()`）。
> - **Admin**：CommentsManager、CollectionManager、BooksManager、ArticleGenerator、PostEditor（rhf+zod：表單值用 `z.input` 型別 `PostFormInput`，schema 補 send_newsletter / series_*）。
> - **BlogPost 循環批**（usePreviewLink.ts + prefetchPost.ts + BlogPost.tsx 一起轉，因 allowJs:false 的循環依賴）。BlogPost 2146 行是最大檔。
> - **Blog / AboutSite / History / App / main**（main.jsx→.tsx，index.html 與 main 的 App import 都更新；vite-env.d.ts 補 `@fontsource-variable/*` 宣告）。
> - **dead code 清除**（使用者裁示「全部刪除」）：BlackHole3D.jsx(+css)、ui/command.jsx、ui/multiple-selector.jsx（皆 0 importers）。
>
> 過程發現並保留行為處理的 latent bug：drei `<Stars>` 不轉發 `rotation`（原 prop 一直 no-op）；CursorTrail/Footer 的 `style` prop 從未被讀取；SpaceBackdrop 的 `sharedRotationRef` 一直被忽略。皆加註解。**尚未 docker 部署 / Playwright 抽查。**
>
> ---
>
> 最後更新：2026-06-23。這份是 `web/` 前端 JS→TS 遷移的接力棒。memory 也有摘要（project_web_rust_tanstack_migration），但這份是**可直接照做的細節**。
>
> **2026-06-23 session 進度**：再轉 29 檔（tsc + `pnpm build` 全綠，6647 modules，**尚未 docker 部署/Playwright 抽查**）。本批做的：
> - **Batch 1 leaf**：`hooks/use-is-in-view.ts`、`contexts/AuthContext.tsx`、`animate-ui/primitives/animate/slot.tsx`
> - **animate-ui icons 全部 10 檔**（engine `icon.tsx` + 9 圖示；engine 是這批最硬的）
> - **小 leaf**：KoimLoader、LazyComponent、TransitionAnimation、SignatureSVG、BackToTopButton、NotFound、LanguagePicker、SpaceHeroBanner、Contact、JourneyTimeline、MobileNav、SchoolClubs
> - **4 個 .js 基礎檔 → .ts**：`i18n.ts`（45 處 import，關鍵）、`data/journeyData.ts`、`lib/articleCache.ts`、`lib/shikiHighlight.ts`
> - **順手修掉漂移進來的 4 個既有 lint error**（ScrollToTop / calendar / form.tsx）→ errors 重新歸 0
> - 部署後 Playwright/Edge 抽查全綠、0 console error：首頁 / about(journey+clubs 資料正確) / 切英文(i18n 動態 locale chunk) / blog/39(shiki 高亮 44 spans + articleCache) / 404 / mobile nav。
>
> **2026-06-23 session 續**：再轉 8 檔（DOM/CSS 星空特效群 + LazyEffects），tsc + build 全綠：
> - DOM/CSS（**非** R3F，標準 React/DOM/canvas）：MeteorShower、ForegroundStars、RandomComets、RandomShootingStars、RandomUFOs、SpaceParticles（canvas）、SpaceShuttle3D（純 SVG）
> - LazyEffects（其 lazy import 的 3 個轉完才解鎖）
> - ⚠️ **5 個「真 R3F」檔暫緩**（仍 .jsx，見下「R3F 型別地雷」）：TwinklingStars、BlackHole3D、Saturn3D、StarfieldWorkerScene、SpaceBackdrop

## 現況（前面批次已部署 + Playwright/Edge 驗過；本 session 新轉的 tsc+build 綠，待下次部署抽查）

- ✅ React Compiler 開了（Vite8 後走 `@rolldown/plugin-babel`+`reactCompilerPreset`）
- ✅ Vite 6→8（Rolldown）；`manualChunks`→`rolldownOptions.output.codeSplitting.groups`
- ✅ P0 Brand SEO（title/og 補 Koimsurai、WebSite schema、serve.cjs 不再刪站級 JSON-LD、sitemap lastmod 用 `.slice(0,10)`）；GSC 已驗證
- ✅ ESLint flat config（type-checked + react-hooks v6 含 compiler 規則 + @eslint-react + unused-imports + react/jsx-uses-vars）；**lint errors = 0**（剩 ~79 warning = backlog）
- ✅ tsconfig：strict、`lib` 含 ES2022、`baseUrl` 移除（TS6 deprecated）、paths `@/*`→`./src/*`
- ✅ `components.json` `tsx:true`（未來 shadcn add 給 .tsx）
- ✅ jsx→tsx 已完成：**foundations**（`lib/utils.ts`、`hooks/useInView.ts`、`hooks/useHtmlLang.ts`、`hooks/use-is-in-view` 還沒、見下）、**leaves**（CSSStarfield/NebulaBackground/PageVisibilityContext/ScrollToTop）、**整個 `src/components/ui/` 23 檔**、SEOHead/PostLinkModal/PhotoSelectorModal、4 utils（manifestLoader/n8n-transformer/monaco-editor/monaco-snippets）
- **進度：~139 ts/tsx ／ 剩 25 jsx + 2 js**（中型全清完，含 Watch/WatchLibrary/AdvancedEditor/Setup/Friends/Messages/InfoPage/ThoughtCard/Thinking*/ModernCard/IntroAnimation/ArticlePreviewCard）。**只剩**：5 R3F + spaceWorker/SpaceBackdrop、大內容檔(Activity/ArticleGenerator/Music/BooksManager/CollectionManager/CommentsManager/Anime/Cinema/Blog/BlogPost/PostEditor)、卡 BlogPost 的(AboutSite/History)、卡 ZeroGravity 的(Bookshelf)、entry(App/main)、死code(command/multiple-selector 跳過)、2 js。
> **(以下為更早的進度行，留作參考)**（2026-06-23/24 持續手動轉換，tsc+build 全綠）。剩下：**5 R3F**(BlackHole3D/Saturn3D/TwinklingStars/ZeroGravityLibrary/SpaceBackdrop/StarfieldWorkerScene + spaceWorker)、**大檔**(Activity/ArticleGenerator/Music/BooksManager/CollectionManager/CommentsManager/Anime/Cinema/Blog/BlogPost/PostEditor)、中型(AdvancedEditor/Setup/Watch/WatchLibrary/Friends)、被 BlogPost/ZeroGravity 卡住的(AboutSite/History/Bookshelf)、entry(App/main)、死code(command/multiple-selector 跳過)、2 js(prefetchPost/usePreviewLink 卡 BlogPost)。
> 已完成 Thinking 群(Comments/ThoughtCard/Thinking/ThinkingDetail)、InfoPage+Messages、ModernCard、IntroAnimation、ArticlePreviewCard、Header、全 admin 小中型。
> 剩下大致：admin 其餘(PostsList/UsersManager/AdminLayout/CategoriesManager/Dashboard/TagsManager/CommentsManager/CollectionManager/BooksManager/ArticleGenerator/PostEditor)、頁面元件(Header/AboutPage/AboutSite/Blog/Bookshelf/Cinema/Comments/Anime/Music/Activity/Watch/WatchLibrary/Thinking*/Messages/Friends/History/InfoPage/ModernCard/ThoughtCard/Expertise/IntroAnimation/AdvancedEditor/Setup/ArticlePreviewCard/BlogPost)、**5 R3F**(見上)、entry(App/main)、死code(command/multiple-selector 跳過)、2 js(prefetchPost/usePreviewLink 卡 BlogPost)。

### 本輪（手動逐批）又學到的眉角
- **react-router v7 的 `navigate()` 回傳 Promise**：當成 statement 要 `void navigate(...)`；在 event handler 裡要包 `onClick={() => { void navigate(x); }}`（no-floating-promises / no-misused-promises）。
- **async 函式直接當 event handler / setTimeout callback 會觸發 `no-misused-promises`**：包成 `onX={() => { void asyncFn(); }}`；setTimeout 用 `setTimeout(() => { void (async () => {...})(); }, ms)`。
- **`import.meta.env.VITE_API_URL` 是 `any`**（vite-env.d.ts 沒宣告）→ `(import.meta.env.VITE_API_URL as string | undefined) ?? '/api'` 才不會吃 no-unsafe-assignment。
- **SEOHead 的 `title` prop 已放寬成 `string | null`**（Hero 傳 `title={null}`）。
- React 19：`<img fetchpriority>` 要寫成 `fetchPriority`（camelCase）。
- `@tanstack/react-table` 的 `Column<TData, TValue>`、recharts 元件都自帶型別，直接 import type 用。

## 還沒轉（75 個 .jsx + 2 js）— 下階段

依目錄：components 46（含上述 5 個真 R3F）、admin 16、mega-menu 4、article-preview 2、admin/table 2、src 2（App.jsx/main.jsx）、workers 1（spaceWorker.jsx，要等 SpaceBackdrop 並改 `new URL('./spaceWorker.jsx')` 副檔名）、ui 2（**command/multiple-selector = 死 code、可不轉**）。

### ⚠️ R3F 型別地雷（5 檔暫緩的原因，下次認真處理前先讀）
真 R3F 檔（用 `@react-three/fiber`/`drei`/`three` 的：TwinklingStars / BlackHole3D / Saturn3D / StarfieldWorkerScene / SpaceBackdrop）轉 .tsx 會炸一串，根因是 three 生態的型別：
1. **`@types/three` 有兩份**：three 套件本身不附型別（package.json 無 `types`），所以 `import * as THREE from 'three'` 會 fallback 到頂層 `@types/three`（0.180）；但 drei/fiber 內部 peer 用 `@types/three@0.181`。兩份 = `Points`/`BufferGeometry` 名義不相容（ref、geometry prop 都對不上）。
2. **drei 對 `BufferGeometry` 加了 three-mesh-bvh augmentation**（`computeBoundsTree`/`disposeBoundsTree`），所以 `<Points geometry={new THREE.BufferGeometry()}>` 的 prop 型別對不上。
3. **`shaderMaterial` 會觸發 TS "excessive stack depth"**（R3F intrinsic 元素 prop 型別遞迴太深，skipLibCheck 也救不了）。
4. **R3F 全域 JSX augmentation 會連帶弄壞 slot.tsx**（`<Base ref={...}>` 的 ref 變 `never`）——一 import fiber 就會發生，不限 R3F 檔本身。
- 我試過 `pnpm.overrides` 把 `@types/three` 統一到 0.181 但沒生效（pnpm 說 already up to date，頂層仍 0.180），已還原。**新發現（2026-06-24）**：`.pnpm` store 內只剩 `@types+three@0.181.0`，且 `pnpm why @types/three` 顯示「沒有任何套件要求 0.180」（只有 maath/stats-gl peer 要 0.181）。但頂層 `node_modules/@types/three` 仍是 0.180 的「實體資料夾」（非 symlink）→ 高度疑似先前 install 殘留的 stale 目錄。**下次可試**：把 `@types/three: "0.181.0"` 加進 devDependencies（直接依賴，讓 pnpm 把 0.181 hoist 到頂層）或 `rm -rf node_modules/@types/three && pnpm install`，讓頂層 = drei 用的同一份；去重後再處理 BVH/shaderMaterial 的 cast。**下次要做的事**：(a) 真正去重 `@types/three`（可能要刪頂層那份/用 `pnpm dedupe` 或精準 override + `--force`），確認 `import from 'three'` 與 drei 用同一份；(b) drei geometry prop 用 `as` 或改抓 `React.ComponentRef<typeof Points>`；(c) shaderMaterial 可能要 `{...({} )}` 或拆 props 繞 stack depth；(d) slot.tsx 的 `<Base>` ref 可能要 `createElement` 或 cast。先在一個檔（TwinklingStars）試通整套，再套其餘 4 檔 + spaceWorker。
剩 2 個 .js：`lib/prefetchPost.js`、`article-preview/usePreviewLink.js`——**都卡在 BlogPost.jsx 那條鏈**（prefetchPost 動態 `import('../components/BlogPost')`；usePreviewLink import prefetchPost + ArticlePreviewContext.jsx）。要等 BlogPost 轉完才能轉這 2 個 .js + usePreviewLink 的消費者。

### ⚠️ 依賴排序的新教訓（leaf-up 要連 .js 跟 dynamic import 一起看）
- `allowJs` 是 **off**：任何 .tsx/.ts **import 到 .js 或 .jsx 都會 TS2307/隱式 any**。所以 leaf 判斷不能只看 .jsx，**也要看 .js 靜態 import 跟 `import('...')` 動態 import**。
- 已知被「動態 import .jsx」卡住的：`LazyEffects.jsx`（lazy import SpaceParticles/MeteorShower/SpaceShuttle3D）、`lib/prefetchPost.js`（import BlogPost）。這些要等被指的 .jsx 先轉。
- 找 leaf 的笨方法：對每個 .jsx 抓它的本地 import（`@/` 或相對路徑），看有沒有還指到 .jsx/.js；沒有的就是現在可轉的 leaf。**但記得 tsc 才是最終裁判**——轉完一批跑 tsc，會立刻抓出漏看的 .js / dynamic import 依賴；報錯就把那檔退回 .jsx 延後。

**建議順序（由 leaf 往上，確保每批 tsc 綠）**：
1. 剩餘 leaf：`hooks/use-is-in-view.jsx`（framer margin 型別要 cast）、`contexts/AuthContext.jsx`、`workers/spaceWorker.jsx`、animate-ui/icons（10，vendored 圖示、機械）、animate-ui/primitives
2. 小型展示元件（CSSStarfield 那種等級的）
3. 一般元件（components/*）
4. pages / 大型互動元件
5. **最後**才碰巨檔（會冒最多型別決策）：BlogPost.jsx(82KB)、admin/PostEditor(51KB)、admin/ArticleGenerator(37KB)、Activity(35KB)、Music(32KB)、Blog(27KB)、admin/BooksManager(25KB)、admin/CommentsManager(23KB)、Comments(23KB)、ZeroGravityLibrary(20KB)、Anime(20KB)、admin/CollectionManager(19KB)

## 怎麼轉（每檔 recipe）

1. 讀 .jsx；**有 JSX → `.tsx`、無 JSX（純 hook/util/worker）→ `.ts`**。
2. 加 props 型別（`interface XProps {...}`）；forwardRef 用 `React.forwardRef<ElementType, Props>`。
3. 常見修法：
   - `await res.json()` 是 `any` → `as { ... }` 上型別
   - `||` 用在可能 null/undefined → `??`（prefer-nullish-coalescing 是 error）
   - async 傳給 event handler / JSX 屬性 → 包 `() => { void fn() }`（no-misused-promises）
   - `catch (e) {}` 未用 e → `catch {}` + 註解（no-empty）
   - `useLocation().state` 是 any → `(state as {...} | null)?.x`
   - boolean filter 的 `a || b`（操作元是 `boolean|undefined`）→ `(a ?? false) || ...`
4. **依賴順序**：某檔 import 的本地檔若還是 .jsx → 先轉那個依賴，否則 tsc 報 implicit-any（TS7016）。
5. 刪掉舊 .jsx（`rm`）。
6. **每批驗**：`pnpm exec tsc --noEmit -p tsconfig.json`（**必須維持 0**）；每幾批跑一次 `pnpm build`。

## 已知地雷
- 轉換會**浮出從沒被 tsc 檢查過的舊 bug**（已遇：calendar 是 react-day-picker v8 寫法但裝的是 v9 → 改用 `Chevron` component；sheet import 沒裝的 `@radix-ui/react-icons` → 換 lucide `X`）。遇到就地修，別假裝沒看到。
- `command.jsx`/`multiple-selector.jsx`：死 code，留著無害（tsc 不檢查沒被 .tsx import 的 .jsx）。
- **vendored 原則（使用者定）**：shadcn / animate-ui / registry 抄進來的，**手動轉、保留原碼、不用 CLI 重拉覆蓋、不跳過**。
- warning backlog（現 ~195，本批 vendored animate-ui 又加了一些）：exhaustive-deps / only-export-components / set-state-in-effect / no-unnecessary-condition 等，**逐案、勿盲改**（可能藏真 bug 或改了會出事）。

### 本批新踩到的型別/lint 眉角（下次直接照抄）
- **lint errors=0 是會漂的**：plugin 版本變動會冒出新 error（本批遇到 `consistent-type-definitions`=用 interface 別用 type、`non-nullable-type-assertion-style`=用 `!` 別 `as T`、`no-nested-component-definitions`、`no-unsafe-assignment`）。每批收尾請 `pnpm exec eslint src | tail -2` 確認 **0 errors**，漂掉的順手修。
- **framer-motion 12 沒 export `AnimationControls`**：用 `type AnimationControls = ReturnType<typeof useAnimation>`。
- **variant 物件的 `ease: 'easeInOut'`**：物件不標型別時 ease 會被 widen 成 `string` → 不符 framer `Easing`。解法：`const v: Variants = {...}` 或整包 `as const`（inline 寫在 JSX 屬性裡則會被 contextual typing 自動收斂，免處理）。
- **CSS 自訂變數**（`style={{ '--dot': x }}`）→ cast `as React.CSSProperties`。
- **DOM `inert`** 在 React 19 型別是 `boolean`（不是空字串）：`inert={!open}` 不要 `inert={!open ? '' : undefined}`。
- **`consistent-type-imports`（error）禁止 `typeof import('x')` 型別標註**：改成頂層 `import type {...} from 'x'`。（shiki 型別：`HighlighterCore`、`LanguageRegistration` 都在 `shiki/core`。）
- **`no-floating-promises`（error）**：fire-and-forget 的 promise 前面加 `void`（如 `void i18n.changeLanguage(code)`、`void ensureLocale(...)`）。
- **monkey-patch 方法**（i18n.changeLanguage 被覆寫）：整包 `as typeof i18n.changeLanguage` 收斂簽章。
- **空 arrow `.catch(() => {})`** 觸發 `no-empty-function`：補一句註解 `() => { /* ... */ }`。
- **`prefer-nullish-coalescing`（error）只在 LHS 可能 null/undefined 時觸發**；因為沒開 `noUncheckedIndexedAccess`，`Record<string,T>[key]` 回傳非 undefined，所以 `map[key] || fallback` 不會被 prefer-nullish 擋（但會吃一個 `no-unnecessary-condition` warning，backlog OK）。可 null 的才換 `??`。
- **vendored animate-ui 引擎**（`icon.tsx`/`slot.tsx`）天生違反 `@eslint-react/static-components`（render 期 motion.create）跟 `@eslint-react/rules-of-hooks`（getVariants 在非 hook 函式讀 context）→ 在該行加 `// eslint-disable-next-line <rule> -- 理由`，**保留原碼別重構**（vendored 原則）。`react-hooks/rules-of-hooks` 跟 `@eslint-react/rules-of-hooks` 是兩條不同規則，要一起 disable。
- **`@animateicons/react`** 有型別：`RocketIconHandle` 等 handle 型別可 `import { RocketIcon, type RocketIconHandle }`，ref 用 `useRef<RocketIconHandle>(null)`。

### 建議下一步順序
1. R3F/three 群（共用 three 型別，建議一起做）：`TwinklingStars`→`ForegroundStars`/`MeteorShower`/`RandomComets`/`RandomShootingStars`/`RandomUFOs`/`SpaceParticles`/`BlackHole3D`/`Saturn3D`/`SpaceShuttle3D`→`StarfieldWorkerScene`→`spaceWorker`（worker entry，記得 `SpaceBackdrop` 裡 `new URL('./spaceWorker.jsx')` 要改副檔名）→`LazyEffects`。
2. 一般 components（剩餘 ~44）。
3. admin + table（recharts / tanstack-table 型別）。
4. **最後**巨檔：BlogPost(82KB)、admin/PostEditor、ArticleGenerator、Activity、Music、Blog、admin/BooksManager、CommentsManager、Comments、ZeroGravityLibrary、Anime、CollectionManager；轉完 BlogPost 才能收尾 `prefetchPost.js`/`usePreviewLink.js`。最後才 `App.jsx`/`main.jsx`（main 記得 `import './i18n'` 已是 .ts，OK）。

## 驗證能力（這台）
- **Playwright 用 Edge**（`.mcp.json` 已設 `--browser msedge`；Chrome 在此機裝不起來）。可 navigate koimsurai.com、抓 console error、截圖。
- **docker 可用**（看得到 web-frontend/web-backend 容器）；**curl 可用**。
- 流程：改完 → 使用者 docker build 部署 → Playwright/Edge 抽查（首頁、bookshelf、activity、admin 表單）。type-only 改動 runtime 幾乎不變，tsc+build 綠就很穩。

## 相關檔
- 完整遷移計畫書：`web-ssg-poc/MIGRATION_PLAN.md`（P0–P4 全貌：後端 Rust、TanStack Start SSG、specta、monorepo）
- 注意：`web-ssg-poc/` 是 TanStack Start SSG 的 PoC（驗證過可行），跟這次 TS 遷移是不同階段。
