/**
 * 擋住「又開始現編間距值、字級、圓角、堆疊層與過渡」。
 *
 * ## 補這道的理由
 *
 * 這個專案原本一把尺都沒有：
 *   · margin/padding/gap  **87 種**長度值、1594 次、token 覆蓋 0
 *   · font-size           **57 種**值、584 次、token 覆蓋 0
 *   · border-radius       **21 種**值、404 個角、token 覆蓋 0
 *   · z-index             **28 種**值、156 處、token 覆蓋 0
 *   · transition          **35 種**時間值、454 次；緩動 15 種，9 條各只用一次
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
 *   3. 元件的字、線、面不是語意層的角色  → 錯（見 ROLE_PROP 上面的說明）
 *
 * 三把長度尺（間距 --space-*、字級 --fs-*、圓角 --r-*）走的都是第 1、2 條，
 * 差別只在各自的合法值集合。圓角另外多一條：`border-radius: 50%` 是「圓」這個語意
 * 而不是長度，要寫 `var(--r-round)`；`30% 70%` 那種刻意捏形狀的百分比不管。
 *
 * z-index（--z-*）是第 5 條，形狀不一樣，**門檻是 1000 而不是「全部都要走 token」**：
 * 1000 以下留給元件內部的局部堆疊（`.mm-toolbar: 20`、`.floating-actions: 100`），
 * 那些數字只跟自己的兄弟比，逼它們上尺是把局部問題硬講成全域問題。
 * ≥1000 一定是「我要蓋過全世界」，那必須是一個有名字的決定。
 *
 * 過渡（--dur-* / --easing-*）是第 6 條，也不對稱：時長**只查 `transition*`**，
 * 因為 `animation` 的時間從 50ms 的閃爍到 200 秒的星空漂移都有，那是各自的節奏與
 * 週期，不是「需要一個過渡時長」的問題。緩動則兩邊都查——曲線是設計決定，跟它是
 * 過渡還是動畫無關。
 *
 * 第 3 條管的是「這個地方用的是哪個角色」，不是透明度的數值：2026-10 之前它是「alpha 必須在
 * 19 階上」，結果從 19 階裡挑哪一階都會過，元件各自挑出 25 種字色、49 種底色。
 *
 * ⚠ 第 4 條**刻意不查定義行**，這不是漏掉：
 * **主題區塊本來就該自帶一整套字面色**，例如 `AdminTheme.css` 開頭
 * 那個把 shadcn 變數整組重定義的區塊。只把其中幾個指向 `--zinc-*` 會讓它跟同一組的兄弟
 * 長得不一樣，讀的人反而要跳兩層才看得出主題長怎樣。
 * 要改的是「語意別名指向調色盤」，而那件事沒辦法用「值相等」自動判斷，只能人看。
 *
 * 第 7 條管的是另一件事：`var(--x)` 引用的變數必須有人定義（見 undefinedVars）。
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
  // 負值：沒有負的 token 形式（寫 `calc(-1 * var(--space-10))` 更難讀）
  '-1px',
]);

/**
 * index.css 的 `--fs-*`。名字就是 px 值。
 *
 * ⚠ **不要改成 `--text-*`**：那是 Tailwind v4 生 utility 的 namespace，佔用它會改變
 * `text-sm` 產出什麼。也不要直接 `var(--text-3xl)`——v4 會 tree-shake 掉沒被 utility
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
 * index.css 的 `--r-*`：2 與 6 兩格（翻新後只剩小東西與細線框有圓角），另外是 `--r-full`（膠囊）與 `--r-round`（50%）。
 *
 * ⚠ **不要改成 `--radius-*`**：那是 Tailwind v4 生 `rounded-*` utility 的 namespace，
 * 而且這個專案已經有 shadcn 的 `--radius` / `--radius-sm/md/lg` 掛在上面。
 */
const RADIUS_PX = new Set([2, 6]);

