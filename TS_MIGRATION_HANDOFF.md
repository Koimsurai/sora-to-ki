# TS 遷移交接（給下個 session）

> 最後更新：2026-06-22。這份是 `web/` 前端 JS→TS 遷移的接力棒。memory 也有摘要（project_web_rust_tanstack_migration），但這份是**可直接照做的細節**。

## 現況（全部已部署 + Playwright/Edge 驗過、tsc + build 全程綠）

- ✅ React Compiler 開了（Vite8 後走 `@rolldown/plugin-babel`+`reactCompilerPreset`）
- ✅ Vite 6→8（Rolldown）；`manualChunks`→`rolldownOptions.output.codeSplitting.groups`
- ✅ P0 Brand SEO（title/og 補 Koimsurai、WebSite schema、serve.cjs 不再刪站級 JSON-LD、sitemap lastmod 用 `.slice(0,10)`）；GSC 已驗證
- ✅ ESLint flat config（type-checked + react-hooks v6 含 compiler 規則 + @eslint-react + unused-imports + react/jsx-uses-vars）；**lint errors = 0**（剩 ~79 warning = backlog）
- ✅ tsconfig：strict、`lib` 含 ES2022、`baseUrl` 移除（TS6 deprecated）、paths `@/*`→`./src/*`
- ✅ `components.json` `tsx:true`（未來 shadcn add 給 .tsx）
- ✅ jsx→tsx 已完成：**foundations**（`lib/utils.ts`、`hooks/useInView.ts`、`hooks/useHtmlLang.ts`、`hooks/use-is-in-view` 還沒、見下）、**leaves**（CSSStarfield/NebulaBackground/PageVisibilityContext/ScrollToTop）、**整個 `src/components/ui/` 23 檔**、SEOHead/PostLinkModal/PhotoSelectorModal、4 utils（manifestLoader/n8n-transformer/monaco-editor/monaco-snippets）
- **進度：51 ts/tsx ／ 剩 108 jsx**

## 還沒轉（108 個 .jsx）— 下階段

依目錄：components 66、admin 16、animate-ui/icons 10、mega-menu 4、article-preview 2、admin/table 2、src 2（App.jsx/main.jsx）、workers 1、hooks 1（use-is-in-view.jsx）、contexts 1（AuthContext.jsx）、ui 2（**command/multiple-selector = 死 code、沒人 import、可不轉**）、animate-ui/primitives 1。

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
- warning backlog（~79）：exhaustive-deps / only-export-components / set-state-in-effect 等，**逐案、勿盲改**（可能藏真 bug 或改了會出事）。

## 驗證能力（這台）
- **Playwright 用 Edge**（`.mcp.json` 已設 `--browser msedge`；Chrome 在此機裝不起來）。可 navigate koimsurai.com、抓 console error、截圖。
- **docker 可用**（看得到 web-frontend/web-backend 容器）；**curl 可用**。
- 流程：改完 → 使用者 docker build 部署 → Playwright/Edge 抽查（首頁、bookshelf、activity、admin 表單）。type-only 改動 runtime 幾乎不變，tsc+build 綠就很穩。

## 相關檔
- 完整遷移計畫書：`web-ssg-poc/MIGRATION_PLAN.md`（P0–P4 全貌：後端 Rust、TanStack Start SSG、specta、monorepo）
- 注意：`web-ssg-poc/` 是 TanStack Start SSG 的 PoC（驗證過可行），跟這次 TS 遷移是不同階段。
