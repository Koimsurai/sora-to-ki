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
 *   3. 透明度不在 19 階的階梯上  → 錯（白／黑要用 --white-NN / --black-NN；
 *      品牌紫 rgba(var(--brand-rgb), a) 與其他底色的 a 都得在階梯上）
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
  // 頁面外框的上下留白。⚠ **這 8 個值是同一個角色**：固定頂欄底下的頁面留白，
  // 出現在 .info-page / .tk-page / .w-page / .wl-page / .setup-content /
  // .blog- .bookshelf- .music- .activity-content-wrapper / .nf-page / .app-footer
  // 共 24 條宣告——桌機卻有 90 / 100 / 120 三種值，窄視窗有 60 / 70 / 100 三種。
  // 那是「每個頁面自己編一個」，不是版面必要的差異。統一它會讓 8 個頁面的內容
  // 上下各移動最多 30px，是設計決定不是 codemod 的事，所以先留在這裡當待辦。
  '60px',
  '70px',
  '72px',
  '88px',
  '90px',
  '100px',
  '120px',
  '5.5rem',
  '8rem',
  // 負值：沒有負的 token 形式（寫 `calc(-1 * var(--space-10))` 更難讀）
  '-1px',
  '-4px',
  '-6px',
  '-12px',
  '-120px',
  '-0.5rem',
  '-1.2rem',
  '-1.5rem',
  '-2.5rem',
  // 一處 padding-left 的補償值，跟上面的頁面留白同一批待辦
  '2.75rem',
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

/**
 * 時長的豁免。兩條，各有理由：
 *   · `0.01ms` —— `prefers-reduced-motion` 的關閉開關，那不是一個時長
 *   · `1.5s`   —— `.np-ambient-glow` 一處，離最近的一格 500ms，硬貼會走樣
 */
const DUR_GRANDFATHERED = new Set(['0.01ms', '1.5s']);

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
 * 行高的豁免。三條都是刻意的排版手法，貼到尺上會壞：
 *   · `0`    —— `.vp` 影片容器殺掉行內間隙，寫 0 最清楚（同 `border-radius: 0`）
 *   · `0.8`  —— `.post-content.drop-cap-first` 的首字放大
 *   · `0.95` —— `.expertise-hero-number` 的巨大數字
 */
const LH_GRANDFATHERED = new Set(['0', '0.8', '0.95']);

/**
 * `blur()` 的半徑尺（`--blur-*`，名字就是 px）。只查 `filter` / `backdrop-filter`
 * 與它們的 `-webkit-` 前綴版——**前綴版必須跟沒前綴的同值**，不然 Safari 拿到的
 * 模糊跟 Chrome 不一樣，而那是靜態檢查唯一抓得到的地方。
 *
 * ⚠ 只查 `blur()`，不查 `drop-shadow()` / `brightness()` / `saturate()`：
 * 那些是陰影與亮度，不是模糊，各自的值域完全不同。
 */
const BLUR_PX = new Set<number>();
for (const m of blankComments(INDEX_CSS).matchAll(/--blur-(\d+)\s*:/g)) BLUR_PX.add(Number(m[1]));
const FILTER_PROP = /^(-webkit-)?(backdrop-)?filter$/;
const BLUR_CALL = /blur\((\d*\.?\d+)px\)/g;

/**
 * 高度（陰影）尺 `--elev-*`。
 *
 * ⚠ 這條**只擋單層中性投影**（`0 Ypx Bpx var(--black-NN)`），不是所有 box-shadow。
 * 全站 162 個非 none 的陰影裡有 104 個是多層的（玻璃高光 + 投影、品牌色光暈），
 * 那些是刻意的組合，硬收成一把尺只會把設計拆掉。尺管的是另外那 48 個——
 * 它們卻有 36 種不同的 `(y, blur, alpha)`，也就是「每個人自己發明一個陰影」。
 *
 * ⚠ 名字是 `--elev-*` 不是 `--shadow-*`：後者是 Tailwind v4 的 namespace，而站上有
 * 6 個 shadcn 的 `shadow-xs/sm/md/lg/xl/2xl` 正在用。
 */
const ELEV_VALUE = new Map<string, string>();
for (const m of blankComments(INDEX_CSS).matchAll(/(--elev-\d+)\s*:\s*([^;]+);/g)) {
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

const files = walk('src');
const problems = files.flatMap(check);

if (problems.length === 0) {
  console.log(
    `✅ 間距、字級、行高、字距、圓角、模糊、陰影、堆疊層、過渡與透明度 token：檢查 ${files.length} 個 CSS 檔，沒有現編的值`,
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
  '間距尺與字級尺在 src/index.css 的 @theme（--space-* / --fs-*），透明度階梯在 :root（--white-NN / --black-NN）。\n' +
    '真的需要新尺寸就加進那把尺，或加進 scripts/check-css-tokens.ts 的 GRANDFATHERED 並寫明理由。\n',
);
process.exit(1);