/** 大於「短邊的一半」的值瀏覽器都會夾成膠囊，一律指向 `--r-full`。 */
const RADIUS_FULL_HINT = 24;

const RADIUS_PROP = /^border(-(top|bottom)-(left|right))?-radius$/;
const SPACING_PROP = /^(margin|padding|gap|row-gap|column-gap)/;
const LENGTH = /(?<![\w.-])(-?\d*\.?\d+)(px|rem)(?![\w-])/g;
const EM = /(?<![\w.-])\d*\.?\d+em(?![\w-])/;
const DECL = /([-a-zA-Z]+)\s*:\s*([^;{}]+)/g;

/**
 * 元素 `opacity` 的階梯（規則見主迴圈最後）。顏色不走這把尺，走 index.css 的語意層（規則 3）。
 * 低端 0.02 步、中段 0.05、高段 0.10。
 */
const ALPHA_LADDER = [
  0.02, 0.04, 0.06, 0.08, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9, 0.95,
];
const rungOf = (a: number): string => String(Math.round(a * 100)).padStart(2, '0');
const onLadder = (a: number): boolean => ALPHA_LADDER.some((s) => Math.abs(s - a) < 1e-9);
// 平手往上取（0.07 → 0.08、0.65 → 0.70），跟導入時的 codemod 一致，建議才不會跟既有寫法打架
const nearestRung = (a: number): string =>
  rungOf(ALPHA_LADDER.reduce((best, s) => (Math.abs(s - a) <= Math.abs(best - a) ? s : best)));

// 只認逗號語法；空白斜線語法（rgb(0 0 0 / .5)）這個 codebase 沒在用，出現了會被漏掉
const RGBA_LIT = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g;
const LADDER_DEF = /^--black-\d+$/;

/**
 * 規則 3：元件的字、線、面只用 index.css 的語意層（--ink-*、--line*、--wash*、--veil-*、--signal*、--danger）。
 * 翻新前這裡是「alpha 必須在 19 階上」，結果從 19 階裡挑哪一階都會過，元件各自挑出了 25 種字色。
 * 現在元件裡不准出現透明度：原始色（--paper / --amber / --flare）、`rgba(var(--x-rgb), a)`、
 * 帶 alpha 的字面色都擋。要新的一階就在語意層加一個有名字的角色。
 *
 * 不管的：index.css（定義的地方）、陰影與光暈（box-shadow / text-shadow / filter，是效果不是角色，
 * 各處的強度是調過的）、自訂屬性的定義行、Tailwind 色票（後台與 shadcn 那一套）。
 * 黑（--black-NN）只准用在面：陰影之外，影片縮圖的壓暗這類媒體處理也用它。
 */
const ROLE_PROP: [RegExp, 'text' | 'line' | 'face'][] = [
  [/^(color|-webkit-text-fill-color|caret-color)$/, 'text'],
  [/^(border|outline|text-decoration|column-rule|stroke|scrollbar-color)/, 'line'],
  [/^(background|background-color|background-image|fill)$/, 'face'],
];
const roleOf = (prop: string) => ROLE_PROP.find(([re]) => re.test(prop))?.[1];
const ROLE_RAW =
  /rgba\(\s*var\(--(?:paper|ground|amber|flare)-rgb\)[^)]*\)|var\(--(?:paper|amber|flare)\)|rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(?:0?\.\d+|0)\s*\)|hsla\([^()]*\)|#[0-9a-fA-F]{8}\b/g;
const BLACK_REF = /var\(--black-\d+\)/g;
const ROLE_FIX = {
  text: '改用 --ink / --ink-body / --ink-muted / --ink-subtle（或 --signal、--danger）',
  line: '改用 --line / --line-strong；選中、作用中的線用字的顏色',
  face: '改用 --wash / --wash-strong / --veil-1～3 / --signal-wash；圖形（點、刻度）用線或字的顏色',
};
/** 刻意留著的：檔案 + 寫法 → 理由 */
const ROLE_EXEMPT = new Map([
  [
    'src/components/mdx/CodeSurface.css|rgba(var(--paper-rgb), 0.2)',
    '程式碼的行號屬於語法高亮那一套，刻意淡到幾乎看不見',
  ],
]);

