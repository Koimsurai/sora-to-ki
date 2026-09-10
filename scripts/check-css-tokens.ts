/**
 * 擋住「又開始現編間距值、字級與圓角」。
 *
 * ## 補這道的理由
 *
 * 這個專案原本三把尺都沒有：
 *   · margin/padding/gap  **87 種**長度值、1594 次、token 覆蓋 0
 *   · font-size           **57 種**值、584 次、token 覆蓋 0
 *   · border-radius       **21 種**值、404 個角、token 覆蓋 0
 *
 * 沒有尺的後果不是「值很多」，是**需要一個值時沒有標準答案**——於是每次都現編一個。
 * 間距長出 `0.15rem` / `0.35rem` / `0.45rem` / `0.55rem`；字級更誇張，是有人拿著
 * 0.02rem 在肉眼微調（0.7 / 0.72 / 0.74 / 0.76 / 0.78 / 0.8 / 0.82 / 0.85 / 0.88 /
 * 0.9 / 0.92 / 0.95rem 全部同時存在），91% 的用量擠在 10–18px 之間。
 * 圓角則是 2/3/4/5/6/7/8/9/10px **每一格都有人用**，而且「膠囊」有四種拼法
 * （`9999px` / `999px` / `50px` / `40px`）。
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
 *   3. 透明度不在 19 階的階梯上  → 錯（白／黑要用 --white-NN / --black-NN；
 *      品牌紫 rgba(var(--brand-rgb), a) 與其他底色的 a 都得在階梯上）
 *
 * 三把尺（間距 --space-*、字級 --fs-*、圓角 --r-*）走的都是第 1、2 條，
 * 差別只在各自的合法值集合。圓角另外多一條：`border-radius: 50%` 是「圓」這個語意
 * 而不是長度，要寫 `var(--r-round)`；`30% 70%` 那種刻意捏形狀的百分比不管。
 *
 * 第 3 條**連 `--xxx:` 定義行都查**。導入 alpha 階梯那次 codemod 跳過了定義行，
 * 結果 `--glass-bg` / `--glass-hover-bg` / `--post-card-bg` 三處還引用著被拿掉的階，
 * 是靠另外一次掃描才抓到的。唯一豁免的是階梯自己的 `--white-NN` / `--black-NN` 定義。
 *
 * ⚠ 第 4 條**刻意不查定義行**，這不是漏掉。兩條的形狀不一樣：
 * 合法的 alpha 階梯只有一處（index.css），所以任何別的定義行引用階梯外的 alpha 都是錯；
 * 顏色沒有這個性質——**主題區塊本來就該自帶一整套字面色**。實際查過的五個站點：
 * `.mm-theme-zinc/-deep/-tokyo/-nord/-light`（五個各自完整的圖表主題）與
 * `AdminTheme.css` 開頭那個把 shadcn 變數整組重定義的區塊。把它們指向 `--zinc-*`
 * 會讓 zinc 那個主題跟它四個兄弟長得不一樣，讀的人反而要跳兩層才看得出主題長怎樣。
 * 要改的是「語意別名指向調色盤」，而那件事沒辦法用「值相等」自動判斷，只能人看。
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

/**
 * index.css 的 `--r-*`。名字就是 px 值，另外兩格是 `--r-full`（膠囊）與 `--r-round`（50%）。
 *
 * ⚠ **不要改成 `--radius-*`**：那是 Tailwind v4 生 `rounded-*` utility 的 namespace，
 * 而且這個專案已經有 shadcn 的 `--radius` / `--radius-sm/md/lg` 掛在上面。
 */
const RADIUS_PX = new Set([2, 4, 6, 8, 10, 12, 16, 20]);

/** 大於「短邊的一半」的值瀏覽器都會夾成膠囊，一律指向 `--r-full`。 */
const RADIUS_FULL_HINT = 24;

const RADIUS_PROP = /^border(-(top|bottom)-(left|right))?-radius$/;
const SPACING_PROP = /^(margin|padding|gap|row-gap|column-gap)/;
const LENGTH = /(?<![\w.-])(-?\d*\.?\d+)(px|rem)(?![\w-])/g;
const EM = /(?<![\w.-])\d*\.?\d+em(?![\w-])/;
const DECL = /([-a-zA-Z]+)\s*:\s*([^;{}]+)/g;

/**
 * index.css 的透明度階梯，白／黑／品牌紫共用。NN 就是 alpha×100。
 * 低端 0.02 步（髮絲線，0.02 與 0.04 在感知上差兩倍）、中段 0.05、高段 0.10。
 * 改這裡要同步改 index.css 的 --white-NN / --black-NN 定義。
 */
