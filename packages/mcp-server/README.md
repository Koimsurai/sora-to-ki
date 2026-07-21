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

## 設定（Claude Code）

專案根目錄已有 [`.mcp.json`](../../.mcp.json)，開啟專案時 Claude Code 會自動偵測。憑證走環境變數
展開（**不寫進 .mcp.json**），啟動 Claude Code 前先匯出（可從 `.env.backend` 取）：

```bash
export KOIMSURAI_ADMIN_USERNAME="$(grep -oP '^ADMIN_USERNAME=\K.*' .env.backend)"
export KOIMSURAI_ADMIN_PASSWORD="$(grep -oP '^ADMIN_PASSWORD=\K.*' .env.backend)"
# 選用：後端不在預設位址時
# export KOIMSURAI_API_URL=http://127.0.0.1:3002
```

或改用預先簽好的 JWT：`export KOIMSURAI_ADMIN_TOKEN=<jwt>`（跳過帳密登入）。

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