/**
 * 具名顏色 token：從 index.css 讀出來，不另抄一份。
 *
 * 規則 4：字面值跟某個 token 的值**一模一樣**就得用那個 token。這條零誤判——
 * 值都相等了，寫字面值只剩「不知道有 token」這一種原因。導入調色盤那次
 * （Tailwind v3 色票 23 個 + Happy Hues 殘餘）一口氣換了 340 處。
 *
 * 兩張表：`#hex → --name`（實心）、`r,g,b → --name-rgb`（帶 alpha 時用
 * `rgba(var(--name-rgb), a)`，只在 index.css 的語意層裡）。
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
/**
 * z-index 的尺，同樣從 index.css 讀。值 → token 名。
 *
 * ⚠ 這條的門檻是 **1000**，不是「所有 z-index 都要走 token」。
 * 1000 以下留給元件內部的局部堆疊（`.mm-toolbar: 20`、`.floating-actions: 100`）——
 * 那些數字只跟自己的兄弟比，逼它們上尺是把局部問題硬講成全域問題。
 * 四位數則一定是「我要蓋過全世界」，而那必須是一個有名字的決定。
 */
const Z_TOKEN = new Map<number, string>();
for (const m of blankComments(INDEX_CSS).matchAll(/(--z-[\w-]+)\s*:\s*(-?\d+)\s*;/g)) {
  Z_TOKEN.set(Number(m[2]), m[1]);
}
const Z_MIN = 1000;

/**
 * 過渡的時長尺（`--dur-*`，值就是 ms）與三條緩動曲線（`--easing-*`），一樣從 index.css 讀。
 *
 * ⚠ 時長**只查 `transition*`，不查 `animation*`**。兩者不是同一種東西：站上的
 * animation 從 50ms 的閃爍到 **200 秒**的星空漂移都有，那是各自調出來的節奏與週期。
 * 緩動則兩邊都查——曲線是設計決定，跟它是過渡還是動畫無關。
 */
const DUR_MS = new Set<number>();
for (const m of blankComments(INDEX_CSS).matchAll(/--dur-(\d+)\s*:/g)) DUR_MS.add(Number(m[1]));
const EASING_TOKEN = new Map<string, string>();
for (const m of blankComments(INDEX_CSS).matchAll(/(--easing-[\w-]+)\s*:\s*(cubic-bezier\([^()]*\))\s*;/g)) {
  EASING_TOKEN.set(m[2].replace(/\s+/g, ''), m[1]);
}

/** 時長的豁免：`0.01ms` 是 `prefers-reduced-motion` 的關閉開關，那不是一個時長 */
const DUR_GRANDFATHERED = new Set(['0.01ms']);

/**
 * 行高與字距的尺，一樣從 index.css 讀。名字裡的數字是 ×100（`--lh-140` = 1.4、
 * `--ls-12` = 0.12em），`ls-n` 開頭是負的。
 *
 * ⚠ 字距**只認 em**：px 字距不會跟著字級縮放，同一個 `1.5px` 放在 10px 與 16px 的
 * 標籤上是完全不同的鬆緊。導入時 26 處 px 全部換算成 em（除以同區塊的 font-size），
 * 所以規則直接把「字距寫 px」判成錯，而不是再去算它等於哪一格。
 */
const LH_VALUES = new Map<number, string>();
for (const m of blankComments(INDEX_CSS).matchAll(/(--lh-\d+)\s*:\s*([\d.]+)\s*;/g)) {
  LH_VALUES.set(Number(m[2]), m[1]);
}
const LS_VALUES = new Map<number, string>();
for (const m of blankComments(INDEX_CSS).matchAll(/(--ls-n?\d+)\s*:\s*(-?[\d.]+)em\s*;/g)) {
  LS_VALUES.set(Number(m[2]), m[1]);
}

