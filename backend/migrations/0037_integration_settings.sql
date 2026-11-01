-- 收藏來源的設定：站長在後台填的金鑰與同步開關（backend/src/integrations.rs）。
-- name 就是對應的環境變數名（SIMKL_CLIENT_ID、ENABLE_SIMKL_SYNC…）：這裡有的優先，沒有的看環境變數，
-- 所以原本寫在 .env.backend 的站不用搬，照樣能用。
CREATE TABLE IF NOT EXISTS integration_settings (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
