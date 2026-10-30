// 後台「頁面」的分頁：一頁一個。路由（validateSearch）與管理頁共用，所以單獨一個檔。
// ⚠ 這支只放純資料：路由定義在前台的主 bundle 裡，這裡 import 任何後台的東西（例如後台的字串）
// 都會跟著進到每一位讀者下載的程式碼。分頁名與語系名在 pageLabels.ts
export const PAGE_TABS = [{ key: 'about' }, { key: 'works' }, { key: 'log' }, { key: 'qa' }, { key: 'setup' }] as const;

export type PageTab = (typeof PAGE_TABS)[number]['key'];