/**
 * 行高的豁免。兩條都是刻意的排版手法，貼到尺上會壞：
 *   · `0`    —— `.vp` 影片容器殺掉行內間隙，寫 0 最清楚（同 `border-radius: 0`）
 *   · `0.8`  —— `.post-content.drop-cap-first` 的首字放大
 */
const LH_GRANDFATHERED = new Set(['0', '0.8']);

/**
 * `blur()` 的半徑尺（`--blur-*`，名字就是 px）。只查 `filter` / `backdrop-filter`。
 *
 * ⚠ `-webkit-backdrop-filter` 一律不准手寫（見下面主迴圈那條規則）：建置用的 lightningcss
 * 會把同一區塊裡的前綴版與沒前綴版當成同一個屬性、只留後寫的那個，而大家都照慣例把前綴版
 * 寫在後面——於是 Chrome / Edge 只拿到它不認得的 `-webkit-`，全站毛玻璃靜靜失效。
 * 只寫沒前綴的，lightningcss 會依目標瀏覽器自己補前綴給 Safari。
 *
 * ⚠ 只查 `blur()`，不查 `drop-shadow()` / `brightness()` / `saturate()`：
 * 那些是陰影與亮度，不是模糊，各自的值域完全不同。
 */
const BLUR_PX = new Set<number>();
for (const m of blankComments(INDEX_CSS).matchAll(/--blur-(\d+)\s*:/g)) BLUR_PX.add(Number(m[1]));
const FILTER_PROP = /^(backdrop-)?filter$/;
const BLUR_CALL = /blur\((\d*\.?\d+)px\)/g;

/**
 * 陰影 `--elev`（2026-10 翻新後只剩一格：浮起來的東西）。
 *
 * ⚠ 這條**只擋單層中性投影**（`0 Ypx Bpx var(--black-NN)`），不是所有 box-shadow。
 * 多層的陰影與光暈是效果，各處的強度是調過的，不收。
 *
 * ⚠ 名字是 `--elev` 不是 `--shadow-*`：後者是 Tailwind v4 的 namespace，而站上有
 * 6 個 shadcn 的 `shadow-xs/sm/md/lg/xl/2xl` 正在用。
 */
const ELEV_VALUE = new Map<string, string>();
for (const m of blankComments(INDEX_CSS).matchAll(/(--elev(?:-\d+)?)\s*:\s*([^;]+);/g)) {
  ELEV_VALUE.set(m[2].replace(/\s+/g, ' ').trim(), m[1]);
}
const NEUTRAL_SHADOW = /^0 \d+px \d+px var\(--black-\d+\)$/;

const TRANSITION_PROP = /^transition(-duration|-delay)?$/;
const TIME = /(?<![\w.-])(\d*\.?\d+)(m?s)(?![\w-])/g;
const BEZIER = /cubic-bezier\([^()]*\)/g;

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

