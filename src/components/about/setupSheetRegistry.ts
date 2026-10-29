// 設備頁可以選的圖紙：內建的四張（about/setupSheets）＋自架的人放在 custom/setup/ 的圖紙包。
// 圖紙包是一支 .ts，default export 一張圖紙（或一串），底稿與部件分區圖寫相對那支檔案的路徑，
// 這裡在建置時把它們收進來、把路徑換成網址。格式見 custom/setup/README.md。
//
// 只有 app 用（import.meta.glob 是 vite 的）；scripts/setup-part-maps.ts 自己讀 custom/setup/。
import { artSrc, BUILTIN_SHEETS, partsSrc, type Sheet } from './setupSheets';

/** 執行期用的圖紙：底稿與分區圖的網址都解好了 */
export interface ResolvedSheet extends Sheet {
  artUrl: string;
  mapUrl: string | null;
  builtin: boolean;
}

const packs = import.meta.glob<{ default: Sheet | Sheet[] }>('/custom/setup/*.ts', { eager: true });
const assets = import.meta.glob<string>('/custom/setup/**/*.{webp,png,jpg,jpeg,avif,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** 圖紙包裡的相對路徑（./desk.webp）→ 建置後的網址；找不到是 null */
function assetOf(packFile: string, rel: string | undefined): string | null {
  if (!rel) return null;
  const dir = packFile.slice(0, packFile.lastIndexOf('/') + 1);
  const parts: string[] = [];
  for (const seg of (dir + rel).split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  return assets[`/${parts.join('/')}`] ?? null;
}

const builtin: ResolvedSheet[] = BUILTIN_SHEETS.map((s) => ({
  ...s,
  artUrl: artSrc(s.art),
  mapUrl: partsSrc(s.art),
  builtin: true,
}));

const custom: ResolvedSheet[] = Object.entries(packs).flatMap(([file, mod]) =>
  (Array.isArray(mod.default) ? mod.default : [mod.default]).flatMap((s) => {
    const artUrl = assetOf(file, s.art);
    if (!artUrl) {
      console.warn(`[setup] ${file}：找不到底稿 ${s.art}，這張圖紙略過`);
      return [];
    }
    return [{ ...s, artUrl, mapUrl: assetOf(file, s.parts_map), builtin: false }];
  }),
);

/** 全部可以選的圖紙（內建在前）；id 撞名的話圖紙包蓋掉內建的 */
export const SHEETS: ResolvedSheet[] = [...builtin.filter((b) => !custom.some((c) => c.id === b.id)), ...custom];

export const sheetById = (id: string): ResolvedSheet | undefined => SHEETS.find((s) => s.id === id);
