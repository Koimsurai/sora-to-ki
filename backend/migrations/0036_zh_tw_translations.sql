-- 繁中譯文欄。原本繁中一定是原稿（posts.title、categories.name 這些本體欄位），所以沒有自己的譯文欄；
-- 預設語系可以換之後，英文或日文原稿的站也要能補繁中譯文，跟 en／ja／ko／zh_cn 同一套規則。
-- 原稿就是繁中的文章不會用到這幾欄（原稿那個語系一律讀本體欄位）。
ALTER TABLE posts ADD COLUMN title_zh_tw TEXT;
ALTER TABLE posts ADD COLUMN content_zh_tw TEXT;
ALTER TABLE posts ADD COLUMN excerpt_zh_tw TEXT;
ALTER TABLE categories ADD COLUMN name_zh_tw TEXT;
ALTER TABLE categories ADD COLUMN description_zh_tw TEXT;
ALTER TABLE categories ADD COLUMN short_description_zh_tw TEXT;
ALTER TABLE tags ADD COLUMN name_zh_tw TEXT;