function walk(dir: string, ext = '.css', out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, ext, out);
    else if (e.name.endsWith(ext)) out.push(p);
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

    // ── 規則 3：元件的字、線、面只用語意層（index.css 是定義的地方，不查）──
    const role = roleOf(prop);
    if (role && !file.endsWith('index.css')) {
      const raws = [...value.matchAll(ROLE_RAW)].map((r) => r[0]);
      if (role !== 'face') raws.push(...[...value.matchAll(BLACK_REF)].map((r) => r[0]));
      for (const raw of raws) {
        if (ROLE_EXEMPT.has(`${file}|${raw}`)) continue;
        problems.push({ file, line, prop, raw, why: '元件裡不寫透明度與原始色，用語意層', fix: ROLE_FIX[role] });
      }
    }

    if (prop.startsWith('--')) continue;

    // ── 規則 4：字面值等於某個 token 的值 → 用 token ──
    for (const r of value.matchAll(HEX6)) {
      const tok = HEX_TOKEN.get(`#${r[1].toLowerCase()}`);
      if (tok) problems.push({ file, line, prop, raw: r[0], why: `這就是 ${tok} 的值`, fix: `改用 var(${tok})` });
    }
    for (const r of value.matchAll(HEX3)) {
      const full = `#${r[1]
        .split('')
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

    // ── z-index：四位數一定要走尺 ──
    if (prop === 'z-index' && /^-?\d+$/.test(value)) {
      const n = Number(value);
      const tok = Z_TOKEN.get(n);
      if (tok) {
        problems.push({ file, line, prop, raw: value, why: `這就是 ${tok}`, fix: `改用 var(${tok})` });
      } else if (Math.abs(n) >= Z_MIN) {
        problems.push({
          file,
          line,
          prop,
          raw: value,
          why: `z-index ${n} ≥ ${Z_MIN} —— 那是「我要蓋過全世界」，必須是有名字的決定`,
          fix: '改用 index.css 的 --z-* 其中一格；如果它其實只跟自己的兄弟比，改成 1/2/3 這種局部值',
        });
      }
    }

    // ── 單層中性投影要走高度尺；多層／帶顏色的不管 ──
    if (prop === 'box-shadow') {
      const v = value.replace(/\s+/g, ' ').trim();
      if (NEUTRAL_SHADOW.test(v)) {
        const tok = ELEV_VALUE.get(v);
        problems.push({
          file,
          line,
          prop,
          raw: v,
          why: tok ? `這就是 ${tok}` : '單層中性投影要走高度尺，不要再自己調一個',
          fix: tok ? `改用 var(${tok})` : `改用最接近的 ${[...ELEV_VALUE.values()].join(' / ')}`,
        });
      }
    }

    // ── 元素的 opacity 走 19 階的階梯（顏色不走，見規則 3）──
    //
    // ⚠ 這條**不是**「要用 token」，是「值要在階梯上」。
    // 導入時 23 種值裡已經有 19 種落在階梯上，只有 0.85 / 0.75 / 0.18 / 0.12 例外。
    //
    // 低於 0.01 的不管：那不是「多透明」，是「看不見但要繪製」（opacity 剛好 0 的圖層
    // 瀏覽器不光柵化，要先畫好的東西會刻意用 0.001），跟階梯量的不是同一件事。
    if (prop === 'opacity' && /^[\d.]+$/.test(value)) {
      const a = Number(value);
      if (a >= 0.01 && a !== 1 && !onLadder(a)) {
        problems.push({
          file,
          line,
          prop,
          raw: value,
          why: `${a} 不在 19 階的透明度階梯上`,
          fix: `改用 ${Number(nearestRung(a)) / 100}`,
        });
      }
    }

    // ── 等寬字只有一套堆疊 ──
    if (prop === 'font-family' && /\bmonospace\b/.test(value) && !value.includes('var(--mono-font)')) {
      problems.push({
        file,
        line,
        prop,
        raw: value.slice(0, 40),
        why: '等寬字有一套統一的堆疊',
        fix: '改用 var(--mono-font)',
      });
    }

    // ── 前綴交給建置補，手寫的會把沒前綴的那條吃掉 ──
    if (prop === '-webkit-backdrop-filter') {
      problems.push({
        file,
        line,
        prop,
        raw: value,
        why: 'lightningcss 會只留後寫的那條：Chrome / Edge 拿到前綴版就沒有模糊',
        fix: '刪掉這行，只寫 backdrop-filter（Safari 的前綴建置時會自動補上）',
      });
    }

    // ── blur() 的半徑 ──
    if (FILTER_PROP.test(prop)) {
      for (const bm of value.matchAll(BLUR_CALL)) {
        const px = Number(bm[1]);
        problems.push(
          BLUR_PX.has(px)
            ? { file, line, prop, raw: bm[0], why: `${px}px 尺上有這一格`, fix: `改用 blur(var(--blur-${px}))` }
            : {
                file,
                line,
                prop,
                raw: bm[0],
                why: `${px}px 不在模糊尺上`,
                fix: '改用最接近的 blur(var(--blur-*))，或把這一格加進 index.css 的尺',
              },
        );
      }
    }

    // ── 行高 ──
    if (prop === 'line-height' && /^-?[\d.]+$/.test(value) && !LH_GRANDFATHERED.has(value)) {
      const v = Number(value);
      const tok = LH_VALUES.get(v);
      problems.push(
        tok
          ? { file, line, prop, raw: value, why: `這就是 ${tok}`, fix: `改用 var(${tok})` }
          : {
              file,
              line,
              prop,
              raw: value,
              why: `${v} 不在行高尺上`,
              fix: '改用最接近的 var(--lh-*)，或把這一格加進 index.css 的尺',
            },
      );
    }

    // ── 字距：只認 em ──
    if (prop === 'letter-spacing') {
      for (const lm of value.matchAll(/(?<![\w.-])(-?\d*\.?\d+)(px|rem|em)(?![\w-])/g)) {
        if (lm[2] !== 'em') {
          problems.push({
            file,
            line,
            prop,
            raw: lm[0],
            why: '字距不要用 px —— 它不會跟著字級縮放，同一個值在 10px 與 16px 的標籤上鬆緊完全不同',
            fix: '換算成 em（除以這個元素的 font-size）再貼到 var(--ls-*)',
          });
          continue;
        }
        const v = Number(lm[1]);
        if (v === 0) continue;
        const tok = LS_VALUES.get(v);
        problems.push(
          tok
            ? { file, line, prop, raw: lm[0], why: `這就是 ${tok}`, fix: `改用 var(${tok})` }
            : {
                file,
                line,
                prop,
                raw: lm[0],
                why: `${v}em 不在字距尺上`,
                fix: '改用最接近的 var(--ls-*)，或把這一格加進 index.css 的尺',
              },
        );
      }
    }

    // ── 過渡的時長：只查 transition*，animation 的時間是節奏不是尺 ──
    if (TRANSITION_PROP.test(prop)) {
      for (const tm of value.matchAll(TIME)) {
        const raw = tm[0];
        if (DUR_GRANDFATHERED.has(raw)) continue;
        const ms = Number(tm[1]) * (tm[2] === 's' ? 1000 : 1);
        if (ms === 0) continue; // `0s` 就是「不過渡」，不需要 token
        problems.push(
          DUR_MS.has(ms)
            ? { file, line, prop, raw, why: `${ms}ms 尺上有這一格`, fix: `改用 var(--dur-${ms})` }
            : {
                file,
                line,
                prop,
                raw,
                why: `${ms}ms 不在過渡時長尺上`,
                fix: '改用最接近的 var(--dur-*)，或把這一格加進 index.css 的尺',
              },
        );
      }
    }

    // ── 緩動曲線：transition 與 animation 都查 ──
    if (prop.startsWith('transition') || prop.startsWith('animation')) {
      for (const bm of value.matchAll(BEZIER)) {
        const key = bm[0].replace(/\s+/g, '');
        const tok = EASING_TOKEN.get(key);
        problems.push({
          file,
          line,
          prop,
          raw: bm[0],
          why: tok ? `這就是 ${tok}` : '又一條自己發明的曲線',
          fix: tok
            ? `改用 var(${tok})`
            : `改用 ${[...EASING_TOKEN.values()].map((t) => `var(${t})`).join(' / ')} 其中一條；真的需要新曲線就加進 index.css`,
        });
      }
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

/**
 * 規則 7：引用的變數必須有人定義。打錯或不存在的 token（`var(--fs-15)`，尺上沒有 15）
 * 不會有任何錯誤訊息：宣告在計算時失效、退回繼承值，畫面只是「怪怪的」。
 *
 * 定義的來源有三種：任何一個 CSS 檔的 `--x:`；元件在執行時寫進去的，也就是 TS/TSX 裡
 * 一個完整的 `'--x'` 字串（`style.setProperty('--x', …)`、`style={{ '--x': … }}`）；
 * 套件自己會設的（RUNTIME_PREFIXES）。帶備援值的 `var(--x, …)` 不查，那是刻意的
 * 「有就用、沒有就退回」。
 *
 * ⚠ 這條不知道 Tailwind 會 tree-shake 掉沒被 utility 用到的 theme 變數（見 FONT_SIZE_PX 上面那段），
 * `@theme` 裡有寫就算有定義。
 */
const RUNTIME_PREFIXES = [
  '--radix-', // Radix 在執行時寫在自己的元素上（下拉選單的寬度、手風琴的高度）
  '--tw-', // Tailwind utility 自己的內部變數
];
const VAR_REF = /var\(\s*(--[\w-]+)\s*(,)?/g;
const CUSTOM_DEF = /(--[\w-]+)\s*:/g;
const TS_LITERAL = /['"`](--[\w-]+)['"`]/g;

function undefinedVars(cssFiles: string[]): Problem[] {
  const defined = new Set<string>();
  for (const f of cssFiles) {
    for (const m of blankComments(fs.readFileSync(f, 'utf8')).matchAll(CUSTOM_DEF)) defined.add(m[1]);
  }
  for (const f of [...walk('src', '.ts'), ...walk('src', '.tsx')]) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(TS_LITERAL)) defined.add(m[1]);
  }
  const problems: Problem[] = [];
  for (const file of cssFiles) {
    const src = fs.readFileSync(file, 'utf8');
    const scan = blankComments(src);
    for (const r of scan.matchAll(VAR_REF)) {
      const name = r[1];
      if (r[2] || defined.has(name) || RUNTIME_PREFIXES.some((p) => name.startsWith(p))) continue;
      // 不靠 DECL 找屬性名：DECL 的屬性名不收數字，`--surface-2: var(…)` 這種定義行會漏
      const head = scan.slice(0, r.index);
      const declStart = Math.max(head.lastIndexOf(';'), head.lastIndexOf('{'), head.lastIndexOf('}')) + 1;
      problems.push({
        file,
        // 行號照原文算：blankComments 連多行註解裡的換行都換成空白了
        line: src.slice(0, r.index).split('\n').length,
        prop: head.slice(declStart).split(':')[0].trim(),
        raw: `var(${name})`,
        why: `${name} 沒有任何地方定義，這條宣告會失效、退回繼承值`,
        fix: `改成存在的 token（尺都在 src/index.css），或寫成帶備援值的 var(${name}, …)`,
      });
    }
  }
  return problems;
}

const files = walk('src');
const problems = [...files.flatMap(check), ...undefinedVars(files)];

if (problems.length === 0) {
  console.log(
    `✅ 間距、字級、行高、字距、圓角、模糊、陰影、堆疊層、過渡、等寬字與透明度 token：檢查 ${files.length} 個 CSS 檔，沒有現編的值，引用的變數都有定義`,
  );
  process.exit(0);
}

console.error(`\n❌ ${problems.length} 處沒有走 token：\n`);
for (const p of problems) {
  console.error(`  ${p.file}:${p.line}`);
  console.error(`    ${p.prop}: ${p.raw}  —— ${p.why}`);
  console.error(`    → ${p.fix}\n`);
}
console.error(
  '間距尺與字級尺在 src/index.css 的 @theme（--space-* / --fs-*），顏色的語意層（--ink-* / --line* / --wash* / --veil-*）在第二個 :root。\n' +
    '真的需要新尺寸就加進那把尺，或加進 scripts/check-css-tokens.ts 的 GRANDFATHERED 並寫明理由。\n',
);
process.exit(1);
