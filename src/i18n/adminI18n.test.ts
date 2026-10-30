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

const ADMIN_DIRS = ['src/components/admin', 'src/routes/admin', 'src/components/monaco-editor'];
/** 不在上面那幾個資料夾、但畫面只有站長看得到的 */
const ADMIN_FILES = ['src/lib/excerptLinks.ts', 'src/routes/preview/post.tsx'];
const CJK = /[぀-ヿ㐀-鿿가-힯]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return sourceFiles(rel);
    return /\.tsx?$/.test(e.name) && !e.name.includes('.test.') ? [rel] : [];
  });
}

/**
 * 註解換成空白、換行留著（行號才對得回原文）。逐字走一遍而不是用 regex：字串裡的 `/*`
 * （`accept="image/*"`）會被 regex 當成區塊註解的開頭，把後面幾行整段吃掉，漏檢。
 * 樣板字串的 `${…}` 裡又是程式碼，用一個堆疊記著現在在第幾層。
 */
function stripComments(src: string): string {
  let out = '';
  const stack: string[] = []; // '`' = 在樣板字串裡；'{' = 在 ${…} 的程式碼裡
  let quote = ''; // 在 ' 或 " 字串裡
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const top = stack.at(-1);
    if (quote) {
      out += c;
      if (c === '\\') out += src[++i] ?? '';
      else if (c === quote) quote = '';
      continue;
    }
    if (top === '`') {
      out += c;
      if (c === '\\') out += src[++i] ?? '';
      else if (c === '`') stack.pop();
      else if (c === '$' && src[i + 1] === '{') {
        out += src[++i];
        stack.push('{');
      }
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop - 1;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    else if (c === '`') stack.push('`');
    else if (c === '{' && top === '{') stack.push('{');
    else if (c === '}' && top === '{') stack.pop();
    out += c;
  }
  return out;
}

/** 去掉註解後還帶著中日韓文字的那幾行。真的不該翻的（例如語言的原生名稱）在那一行寫 `i18n-ignore` */
function hardcodedLines(file: string): string[] {
  const raw = readFileSync(join(ROOT, file), 'utf8');
  const original = raw.split('\n');
  return stripComments(raw)
    .split('\n')
    .filter((l, i) => CJK.test(l) && !original[i]?.includes('i18n-ignore'));
}

describe('後台的程式碼不寫死介面文字', () => {
  it.each([...ADMIN_DIRS.flatMap(sourceFiles), ...ADMIN_FILES])('%s', (file) => {
    expect(hardcodedLines(file)).toEqual([]);
  });

  it('去註解不會被字串裡的 /* 騙到', () => {
    const src = ['const a = "image/*";', "const b = '繁中';", '/* 註解 */ const c = `x ${"中"}`;'].join('\n');
    expect(stripComments(src).split('\n')).toEqual([
      'const a = "image/*";',
      "const b = '繁中';",
      ' '.repeat(9) + 'const c = `x ${"中"}`;',
    ]);
  });
});
