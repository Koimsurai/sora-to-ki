// 這個站是誰（網址、站名、作者、聯絡方式），給不在 React 裡的程式用：路由的 head()、
// SEO 與 JSON-LD 的組裝、站內連結的判斷。元件裡請用 data/siteConfig 的 useSiteConfig()。
//
// 值來自後端的站台設定（/api/site/config）：router.tsx 盯著那個查詢的快取，一有資料就寫進來（伺服器與瀏覽器各一份）。
// 寫進來之前（或後端連不上）用部署層的 SITE_URL 與中性的預設值——不會是原作者的站。
import type { SiteConfig } from '@koimsurai/api-types';

// 沒設與設成空字串都當沒設
const envUrl = (typeof process === 'undefined' ? '' : process.env.SITE_URL) ?? '';

let current: SiteConfig = {
  url: (envUrl === '' ? 'http://localhost' : envUrl).replace(/\/+$/, ''),
  name: 'My Site',
  author: 'My Site',
  description: '',
  disabled_pages: [],
  email: '',
  github: '',
  default_locale: 'zh-TW',
  locales: ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'],
  theme: 'saturn',
};

/** root 的 beforeLoad 用：後端回來的設定。站名是空的（後端連不上時的退路）就不採用 */
export function setSiteIdentity(config: SiteConfig): void {
  if (!config.name) return;
  current = { ...config, url: (config.url || current.url).replace(/\/+$/, '') };
}

/** 站台網址，不帶結尾的 / */
export const siteUrl = (): string => current.url;
/** 站台網址的 host，去掉 www.（判斷一個連結是不是站內的） */
export const siteHost = (): string => {
  try {
    return new URL(current.url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
/** 這個 host 是不是自己的站（含子網域，例如 archive.） */
export function isOwnHost(host: string): boolean {
  const own = siteHost();
  const bare = host.replace(/^www\./, '');
  return own !== '' && (bare === own || bare.endsWith(`.${own}`));
}
/** 一個絕對網址是不是連回自己的站；相對路徑或解析不了的回 false */
export function isOwnUrl(href: string): boolean {
  try {
    return isOwnHost(new URL(href).hostname);
  } catch {
    return false;
  }
}
export const siteName = (): string => current.name;
export const siteAuthor = (): string => current.author;
/** 首頁的 <title> 與 og:site_name：作者名跟站名不同時是「站名 · 作者」 */
export const siteTitle = (): string =>
  current.author && current.author !== current.name ? `${current.name} · ${current.author}` : current.name;
export const siteGithub = (): string => current.github;

/** 這套程式（sora-to-ki）的 repo，不是站長的 */
export const SOFTWARE_REPO = 'https://github.com/Koimsurai/sora-to-ki';
/** 是不是原站：站台設定裡的 GitHub 就是這套程式的作者 */
export const isOriginSite = (github: string): boolean => github.toLowerCase() === 'koimsurai';
