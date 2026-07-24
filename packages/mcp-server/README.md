# @koimsurai/mcp-server

koimsurai 後台 **MCP server（stdio）**——把後端的 admin REST API 包成 MCP 工具，讓 Claude
（Code / Desktop）能直接讀寫網站後台：發文、改文、發布、查統計、管分類/標籤/碎念、觸發相簿同步。

## 架構

```
Claude Code ──啟動子程序──▶ mcp-server (stdio)
                                  │  admin JWT（登入自動取得、記憶體快取）
                                  ▼
                    127.0.0.1:3002  /api/admin/*  (Rust axum backend)
```

- **薄包裝層**：不改後端、不進正式服務；只是呼叫既有的 28 個 admin 端點。
- **stdio**：不對外開任何 port、無需 MCP OAuth。server 與後端在同一台機器，直連 loopback。
- **認證**：啟動時用 `ADMIN_USERNAME`/`ADMIN_PASSWORD` 打 `/api/auth/login` 換 JWT，快取於記憶體、
  401 自動重登一次。token 不落地。

## 設定（Claude Code，在 server 上）

⚠️ **一定要用跑在 server 那台的 Claude Code**（後端 `127.0.0.1:3002` 只綁 loopback，
出不了那台機器；開發機的 Claude Desktop 連不到、也看不到這份 `.mcp.json`）。

專案根有 [`.mcp.json`](../../.mcp.json)，Claude Code 開啟專案時**自動偵測**、跳出來讓你允許
`koimsurai-admin`。憑證**零設定**——server 上直接讀後端同一份 `.env.backend`（`ADMIN_USERNAME`
/ `ADMIN_PASSWORD`），不必碰環境變數。

> `.mcp.json` 是在既有 session 啟動後才建立的話，該 session 不會熱載入 → **開一個新的
> Claude Code session** 才會偵測到。

### 覆寫（可選）

環境變數優先於 `.env.backend`；要覆寫時才設：

| 變數 | 預設 | 說明 |
|---|---|---|
| `KOIMSURAI_API_URL` | `http://127.0.0.1:3002` | 後端位址 |
| `KOIMSURAI_ADMIN_USERNAME` / `_PASSWORD` | 讀 `.env.backend` | 後台帳密 |
| `KOIMSURAI_ADMIN_TOKEN` | — | 預簽 JWT（設了就跳過登入） |
| `KOIMSURAI_ENV_FILE` | `./.env.backend` | 憑證檔路徑 |

## 環境變數

| 變數 | 預設 | 說明 |
|---|---|---|
| `KOIMSURAI_API_URL` | `http://127.0.0.1:3002` | 後端位址 |
| `KOIMSURAI_ADMIN_USERNAME` | — | 後台帳號（登入用） |
| `KOIMSURAI_ADMIN_PASSWORD` | — | 後台密碼（登入用） |
| `KOIMSURAI_ADMIN_TOKEN` | — | 預簽 JWT（設了就跳過登入） |

## 工具（22）

- **文章**：`list_posts` / `get_post` / `create_post` / `update_post` / `set_post_status` /
  `delete_post` / `generate_post_zh_cn`
- **統計健康**：`site_stats` / `vitals_stats` / `health`
- **分類**：`list_categories` / `create_category` / `update_category` / `delete_category`
- **標籤**：`list_tags` / `create_tag` / `update_tag` / `delete_tag`
- **碎念**：`create_thought` / `update_thought` / `delete_thought`
- **相簿**：`gallery_sync`

### 多語系（i18n）

站台支援 5 語：`zh-TW`（來源）／`zh-CN`／`en`／`ja`／`ko`。**沒有獨立的 i18n 工具**——譯文是
`create_post` / `update_post` 的參數：

- `source_language`：來源語言（`title`/`content`/`excerpt` 是哪一語寫的），預設 `zh-TW`。
- 譯文欄（皆可選）：`title_en` / `content_en` / `excerpt_en`、`title_ja` / `content_ja` / `excerpt_ja`、
  `title_ko` / `content_ko` / `excerpt_ko`、`title_zh_cn` / `content_zh_cn` / `excerpt_zh_cn`。
- **簡體 `zh-CN` 通常不手填**：建好繁體後呼叫 `generate_post_zh_cn`（OpenCC 繁→簡自動生成）。
- 某語譯文留空 → 前端該語自動 fallback 回來源語言，不會壞頁。

> ⚠️ 破壞性 / 有副作用的工具（`delete_*`、`set_post_status` 發布、`create_post` 帶
> `send_newsletter=true` 會寄信給訂閱者、`gallery_sync` 耗時）在描述中都有標注；MCP client
> 呼叫前會讓你確認。

## 開發

```bash
pnpm --filter @koimsurai/mcp-server start       # tsx 直接跑
pnpm --filter @koimsurai/mcp-server typecheck   # tsc --noEmit
pnpm --filter @koimsurai/mcp-server build        # → dist/（.mcp.json 用 tsx 跑源碼，不需先 build）
```

新增工具：在 [`src/tools.ts`](src/tools.ts) 的 `makeTools()` 陣列加一筆（`name` /
`description` / `inputSchema` JSON Schema / `handler`），無需動 `index.ts`。
