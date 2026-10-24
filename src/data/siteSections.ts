// 站上的分區：導覽列（layout/SiteNav）與首頁的五顆衛星（home/HomeOrbit）用同一份。
// 文字在語系檔的 siteNav.<key>；caps 是旁邊那行等寬的英文小字，各語系一樣。

export interface SiteSection {
  key: string;
  to: string;
  caps: string;
  /** 去掉語系前綴、沒有開頭斜線的路徑，屬於這一區就回 true */
  match: (bare: string) => boolean;
}

const under =
  (...roots: string[]) =>
  (bare: string) =>
    roots.some((r) => bare === r || bare.startsWith(`${r}/`));

/** 五個主要分區：導覽列上的五個字、首頁的五顆衛星 */
export const MAIN_SECTIONS: SiteSection[] = [
  { key: 'notes', to: '/blog', caps: 'NOTES', match: under('blog') },
  { key: 'moments', to: '/thinking', caps: 'MOMENTS', match: under('thinking') },
  { key: 'works', to: '/portfolio', caps: 'WORK', match: under('portfolio') },
  // 收藏：在看、書櫃、在聽合成一頁，網址沿用 /watch（舊的 /bookshelf、/music 轉到那一區）
  { key: 'collection', to: '/watch', caps: 'COLLECTION', match: under('watch', 'bookshelf', 'music') },
  // 關於：跟「我」有關的幾頁（ABOUT_SECTIONS）也算在這一區，導覽列的琥珀點停在「關於」
  {
    key: 'about',
    to: '/about',
    caps: 'ABOUT',
    match: under('about', 'setup', 'friends', 'messages', 'history', 'activity'),
  },
];

/** 收在「關於」選單裡的頁面 */
export const ABOUT_SECTIONS: SiteSection[] = [
  { key: 'setup', to: '/setup', caps: 'SETUP', match: under('setup') },
  { key: 'log', to: '/history', caps: 'LOG', match: under('history', 'activity') },
  { key: 'friends', to: '/friends', caps: 'FRIENDS', match: under('friends') },
  { key: 'messages', to: '/messages', caps: 'MESSAGES', match: under('messages') },
];

/** 收在「更多」裡的頁面 */
export const MORE_SECTIONS: SiteSection[] = [
  { key: 'photos', to: '/photos', caps: 'PHOTOS', match: under('photos') },
  { key: 'colophon', to: '/about-site', caps: 'COLOPHON', match: under('about-site') },
];
