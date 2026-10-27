-- LCP 花在哪一段：ttfb/資源載入延遲/資源下載/繪製延遲（毫秒，斜線隔開，web-vitals 的 LCP attribution）。
--
-- 為什麼要：2026-10 推文帶進一波大陸讀者之後，手機 FCP 2.6 秒、LCP 卻是 5.6 秒，中間 3 秒不知道
-- 卡在哪。用模擬網路量不出來（實驗室裡 LCP 等於 FCP），只能靠真實讀者的瀏覽器回報。
-- LCP 元素本身記在既有的 target 欄（原本只有 CLS 用）。
ALTER TABLE web_vitals ADD COLUMN lcp_phases TEXT;
