/**
 * 擋住「又開始現編間距值與字級」。
 *
 * ## 補這道的理由
 *
 * 這個專案原本兩把尺都沒有：
 *   · margin/padding/gap  **87 種**長度值、1594 次、token 覆蓋 0
 *   · font-size           **57 種**值、584 次、token 覆蓋 0
 *
 * 沒有尺的後果不是「值很多」，是**需要一個值時沒有標準答案**——於是每次都現編一個。
 * 間距長出 `0.15rem` / `0.35rem` / `0.45rem` / `0.55rem`；字級更誇張，是有人拿著
 * 0.02rem 在肉眼微調（0.7 / 0.72 / 0.74 / 0.76 / 0.78 / 0.8 / 0.82 / 0.85 / 0.88 /
 * 0.9 / 0.92 / 0.95rem 全部同時存在），91% 的用量擠在 10–18px 之間。
 *
 * 收斂那 2040 處花了三支 PR。**沒有這道檢查，半年後會原封不動長回來**——
 * 這不是假設：CSS 的 git 歷史是寫了 51,785 行、刪掉 30,103 行（58%），
 * 前一年一路淨增 +87%~+94%，直到一次 −95% 的大清理才拉回來。
 *
 * ## 為什麼是自訂腳本而不是 lint 規則
 *
 * Biome 沒有「限制某個屬性的合法值」這類規則，而引入 stylelint 等於讓兩個 linter
 * 管同一批 CSS——CLAUDE.md 已經記著那會產生互相矛盾的意見。這個 repo 本來就有
 * `scripts/check-*.ts` 的慣例（check-mdx / check-links / check-headers），跟著走。
 *
 * ## 判準
 *
 *   1. 值落在尺上卻寫成字面值  → 錯：有 token 就要用 token
 *   2. 值不在尺上、也不在豁免名單  → 錯：不要現編新值
 *
 * 真的需要新尺寸時有兩條路，兩條都會在 review 裡被看見：把它加進 index.css 的尺
 * （比較好），或加進下面的 GRANDFATHERED 並寫明理由。
 */
import fs from 'node:fs';
import path from 'node:path';

/** index.css 的 `--space-*`。改這裡要同步改那邊。 */
const SCALE_PX: Record<number, string> = {
  1: 'px',
  2: '0-5',
  4: '1',
  6: '1-5',
  8: '2',
  10: '2-5',
  12: '3',
  14: '3-5',
  16: '4',
  18: '4-5',
  20: '5',
  22: '5-5',
  24: '6',
  28: '7',
  32: '8',
  36: '9',
  40: '10',
  48: '12',
  56: '14',
  64: '16',
  80: '20',
  96: '24',
};

/**
 * 導入這道檢查時就存在的字面值。**這是存量不是許可**——每一條都該有理由，
 * 沒理由的那些就是之後要收的清單。
 *
 * 兩類：
 *   · 負值 —— 沒有負的 token 形式（寫 `calc(-1 * var(--space-10))` 更難讀）
 *   · 版面尺寸 —— 30/60/70/90/100/120px 這種不是節奏間距，硬貼到尺上會走樣
 *     （實測 `120px` 最近的尺是 96px，差 24px）
 *
 * 奇數小值（3/5/7/9/11/13px）是刻意打出來的，跟那些除不盡的 rem 小數不同，
 * 所以留著。要不要收進尺是設計判斷，不是這道檢查該替人決定的事。
 */
const GRANDFATHERED = new Set([
  '3px',
  '5px',
  '7px',
  '9px',
  '11px',
  '13px',
  '26px',
  '42px',
  '50px',
  '55px',
  '30px',
  '60px',
  '70px',
  '72px',
  '88px',
  '90px',
  '100px',
  '120px',
  '2.75rem',
  '5.5rem',
  '8rem',
  '-1px',
  '-4px',
  '-6px',
  '-12px',
  '-120px',
  '-0.5rem',
  '-1.2rem',
  '-1.5rem',
  '-2.5rem',
]);

/**
 * index.css 的 `--fs-*`。名字就是 px 值。
 *
 * ⚠ **不要改成 `--text-*`**：那是 Tailwind v4 生 utility 的 namespace，佔用它會改變
 * `text-sm` 產出什麼；而且這個專案的 `--text-primary` / `-secondary` / `-tertiary`
 * 已經是**顏色**。也不要直接 `var(--text-3xl)`——v4 會 tree-shake 掉沒被 utility
 * 用到的 theme 變數，實測產物裡只有 xs/sm/base/lg/xl/2xl/6xl，3xl/4xl/5xl 不存在，
 * 引用它會是未定義、字級直接退回繼承值。
 */
const FONT_SIZE_PX = new Set([10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56]);

