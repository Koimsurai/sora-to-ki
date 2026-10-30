// 後台的介面字串：五份語系檔的 key 要一樣多，後台的程式碼裡不能再出現寫死的中日韓文字。
// 錯了的症狀是英文站的站長在後台看到一句中文（漏翻），或某個語言的按鈕變成一串 key（漏 key）。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vite-plus/test';

import { SUPPORTED_LOCALES } from '@/lib/locales';

const ROOT = join(__dirname, '..', '..');

function keysOf(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keysOf(v, prefix ? `${prefix}.${k}` : k));
}

/** 一個語系的整組後台字串，跟 admin-i18n.ts 組起來的形狀一樣：{ 區: 那支檔的內容 } */
function load(locale: string): Record<string, unknown> {
  const dir = join(ROOT, 'src/locales', locale, 'admin');
  return Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => [f.slice(0, -'.json'.length), JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown]),
  );
}

describe('後台語系檔', () => {
  const zhTW = keysOf(load('zh-TW')).sort();

  it.each(SUPPORTED_LOCALES.filter((l) => l !== 'zh-TW'))('%s 跟繁中原稿的 key 一模一樣', (locale) => {
    expect(keysOf(load(locale)).sort()).toEqual(zhTW);
  });

  it.each(SUPPORTED_LOCALES)('%s 沒有空字串', (locale) => {
    const flat = (o: unknown): unknown[] => (typeof o === 'object' && o ? Object.values(o).flatMap(flat) : [o]);
    expect(flat(load(locale)).filter((v) => typeof v !== 'string' || v.trim() === '')).toEqual([]);
  });
});

// 還沒搬到語系檔的檔案。搬完一個就從這裡拿掉（搬完卻沒拿掉，下面那條測試也會叫）。
// 整份清空之後這個清單就可以刪了。
const NOT_YET = new Set([
  'src/components/admin/AboutEditor.tsx',
  'src/components/admin/AdminAnalytics.tsx',
  'src/components/admin/AdminDashboard.tsx',
  'src/components/admin/BooksManager.tsx',
  'src/components/admin/CategoriesManager.tsx',
  'src/components/admin/CollectionManager.tsx',
  'src/components/admin/CommentsManager.tsx',
  'src/components/admin/DraftPreview.tsx',
  'src/components/admin/ExcerptLinksEditor.tsx',
  'src/components/admin/FriendsReview.tsx',
  'src/components/admin/LogEditor.tsx',
  'src/components/admin/PhotoSelectorModal.tsx',
  'src/components/admin/PhotosManager.tsx',
  'src/components/admin/PostEditor.tsx',
  'src/components/admin/PostLinkModal.tsx',
  'src/components/admin/PostPreview.tsx',
  'src/components/admin/PostsList.tsx',
  'src/components/admin/QaEditor.tsx',
  'src/components/admin/SetupEditor.tsx',
  'src/components/admin/SubscribersManager.tsx',
  'src/components/admin/TagsManager.tsx',
  'src/components/admin/ThoughtsManager.tsx',
  'src/components/admin/UsersManager.tsx',
  'src/components/admin/WorksEditor.tsx',
  'src/components/admin/thoughtCandidates.ts',
  'src/components/monaco-editor/monaco-editor.tsx',
  'src/components/monaco-editor/monaco-snippets.ts',
  'src/components/monaco-editor/monaco-toolbar.tsx',
  'src/components/monaco-editor/types.ts',
]);

const ADMIN_DIRS = ['src/components/admin', 'src/routes/admin', 'src/components/monaco-editor'];
const CJK = /[぀-ヿ㐀-鿿가-힯]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(e.name) && !e.name.includes('.test.') ? [rel] : [];
  });
}

/** 去掉註解後還帶著中日韓文字的那幾行。真的不該翻的（例如語言的原生名稱）在那一行寫 `i18n-ignore` */
function hardcodedLines(file: string): string[] {
  const raw = readFileSync(join(ROOT, file), 'utf8');
  // 區塊註解換成同樣多的換行，行號才對得回原文（i18n-ignore 寫在註解裡，要看原文那一行）
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, (c) => '\n'.repeat(c.split('\n').length - 1))
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const original = raw.split('\n');
  return code.split('\n').filter((l, i) => CJK.test(l) && !original[i]?.includes('i18n-ignore'));
}

describe('後台的程式碼不寫死介面文字', () => {
  const files = ADMIN_DIRS.flatMap(sourceFiles);

  it.each(files.filter((f) => !NOT_YET.has(f)))('%s', (file) => {
    expect(hardcodedLines(file)).toEqual([]);
  });

  it('清單上的檔案還真的沒搬完（搬完了就從 NOT_YET 拿掉）', () => {
    expect([...NOT_YET].filter((f) => hardcodedLines(f).length === 0)).toEqual([]);
  });
});
