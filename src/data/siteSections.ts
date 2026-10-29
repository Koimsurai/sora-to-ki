// 頁面登記表：站上每一個有自己位置的頁面在這裡登記一筆，其他地方都從這裡讀。
//   導覽列與「關於」「更多」選單（layout/SiteNav、NavMenus）、首頁的衛星（home/HomeOrbit）、
//   命令面板（layout/CommandPalette）、sitemap 與 llms.txt（server/routes）、站台設定的頁面開關。
// 文字在語系檔的 siteNav.<key>；caps 是旁邊那行等寬的英文小字，各語系一樣。
//
// ⚠ 這個檔不 import 任何東西：server/routes 用相對路徑讀它，不走 `@/` alias。
// ⚠ 後端有兩份跟這裡對應的清單（handlers/site_config.rs 的 TOGGLEABLE_PAGES、handlers/og.rs 的 PAGES），
//   siteSections.test.ts 會比對，改了這裡記得兩邊一起改。

export interface SiteSection {
  key: string;
  to: string;
  caps: string;
  /** 去掉語系前綴、沒有開頭斜線的路徑，屬於這一區就回 true */
  match: (bare: string) => boolean;
}

export interface PageDef extends SiteSection {
  /** 放在哪裡：首頁、導覽列的主要分區（＝首頁的一顆衛星）、「關於」選單、「更多」選單 */
  group: 'home' | 'main' | 'about' | 'more';
  /** 站台設定能不能關掉這一頁（後端 TOGGLEABLE_PAGES 要一致） */
  toggleable: boolean;
  /** 命令面板的搜尋別名：打英文、打舊名字都找得到 */
  keywords: string;
  /** 有的話列進 sitemap */
  sitemap?: { priority: string; changefreq: string };
  /** 有的話列進 llms.txt 的「主要頁面」 */
  llms?: string;
}

const under =
  (...roots: string[]) =>
  (bare: string) =>
    roots.some((r) => bare === r || bare.startsWith(`${r}/`));

export const PAGES: PageDef[] = [
  {
    key: 'home',
    to: '/',
    caps: 'HOME',
    match: (bare) => bare === '',
    group: 'home',
    toggleable: false,
    keywords: 'home index 首頁 主頁',
    sitemap: { priority: '1.0', changefreq: 'weekly' },
  },

  // ── 主要分區：導覽列上的五個字、首頁的五顆衛星（由內到外）──
  {
    key: 'notes',
    to: '/blog',
    caps: 'NOTES',
    match: under('blog'),
    group: 'main',
    toggleable: false,
    keywords: 'blog posts notes 文章 手記 日記',
    sitemap: { priority: '0.9', changefreq: 'daily' },
    llms: '技術文章：開發、除錯、自架服務、AI 應用的長篇實作紀錄',
  },
  {
    key: 'moments',
    to: '/thinking',
    caps: 'MOMENTS',
    match: under('thinking'),
    group: 'main',
    toggleable: false,
    keywords: 'thinking moments 碎念 想法',
  },
  {
    key: 'works',
    to: '/portfolio',
    caps: 'WORK',
    match: under('portfolio'),
    group: 'main',
    toggleable: false,
    keywords: 'portfolio works projects 作品 專案',
  },
  // 收藏：在看、書櫃、在聽合成一頁，網址沿用 /watch（舊的 /bookshelf、/music 轉到那一區）
  {
    key: 'collection',
    to: '/watch',
    caps: 'COLLECTION',
    match: under('watch', 'bookshelf', 'music'),
    group: 'main',
    toggleable: false,
    keywords: 'collection watch anime 動畫 電影 影集 books 書櫃 閱讀 music spotify 音樂',
    sitemap: { priority: '0.6', changefreq: 'weekly' },
    llms: '收藏：看過的動畫、電影、影集，書櫃，最常聽的音樂',
  },
  // 關於：跟「我」有關的幾頁（group: 'about'）也算在這一區，導覽列的琥珀點停在「關於」
  {
    key: 'about',
    to: '/about',
    caps: 'ABOUT',
    match: under('about', 'setup', 'messages', 'history', 'activity'),
    group: 'main',
    toggleable: false,
    keywords: 'about me 關於 自我介紹',
    sitemap: { priority: '0.7', changefreq: 'monthly' },
    llms: '關於作者',
  },

  // ── 收在「關於」選單裡 ──
  {
    key: 'setup',
    to: '/setup',
    caps: 'SETUP',
    match: under('setup'),
    group: 'about',
    toggleable: true,
    keywords: 'setup gear 設備 工作站',
    sitemap: { priority: '0.5', changefreq: 'monthly' },
    llms: '軟硬體配置',
  },
  {
    key: 'log',
    to: '/history',
    caps: 'LOG',
    match: under('history', 'activity'),
    group: 'about',
    toggleable: true,
    keywords: 'log history activity 航行日誌 歷史 動態',
    sitemap: { priority: '0.5', changefreq: 'daily' },
  },
  {
    key: 'messages',
    to: '/messages',
    caps: 'MESSAGES',
    match: under('messages'),
    group: 'about',
    toggleable: true,
    keywords: 'messages 留言 guestbook contact',
  },

  // ── 收在「更多」裡 ──
  {
    key: 'photos',
    to: '/photos',
    caps: 'PHOTOS',
    match: under('photos'),
    group: 'more',
    toggleable: true,
    keywords: 'photos gallery 照片 相簿 攝影',
    sitemap: { priority: '0.7', changefreq: 'weekly' },
    llms: '攝影作品',
  },
  {
    key: 'friends',
    to: '/friends',
    caps: 'FRIENDS',
    match: under('friends'),
    group: 'more',
    toggleable: true,
    keywords: 'friends links 朋友 友鏈',
  },
  {
    key: 'colophon',
    to: '/about-site',
    caps: 'COLOPHON',
    match: under('about-site'),
    group: 'more',
    toggleable: true,
    keywords: 'colophon about-site 此站點 關於本站 問答',
  },
];

/** 五個主要分區：導覽列上的五個字、首頁的五顆衛星 */
export const MAIN_SECTIONS: PageDef[] = PAGES.filter((p) => p.group === 'main');

/** 收在「關於」選單裡的頁面 */
export const ABOUT_SECTIONS: PageDef[] = PAGES.filter((p) => p.group === 'about');

/** 收在「更多」裡的頁面 */
export const MORE_SECTIONS: PageDef[] = PAGES.filter((p) => p.group === 'more');

/** 站台設定能關掉的頁面 */
export const TOGGLEABLE_KEYS: string[] = PAGES.filter((p) => p.toggleable).map((p) => p.key);
