-- web_vitals 補三個脈絡欄位（2026-10）：
--   nav_type：這次載入是怎麼來的（navigate / reload / back-forward / back-forward-cache / prerender / restore），
--             站內換頁的 TX 記 spa。開場的長短在三種載入方式下不一樣，混在一起看不出問題。
--   detail：各 metric 自己的細節，斜線隔開。INP 是 `互動類型/輸入延遲/處理/畫面更新`（毫秒），
--           TX 是 `幀數/長幀數/總時長`，BOOT 是 `ring` 或 `collapse`（首頁交棒給 3D 土星，或環收回點裡）。
--   gpu：hw（有硬體加速）或 none（GPU 探測是軟體渲染）；還沒探測完是 NULL。效能差最多的就是這條分界。
-- 新的兩個 metric：TX（站內換頁，值是最長那一幀的毫秒）、BOOT（開場退場、讀者真正看到頁面的時間）。
ALTER TABLE web_vitals ADD COLUMN nav_type TEXT;
ALTER TABLE web_vitals ADD COLUMN detail TEXT;
ALTER TABLE web_vitals ADD COLUMN gpu TEXT;