/**
 * 字級的豁免。導入時只有這些。
 *
 * `em` 不在這裡也不會被檢查——它是相對父層字級的，換成固定 token 會改變語意
 * （MdxContent 有一批 0.55em / 0.82em / 1.05em 就是刻意要跟著父層走）。
 * `calc()` / `clamp()` 同理，那是流體字級。
 */
const FONT_SIZE_GRANDFATHERED = new Set<string>([]);

const SPACING_PROP = /^(margin|padding|gap|row-gap|column-gap)/;
const LENGTH = /(?<![\w.-])(-?\d*\.?\d+)(px|rem)(?![\w-])/g;
const EM = /(?<![\w.-])\d*\.?\d+em(?![\w-])/;
const DECL = /([-a-zA-Z]+)\s*:\s*([^;{}]+)/g;

/**
 * 把註解換成**等長空白**，而不是「比對時跳過起點在註解裡的 match」。
 *
 * ⚠ 後者有個不明顯的洞，而且實際踩到了：`/* critical: keep sticky working *\/`
 * 這種含冒號的註解本身長得像一條宣告，而宣告的值是 `[^;{}]+`——它會一路吃到
 * 下一個分號，把**註解後面那條真的宣告整條吞進去**。那個 match 因為起點在註解裡
 * 被跳過，而 finditer 不重疊，於是後面那條宣告永遠沒被看到。
 * 導入時因此漏掉了 article-shell.css 的 `padding-bottom: 4rem`。
 *
 * 換成等長空白就沒有這個分岔：註解內容不參與比對，位移也還是對的（要回報行號）。
 */
function blankComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

interface Problem {
  file: string;
  line: number;
  prop: string;
  raw: string;
  why: string;
  fix: string;
}

function check(file: string): Problem[] {
  const src = fs.readFileSync(file, 'utf8');
  const scan = blankComments(src);
  const problems: Problem[] = [];
  for (const m of scan.matchAll(DECL)) {
    const prop = m[1].trim();
    const value = m[2].trim();
    if (prop.startsWith('--')) continue;
    const isSpacing = SPACING_PROP.test(prop);
    const isFontSize = prop === 'font-size';
    if (!isSpacing && !isFontSize) continue;
    // calc() / clamp() 裡的數字是推導值或流體字級，不是尺上的一格
    if (value.includes('calc(') || value.includes('clamp(')) continue;
    // 字級的 em 是相對父層的，換成固定 token 會改變語意
    if (isFontSize && EM.test(value)) continue;
    const line = src.slice(0, m.index).split('\n').length;

    for (const lm of value.matchAll(LENGTH)) {
      const raw = lm[1] + lm[2];
      const px = Number(lm[1]) * (lm[2] === 'rem' ? 16 : 1);
      if (px === 0) continue;

      if (isFontSize) {
        if (FONT_SIZE_GRANDFATHERED.has(raw)) continue;
        problems.push(
          FONT_SIZE_PX.has(px)
            ? { file, line, prop, raw, why: `${px}px 尺上有這一格`, fix: `改用 var(--fs-${px})` }
            : {
                file,
                line,
                prop,
                raw,
                why: `${px}px 不在字級尺上`,
                fix: `改用最接近的 var(--fs-*)，或把這個尺寸加進 index.css 的尺`,
              },
        );
        continue;
      }

      if (GRANDFATHERED.has(raw)) continue;
      const token = SCALE_PX[px];
      problems.push(
        token
          ? { file, line, prop, raw, why: `${px}px 尺上有這一格`, fix: `改用 var(--space-${token})` }
          : {
              file,
              line,
              prop,
              raw,
              why: `${px}px 不在間距尺上`,
              fix: `改用最接近的 var(--space-*)，或把這個尺寸加進 index.css 的尺`,
            },
      );
    }
  }
  return problems;
}

const files = walk('src');
const problems = files.flatMap(check);

if (problems.length === 0) {
  console.log(`✅ 間距與字級 token：檢查 ${files.length} 個 CSS 檔，沒有現編的間距或字級`);
  process.exit(0);
}

console.error(`\n❌ ${problems.length} 處沒有走 token：\n`);
for (const p of problems) {
  console.error(`  ${p.file}:${p.line}`);
  console.error(`    ${p.prop}: ${p.raw}  —— ${p.why}`);
  console.error(`    → ${p.fix}\n`);
}
console.error(
  '間距尺與字級尺都定義在 src/index.css 的 @theme（--space-* / --fs-*）。\n' +
    '真的需要新尺寸就加進那把尺，或加進 scripts/check-css-tokens.ts 的 GRANDFATHERED 並寫明理由。\n',
);
process.exit(1);
