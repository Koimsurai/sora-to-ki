-- 碎念的動詞（2026-10 後台提案的「碎念」頁）：「Koimsurai 看了」「讀了」「聽了」「分享」。
--
-- 存的是 key 不是字：前台有五個語系，「看了」要各自翻。NULL 就是一般的碎念（沒有動詞）。
--   watched / read / listened / played / shared
-- 附上的作品記在原本的 ref_type = 'media' / ref_json（kind 是 film、tv、anime、book、track），
-- 所以只多這一欄。
ALTER TABLE thoughts ADD COLUMN verb TEXT;