const ALPHA_LADDER = [
  0.02, 0.04, 0.06, 0.08, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9, 0.95,
];
const rungOf = (a: number): string => String(Math.round(a * 100)).padStart(2, '0');
const ALPHA_RUNGS = new Set(ALPHA_LADDER.map(rungOf));
const onLadder = (a: number): boolean => ALPHA_LADDER.some((s) => Math.abs(s - a) < 1e-9);
// 平手往上取（0.07 → 0.08、0.65 → 0.70），跟導入時的 codemod 一致，建議才不會跟既有寫法打架
const nearestRung = (a: number): string =>
  rungOf(ALPHA_LADDER.reduce((best, s) => (Math.abs(s - a) <= Math.abs(best - a) ? s : best)));

// 只認逗號語法；空白斜線語法（rgb(0 0 0 / .5)）這個 codebase 沒在用，出現了會被漏掉
const RGBA_LIT = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g;
const HSLA_LIT = /hsla\([^()]*,\s*([\d.]+)\s*\)/g;
const HEX8 = /#[0-9a-fA-F]{6}([0-9a-fA-F]{2})\b/g;
const BRAND_ALPHA = /rgba\(\s*var\(--brand-rgb\)\s*,\s*([\d.]+)\s*\)/g;
const LADDER_REF = /var\(\s*--(white|black)-(\d+)\s*\)/g;
const LADDER_DEF = /^--(white|black)-\d+$/;

/**
 * 具名顏色 token：從 index.css 讀出來，不另抄一份。
 *
 * 規則 4：字面值跟某個 token 的值**一模一樣**就得用那個 token。這條零誤判——
 * 值都相等了，寫字面值只剩「不知道有 token」這一種原因。導入調色盤那次
 * （Tailwind v3 色票 23 個 + Happy Hues 殘餘）一口氣換了 340 處。
 *
 * 兩張表：`#hex → --name`（實心）、`r,g,b → --name-rgb`（帶 alpha 時用
 * `rgba(var(--name-rgb), a)`，跟 --brand-rgb 同一套寫法）。
 */
const INDEX_CSS = fs.readFileSync(path.join('src', 'index.css'), 'utf8');
const HEX_TOKEN = new Map<string, string>();
const RGB_TOKEN = new Map<string, string>();
for (const m of blankComments(INDEX_CSS).matchAll(
  /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6}|\d{1,3},\s*\d{1,3},\s*\d{1,3})\s*;/g,
)) {
  const [, name, val] = m;
  if (LADDER_DEF.test(name)) continue;
  if (val.startsWith('#')) {
    if (!HEX_TOKEN.has(val.toLowerCase())) HEX_TOKEN.set(val.toLowerCase(), name);
  } else if (name.endsWith('-rgb')) {
    RGB_TOKEN.set(val.replace(/\s+/g, ''), name);
  }
}
const HEX6 = /#([0-9a-fA-F]{6})\b(?![0-9a-fA-F])/g;
const HEX3 = /#([0-9a-fA-F]{3})\b(?![0-9a-fA-F])/g;

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
    const line = src.slice(0, m.index).split('\n').length;

    // ── 透明度階梯：定義行也查，只放過階梯自己的定義 ──
    if (!LADDER_DEF.test(prop)) {
      for (const r of value.matchAll(LADDER_REF)) {
        if (!ALPHA_RUNGS.has(r[2])) {
          problems.push({
            file,
            line,
            prop,
            raw: r[0],
            why: `階梯上沒有 --${r[1]}-${r[2]}`,
            fix: `改用最接近的 var(--${r[1]}-${nearestRung(Number(r[2]) / 100)})`,
          });
        }
      }
      for (const r of value.matchAll(RGBA_LIT)) {
        const a = Number(r[4]);
        if (!(a > 0 && a < 1)) continue;
        const [R, G, B] = [Number(r[1]), Number(r[2]), Number(r[3])];
        if (R === 255 && G === 255 && B === 255 && !prop.startsWith('--white-')) {
          problems.push({
            file,
            line,
            prop,
            raw: r[0],
            why: '白色透明度不准寫字面值',
            fix: `改用 var(--white-${nearestRung(a)})`,
          });
        } else if (R === 0 && G === 0 && B === 0 && !prop.startsWith('--black-')) {
          problems.push({
            file,
            line,
            prop,
            raw: r[0],
            why: '黑色透明度不准寫字面值',
            fix: `改用 var(--black-${nearestRung(a)})`,
          });
        } else if (!onLadder(a)) {
          problems.push({ file, line, prop, raw: r[0], why: `alpha ${a} 不在階梯上`, fix: `貼到 0.${nearestRung(a)}` });
        }
      }
      for (const r of value.matchAll(BRAND_ALPHA)) {
        const a = Number(r[1]);
        if (a > 0 && a < 1 && !onLadder(a)) {
          problems.push({
            file,
            line,
            prop,
            raw: r[0],
            why: `品牌紫的 alpha ${a} 不在階梯上`,
            fix: `貼到 0.${nearestRung(a)}`,
          });
        }
      }
      for (const r of value.matchAll(HSLA_LIT)) {
        const a = Number(r[1]);
        if (a > 0 && a < 1 && !onLadder(a)) {
          problems.push({ file, line, prop, raw: r[0], why: `alpha ${a} 不在階梯上`, fix: `貼到 0.${nearestRung(a)}` });
        }
      }
      for (const r of value.matchAll(HEX8)) {
        const a = Number.parseInt(r[1], 16) / 255;
        if (a > 0 && a < 1 && !onLadder(Math.round(a * 100) / 100)) {
          problems.push({
            file,
            line,
            prop,
            raw: r[0],
            why: `#rrggbbaa 的 alpha ${a.toFixed(3)} 不在階梯上`,
            fix: `改寫成 rgba(…, 0.${nearestRung(a)})`,
          });
        }
      }
    }

    if (prop.startsWith('--')) continue;

    // ── 規則 4：字面值等於某個 token 的值 → 用 token ──
    for (const r of value.matchAll(HEX6)) {
      const tok = HEX_TOKEN.get(`#${r[1].toLowerCase()}`);
      if (tok) problems.push({ file, line, prop, raw: r[0], why: `這就是 ${tok} 的值`, fix: `改用 var(${tok})` });
    }
    for (const r of value.matchAll(HEX3)) {
      const full = `#${[...r[1]]
        .map((c) => c + c)
        .join('')
        .toLowerCase()}`;
      const tok = HEX_TOKEN.get(full);
      if (tok) problems.push({ file, line, prop, raw: r[0], why: `這就是 ${tok} 的值`, fix: `改用 var(${tok})` });
    }
    for (const r of value.matchAll(RGBA_LIT)) {
      const tok = RGB_TOKEN.get(`${r[1]},${r[2]},${r[3]}`);
      if (tok)
        problems.push({
          file,
          line,
          prop,
          raw: r[0],
          why: `這就是 ${tok} 的三元組`,
          fix: `改用 rgba(var(${tok}), ${r[4]})`,
        });
    }

    const isSpacing = SPACING_PROP.test(prop);
    const isFontSize = prop === 'font-size';
    const isRadius = RADIUS_PROP.test(prop);
    if (!isSpacing && !isFontSize && !isRadius) continue;
    // calc() / clamp() 裡的數字是推導值或流體字級，不是尺上的一格
    if (value.includes('calc(') || value.includes('clamp(')) continue;
    // 字級與圓角的 em 是相對自身／父層字級的，換成固定 token 會改變語意
    if ((isFontSize || isRadius) && EM.test(value)) continue;

    // 圓角的 `50%` 是「圓／橢圓」這個語意，不是長度，所以在 LENGTH 之外單獨看。
    // 只擋剛好 50%——`30% 70%` 這種刻意捏形狀的百分比不在尺的管轄範圍。
    if (isRadius && /(?<![\w.-])50%/.test(value)) {
      problems.push({
        file,
        line,
        prop,
        raw: '50%',
        why: '這就是 --r-round',
        fix: '改用 var(--r-round)',
      });
    }

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

      if (isRadius) {
        problems.push(
          RADIUS_PX.has(px)
            ? { file, line, prop, raw, why: `${px}px 尺上有這一格`, fix: `改用 var(--r-${px})` }
            : {
                file,
                line,
                prop,
                raw,
                why: `${px}px 不在圓角尺上`,
                fix:
                  px >= RADIUS_FULL_HINT
                    ? '這個大小一定會被夾成膠囊，改用 var(--r-full)'
                    : '改用最接近的 var(--r-*)；如果元素的短邊 ≤ 2×這個值，它其實是膠囊，用 var(--r-full)',
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
  console.log(`✅ 間距、字級、圓角與透明度 token：檢查 ${files.length} 個 CSS 檔，沒有現編的值`);
  process.exit(0);
}

console.error(`\n❌ ${problems.length} 處沒有走 token：\n`);
for (const p of problems) {
  console.error(`  ${p.file}:${p.line}`);
  console.error(`    ${p.prop}: ${p.raw}  —— ${p.why}`);
  console.error(`    → ${p.fix}\n`);
}
console.error(
  '間距尺與字級尺在 src/index.css 的 @theme（--space-* / --fs-*），透明度階梯在 :root（--white-NN / --black-NN）。\n' +
    '真的需要新尺寸就加進那把尺，或加進 scripts/check-css-tokens.ts 的 GRANDFATHERED 並寫明理由。\n',
);
process.exit(1);
