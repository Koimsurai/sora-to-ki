---
paths:
  - "src/**/*.css"
  - "src/**/*.tsx"
  - "scripts/check-css-tokens.ts"
  - ".config/biome.json"
---

# CSS 與 Tailwind class 守則

Tailwind 是 **v4**，設定在 `src/index.css` 的 `@theme` 裡，**沒有 tailwind.config.js
也沒有 postcss.config.js**（v4 自己處理 `@import` 與 vendor prefix，走 `@tailwindcss/vite`）。
要加自訂色／間距就寫進 `@theme`，不要試圖找設定檔。

**不要再為了蓋過全域樣式而堆特異性或加 `!important`。** v4 用的是**原生 cascade
layer**：`index.css` 的 `@layer base`（含那條全站 `button { 紫底 }` 與 hover 光暈）
是分層的，而所有元件 CSS 是未分層的——**未分層恆勝過分層，跟特異性無關**。

元件裡若還看到為了蓋過全域 `button` 而寫的高特異性繞過碼與註解，那是 v3 時代的遺跡，
不要照抄。真的遇到蓋不過去的情況，先確認你的規則有沒有被包進某個 layer。

## 間距、字級、行高、字距、圓角、模糊、陰影、堆疊層與過渡一律走 token，有一道檢查在擋

```bash
pnpm check:css-tokens      # CI 與 pre-commit 都跑
```

十把尺都定義在 `src/index.css` 的 `@theme`：

| | token | 範圍 |
|---|---|---|
| 間距 | `--space-px` … `--space-24` | 2px 格線到 24px，之後 4px／8px 步進 |
| 字級 | `--fs-10` … `--fs-56` | 16 格，10–14 是 1px 步進（91% 的用量在 10–18px） |
| 行高 | `--lh-100` … `--lh-185` | 9 格，0.1 格線；最後一格是 1.85（長文的閱讀節奏） |
| 字距 | `--ls-n4` … `--ls-30` | 11 格，數字是 em×100，`n` 開頭是負的 |
| 圓角 | `--r-2` … `--r-20` + `--r-full` + `--r-round` | 2px 格線到 20px；`--r-full` 是膠囊、`--r-round` 是 50% |
| 堆疊層 | `--z-float` … `--z-intro` | 11 格，1000 起跳每格 100；門檻是 1000 |
| 過渡時長 | `--dur-100` … `--dur-1000` | 9 格，密在 100–300ms |
| 緩動 | `--easing-standard` / `-out` / `-back` | 三條曲線；`ease` 那批關鍵字保持原樣 |
| 模糊 | `--blur-2` … `--blur-110` | 9 格，三個層級：2 劇透／4–28 玻璃／60–110 氛圍 |
| 陰影 | `--elev-0` … `--elev-6` | 7 格,**只管單層中性投影**；多層的不碰 |

`margin` / `padding` / `gap` / `font-size` / `line-height` / `letter-spacing` /
`border-radius` / `transition` 的時間與曲線不准再寫字面值；`z-index` 的門檻是 1000。
透明度另有一把 19 階的階梯（見下面）。

**圓角的 token 叫 `--r-*` 不是 `--radius-*`**，跟 `--fs-*` 同一個理由，而且更嚴重：
`--radius-*` 是 Tailwind v4 生 `rounded-*` 的 namespace，**這個專案已經有 shadcn 的
`--radius` / `--radius-sm/md/lg` 掛在上面**（`index.css` 的 `@theme inline` 開頭），
佔用它會改變後台每一顆 `rounded-md` 按鈕。

**膠囊一律用 `--r-full`。** 判準是**短邊 ≤ 2×半徑時瀏覽器會夾住**，所以寫在細元素上的小半徑
（捲軸滑塊、`.hero-caret`）其實也是膠囊。把它們換成 `--r-full` 是零像素變化，只有計算值會變——
判斷這類「computed 變了但畫面沒變」要靠量元素尺寸，不要靠看基準 diff 的筆數。

**`border-radius: 0` 與 `inherit` 刻意沒有 token**，寫 `var(--r-0)` 只會更難讀。
`30% 70%` 那種刻意捏形狀的百分比也不管，檢查只擋剛好 `50%`。

## 行高與字距

```
--lh-100 / 110 / 120 / 130 / 140 / 150 / 160 / 170 / 185      （數字是 ×100）
--ls-n4 / n2 / 1 / 2 / 4 / 6 / 8 / 12 / 18 / 24 / 30          （數字是 em×100，n 是負的）
```

**行高最後一格是 1.85 而不是 1.9,那是刻意的。** `.post-content`、`.tk-text`、
`.about-paragraph` 三個長文表面都寫 1.85——**三個一致代表那是設計過的閱讀節奏**，不是隨手打的。

**字距只認 `em`，寫 `px` 直接判錯。** px 字距不會跟著字級縮放，同一個 `1.5px` 放在
10px 與 16px 的標籤上鬆緊完全不同。換算時除以同區塊的 `font-size`（`var(--fs-N)` 的 N 就是 px；
繼承來的字級用瀏覽器量）。

**行高有三條豁免**，都是刻意的排版手法：`0`（`.vp` 影片容器殺掉行內間隙，同
`border-radius: 0` 的道理）、`0.8`（`.post-content.drop-cap-first` 的首字放大）、
`0.95`（`.expertise-hero-number` 的巨大數字）。

**computed-style 有守 `line-height`。** 全站沒有 `line-height: normal`（`@theme` 的
`--text-*--line-height` 都是絕對值），而 Chrome 對 `normal` 回傳的是字串不是 px，換字體也不會讓它
變成不同的數字。**排除某個屬性的理由要回頭驗，不要當成永久事實。**

## z-index：`--z-*` 十一格，門檻是 1000

```
--z-float 1000 → --z-header 1100 → --z-progress 1200 → --z-trail 1300 →
--z-modal 1400 → --z-menu 1500 → --z-fullscreen 1600 → --z-palette 1700 →
--z-toast 1800 → --z-ctx-menu 1900 → --z-intro 2000
```

**`check:css-tokens` 只擋 ≥1000 的字面 z-index，不是全部。** 1000 以下留給元件
內部的局部堆疊（`.mm-toolbar: 20`、`.floating-actions: 100`），那些數字只跟自己的
兄弟比，逼它們上尺是把局部問題硬講成全域問題。

**最重要的一件事：這個站的 z-index 大部分沒有全域意義。** 全站內容都關在
`.main-content-container` 裡（`AppShell.tsx` 給它 `position: relative; z-index: 10`），
那本身就是一個堆疊脈絡。例如：`.cmdk-backdrop` 寫 `10000`，照樣被容器**外面**
的 `.back-to-top`（`1000`）蓋住；`.mobile-toggle` 的 `1002` 是關在 `header.site-header`
（`1000`）裡的局部值。**所以不要用數字大小去推跨脈絡的勝負**——任何 portal 到
`document.body` 的東西（lightbox、mermaid 全螢幕、連結預覽卡、收藏編輯器、交友 modal）
自動贏過整個容器，不管它寫幾。

**覆蓋層一定要 portal 到 `document.body`。** 寫在頁面內容裡的話，多大的 z-index
都可能是假的：例如長在 `InfoPage` 的 `.post-body`（`z-index: 1`）裡的 `9999`，只是
「在 post-body 裡排第一」，對外仍然只有 1——遮罩明明是整個視窗大小，頂欄照樣浮在上面而且點得到。
公開頁的 modal 用 `common/Modal`（Radix Dialog），它會自己 portal。

**診斷這類問題不要讀 CSS 猜，用瀏覽器問。** 兩個工具：
`document.elementFromPoint(x, y)` 回答「這個位置上最後畫的是誰」（那是瀏覽器自己
算出來的結果）；往上走找「第一個建立堆疊脈絡的祖先」回答「這個數字跟誰比」。
`grep z-index` 看不出這類問題。

## 過渡：`--dur-*` 九格、`--easing-*` 三條

```
--dur-100 / 150 / 200 / 250 / 300 / 400 / 500 / 700 / 1000     （值就是 ms）
--easing-standard  cubic-bezier(0.4, 0, 0.2, 1)      一般的進出
--easing-out       cubic-bezier(0.22, 1, 0.36, 1)    快速起步、緩緩停下
--easing-back      cubic-bezier(0.34, 1.56, 0.64, 1) 帶回彈
```

`ease` / `linear` / `ease-in-out` / `ease-out` 這些**關鍵字保持原樣**，它們是標準寫法，
包成 token 只是多一層。

**時長只查 `transition*`，`animation*` 的時間刻意不上尺。** 兩者不是同一種東西：
站上的 animation 從 **50ms 的閃爍**到 **200 秒的星空漂移**都有，那是各自調出來的節奏
與週期，硬貼會把背景動畫變成災難。**緩動則兩邊都查**——曲線是設計決定，跟它是過渡
還是動畫無關。

兩個豁免，各有理由：`0.01ms` 是 `prefers-reduced-motion` 的關閉開關（那不是一個
時長）；`1.5s` 在 `.np-ambient-glow` 一處，離最近的一格 500ms，硬貼會走樣。

**改過渡時長前先確認沒有 JS 計時器配著它**（例如 `PostEditor` 的 350ms：zen 模式切換後
dispatch resize 讓 monaco 重算）。`grep setTimeout` 就查得完。

**`body::before` / `body::after`（全站顆粒與邊緣暗角）不在這把尺上。** 它們在
根脈絡、寫 49/50，所以實際上畫在**頂欄與所有 modal 之上**；兩層都是 `pointer-events: none`
的極淡覆蓋。要改成「只蓋內容」得把它們搬進容器，那是視覺決定，不是排版 bug。

## 陰影：`--elev-*` 七格，**只管單層中性投影**

```
--elev-0  0 1px  4px  black-50    貼合：小控制項（進度條拖曳鈕）
--elev-1  0 2px  8px  black-30    貼著表面：小卡片、標籤
--elev-2  0 4px  16px black-40    微抬
--elev-3  0 8px  24px black-45    卡片 hover、浮動控制
--elev-4  0 12px 32px black-50    下拉、面板
--elev-5  0 18px 48px black-50    大面板、popover
--elev-6  0 26px 72px black-55    modal
```

**這把尺刻意不管多層陰影。** 多層的（玻璃高光 + 投影、品牌色光暈）是刻意的組合，
硬收成一把尺只會把設計拆掉。尺管的是單層中性投影（`0 Ypx Bpx var(--black-NN)`）：
同一個角色用同一格，modal 用 `--elev-6`、popover 與大面板用 `--elev-5`。

**名字是 `--elev-*` 不是 `--shadow-*`**：後者是 Tailwind v4 的 namespace，而站上的 shadcn 元件
正在用 `shadow-xs/sm/md/lg/xl/2xl`。

**很多陰影掛在 hover／focus 上，靜態守門看不到。** `:hover` / `:focus-visible` / 條件渲染的覆蓋層
不會出現在 computed-style 的快照裡，驗那些要主動 hover（`.gallery-thumbnail-item` 還得先打開
照片檢視器）。

## 模糊：`--blur-*` 九格，三個層級不要互相貼

```
--blur-2                              劇透遮罩（看得出下面有字，但讀不出來）
--blur-4 / 8 / 12 / 16 / 20 / 28      玻璃面板的 backdrop-filter
--blur-60 / 110                       大面積氛圍模糊（背景光暈、模糊掉的封面圖）
```

**不准手寫 `-webkit-backdrop-filter`，只寫 `backdrop-filter`**，`check:css-tokens` 在擋。
建置用的 lightningcss 會把同一區塊的前綴版與沒前綴版當成同一個屬性、**只留後寫的那個**，
而慣例是前綴版寫在後面——於是 Chrome / Edge 拿到的只有它不認得的 `-webkit-`，計算值是 `none`。
只寫沒前綴的，lightningcss 會依目標瀏覽器自己補前綴給 Safari（產物裡兩個都在）。

寫錯的話全站毛玻璃會靜靜失效，而 tsc、lint、e2e 全綠——`html.no-gpu` 在測試瀏覽器一定會掛、
把 backdrop-filter 壓成 none，所以 e2e 量不到它（見下面「要清 `!important` 的話」那節）。
要驗得在有 GPU 的瀏覽器讀 `getComputedStyle(el).backdropFilter`。

**`saturate()` 一律寫在後面：`blur() saturate()`。**

**改 blur 沒辦法用 computed-style 或截圖驗**，因為 `html.no-gpu` 在測試瀏覽器一定會掛、
把 `backdrop-filter` 全部壓成 `none`。要驗就在瀏覽器裡 `classList.remove('no-gpu')` 之後
再讀計算值。

## 站點自己的品牌色：語意命名

`index.css` 的 `:root` 有 `--surface-0..3`（近黑背景，**依明度排，0 最深**：0 是頁面底、
1–3 是疊上去的面板與卡片）、`--ink`（主文字 `#e5e5f5`）、`--lavender` / `--lavender-soft`、
`--magenta` / `--magenta-deep`，**九個都配了 `-rgb`**（九個都有帶 alpha 的用法）。

跟下面那批 Tailwind 色票的差別：那批可以用客觀的色票名；這批不在任何公開色票上，只能靠語意命名。

`--surface-0..3` 四層**真的有層次差別**，不要再往下併。

## 調色盤：Tailwind v3 色票名

`index.css` 的 `:root` 有 `--zinc-100…900`、`--purple-300/500`、`--violet-300/400/500`、
`--amber-300/400`、`--red-300/400/500`、`--green-300/400/500`、`--pink-500`，各配一個
`-rgb` 三元組（帶 alpha 時寫 `rgba(var(--zinc-100-rgb), a)`）。

另有 `--sky-300` / `--blue-500` / `--blue-600` / `--red-600` / `--purple-200`。為什麼用色票名：
站上的底色大多**一字不差**就是 Tailwind v3 色票，用它命名是客觀的，不用猜語意。

**新增色票的門檻是用了 3 次以上**——低於這個數，token 只是多一層間接，還會把調色盤撐肥。
例外是 `--sky-300`：它讓 `markdown-alert-note` 跟另外四種 alert 一致。

**方向是「Tailwind 指向這份色票」，不是反過來。** `@theme` 裡的 `--color-green-400`
等宣告成 `var(--green-400)`，所以 TSX 的 `text-green-400` 拿到的就是 :root 這份 v3 hex。
反方向（CSS 寫 `var(--color-purple-300)`）不行：
v4 的 oklch 不等於 v3 hex，而且 Tailwind 只輸出被 utility 用到的 shade——跟 `--text-3xl`
被 tree-shake 掉是同一個陷阱。**加新色時 :root 與 `@theme` 兩邊都要加**，`check:css-tokens`
的規則 4 會接著要求所有等值的字面色改用它。

**把 gradient 裡的字面色換成 `var()` 會讓 computed-style 報 `background-image` 變了，
但那不是視覺變化。** 差別只在 `at 50% 0px` vs `at 50% 0%`：來源 CSS 寫的是 `0%`，把它折成
`0px` 是 lightningcss 對**純字面值** gradient 做的 minify，換成 `var()` 之後 gradient 不再是
常數，minifier 就跳過它。位置 0 不管單位都是 0，直接更新基準即可。判斷方法：拿兩個 build
在同一個 stack 上跑同一支 probe，不要看 hash 猜。

**字面值等於某個 token 的值就必須用 token**，`check:css-tokens` 的規則 4 在擋，
token 表是從 `index.css` 讀的，加新 token 不用改腳本。這條零誤判：值都相等了，
寫字面值只剩「不知道有 token」一種原因。

Happy Hues 那組只剩 `--clr-headline` / `-paragraph` / `-button` / `-button-text` / `-tertiary`
還在用。`--brand-light` 指向 `var(--violet-300)`——它就是那個色票，不要另抄一份 hex。

## 等寬字只有一套堆疊：`--mono-font`

```
--mono-font: "Fira Code", "JetBrains Mono", "SF Mono", ui-monospace, Consolas,
             var(--cjk-font), monospace;
```

程式碼、時間戳、commit SHA 這類等寬文字一律用 `var(--mono-font)`。站上**沒有 `@font-face`
也沒有從 CDN 載任何等寬字**，另寫一套堆疊（例如 `"Courier New", monospace`）會真的渲染成
不同字體，同一個站就出現兩種等寬字。

`var(--cjk-font)` 放在 `monospace` 之前是刻意的：那是 sans-serif 鏈，讓程式碼裡的
中文走比例字體——CJK 等寬字很少而且不好看。

## `opacity` 也走那把 19 階的階梯

這條**不是**「要用 token」，是「值要在階梯上」——`--white-NN` 那些是顏色，不能拿來
當 `opacity`。但兩者量的是同一件事（多透明），所以共用同一套詞彙。

`opacity` **不在 computed-style 的 PROPS 裡**（動畫元素上逐幀不同），所以這一條
只有 `check:css-tokens` 在守，改它的時候不會有第二道保險。

## 外部服務的品牌色：命名但**不能併值**

`--svc-spotify` / `--svc-steam` / `--svc-youtube` / `--svc-instagram` / `--svc-bilibili`，
各配 `-rgb`。另外 `--diff-add` / `--diff-del` 是 GitHub 的 diff 綠紅，同時用在程式碼
diff 與數據趨勢的升降，所以用**角色**命名而不是 `--svc-github-*`。

**這些的值不能動也不能貼到調色盤**——Spotify 的綠就是 Spotify 的綠，貼到
`--green-500` 就不是那個品牌了。收成 token 的理由不是收斂，是**同一個 hex 散在多個檔案裡重複**。

## 有四類顏色刻意留成字面值，不要「順手」收掉

| | 為什麼留 |
|---|---|
| 不透明黑白 | `color: #fff` 是最慣用的寫法，包成 token 讀起來更遠 |
| 自成一套的主題／漸層集合 | 見下面 |
| 調色盤自己的定義行 | 那就是調色盤 |
| 元件內的區域色定義 | 只有一個元件在用的裝飾色 |
| 其餘只用 ≤2 次的字面值 | 不值得 token |

**「自成一套」是一個判準**：`.mm-theme-deep/-zinc/-tokyo/-nord/-light`
（五個結構一模一樣的 7 行圖表主題）、`Music.css` 的 `--feat-energy/-dance/-valence`
（三條一組的漸層）。**只把其中一兩個改成 `var()` 會讓它們跟兄弟讀起來不一樣**，而那些
區塊的價值就是「一眼看完整套配色」。`markdown-alert-*` 是反例：它**本來就不成套**
（`important` 早就在用 `var(--brand-light)`，另外四個是字面值），所以那一組收掉是修
不一致，不是破壞對稱。

**判斷「能不能併」要算 Lab 色差，不要看 hex 長得像不像。** 兩個實例：
`#8b7cf6` vs `--violet-500` `#8b5cf6` 只差一個字元，**ΔE 22.3**；
`#dc3250` vs `--magenta` `#dc3278` 前四碼相同，**ΔE 23.2**。兩個都不能併，
各自給了名字（`--iris` / `--crimson`）。真正接近的是 `#e2e0ea` 對 `--ink`（ΔE 3.6），
那個併掉了。

## 透明度也有一把尺：19 階，白／黑／品牌紫共用

```
0.02 0.04 0.06 0.08 0.10 · 0.15 0.20 0.25 0.30 0.35 0.40 0.45 0.50 0.55 0.60 · 0.70 0.80 0.90 0.95
```

低端 0.02 步（髮絲線，0.02 與 0.04 在感知上差兩倍）、中段 0.05、高段 0.10。定義在
`index.css` 的 `--white-NN` / `--black-NN`（NN 就是 alpha×100）。規則：

- `rgba(255,255,255,a)` / `rgba(0,0,0,a)` **不准寫字面值**，用 `var(--white-NN)` / `var(--black-NN)`。
- 品牌紫維持 `rgba(var(--brand-rgb), a)` 的寫法，但 `a` 必須在階梯上。
- 其他底色的 rgba／hsla／`#rrggbbaa` 的 alpha 也必須在階梯上（底色本身的命名是另一批的事）。
- `check:css-tokens` 在擋，含 `--xxx: var(--white-NN)` 這種**定義行**。

**底色／alpha 這類改動，截圖的像素差數字沒有判斷力**：全頁 gradient 的 stop alpha 動 0.05，
每個像素都會超過一般的差異門檻。要把門檻拉到 >40 只看結構性變化，再對剩下的區塊逐一裁圖。
首頁 Hero 有時會在打字機揭露前被拍到——看到 Hero 整塊空白先重拍一次，別急著當成回歸。

**字級的 token 叫 `--fs-*` 不是 `--text-*`**，兩個理由都會咬人：
`--text-*` 是 Tailwind v4 生 utility 的 namespace（佔用它會改變 `text-sm` 產出什麼），
而且這個專案的 `--text-primary` / `-secondary` / `-tertiary` **已經是顏色**。

**也不要直接 `var(--text-3xl)`。** v4 會 tree-shake 掉沒被 utility 用到的 theme
變數——沒有 utility 用到的（例如 3xl / 4xl / 5xl）**在建置產物裡根本不存在**，
引用它是未定義、字級直接退回繼承值，而且不會有任何錯誤訊息。

字級的 `em` 與 `clamp()` 刻意不檢查：`em` 是相對父層字級的（MdxContent 有一批
`0.55em` / `0.82em` / `1.05em` 就是要跟著父層走），`clamp()` 是流體字級。

**這道檢查不是潔癖。** 沒有它，間距與字級會再長回幾十種「打了覺得差不多」的值
（`0.35rem`、`0.72rem` 這種沒有人決定過的數字）。

真的需要新尺寸有兩條路，兩條都會在 review 裡被看見：加進 `index.css` 的尺（比較好），
或加進 `scripts/check-css-tokens.ts` 的 `GRANDFATHERED` 並寫明理由。那份名單是**存量
不是許可**：只放負值（沒有負的 token 形式）這類真的貼不上尺的。

**判斷一個值能不能貼到尺上：間距用絕對差，alpha 用相對差。** `3px → 4px` 的相對誤差 33%
看起來很大，但絕對誤差只有 1px，看不出來；alpha 那把尺的低端刻意細步，正是因為 0.02 與 0.04
在感知上差兩倍。「還沒決定要不要收進尺」不是豁免的理由，是待辦。

## 頁面外框的上下留白：`--page-top` / `--page-bottom`

站台頂欄是 `position: fixed`、高 **60px**（≤480px 時 56px），所以每個頁面的最外層都得
自己留出那段高度。各頁面一律用這兩個 token，不要自己編數字（寫 `60px` 等於淨空 0，內容正好貼著頂欄底邊）。

```
--page-top:    var(--space-24)  96px    桌機：頂欄 60 + 淨空 36
--page-bottom: var(--space-16)  64px
@media (max-width: 768px)
--page-top:    var(--space-20)  80px    頂欄 60（≤480 時 56）+ 淨空 20~24
--page-bottom: var(--space-12)  48px
```

**下緣刻意比上緣小。** 頁面底下沒有頁尾（2026-10 翻新拿掉了），64px 就是捲到底時最後一行字
離視窗底邊的距離。

**斷點只有一個（768px）。** 各頁自己的 media query 保留，但**只管左右留白**——
上下交給這兩個 token，不要在頁面層覆寫。

**寫 CSS 的剖析腳本時，註解要換成等長空白，不要「跳過起點在註解裡的 match」。**
`/* critical: keep sticky working */` 這種含冒號的註解本身長得像一條宣告，而宣告的值
是 `[^;{}]+`——它會一路吃到下一個分號，**把註解後面那條真的宣告整條吞進去**；那個 match
因為起點在註解裡被跳過，而 `finditer` 不重疊，於是後面那條永遠沒被看到。

## 媒體斷點有十幾種，**那不是債，不要去收它**

看起來跟間距的雜亂值是同一種病，**但不是**。間距的問題是「同一個角色沒有標準
答案」；斷點的值是**由那個元件自己的內容寬度決定的**——「這個 grid 在這裡塞不下了」。
只用一兩次的斷點各有用途：

| 斷點 | 在做什麼 |
|---|---|
| 1300 / 1100 / 950 | `article-shell` 三欄佈局的**三段崩解階梯**（先收左側欄，再收…） |
| 860 | `HomeLately` 的 `.lately-grid` 收成單欄 |
| 600 | `InfoPage` 的朋友清單收成單欄 |
| 560 | `FavoritesEditor` 的 `.fe-add-row` 換行 |

把左側欄從 1300 改成 1024 才消失，是為了數字好看而改變版面崩解的位置。

同一個選擇器出現在多個斷點（`.blog-content-wrapper` 1024→768→480、`.exif-panel`
1024→768→640…）是**同一個元件的漸進崩解**，不是不一致。

而且 `computed-style` **蓋不到斷點改動**：它只跑 1280 / 768 / 390 三個寬度，
把某條規則從 900 改到 1024，變的是 901–1024 那一段，三個寬度一個都沒踩到。
真要動斷點就得另外寫「掃寬度」的驗證。

## CSS 的 formatter 與 linter 是 Biome，不是 oxlint

```bash
pnpm lint:css      # 檢查（CI 跑的是這一條）
pnpm format:css    # 自動修格式
```

**Biome 在這個專案只管 CSS。** JS/TS 是 oxlint 的地盤——兩個 linter 管同一批檔案只會
產生互相矛盾的意見，而且 Biome 沒有等價的型別感知檢查，換過去是降級。設定裡
`javascript` 與 `json` 的 formatter 都明確關掉了。

`.config/biome.json` 需要 `"root": false`：Biome 看到設定檔不在專案根就當它是
巢狀設定，少了這行會報 "Found a nested root configuration"。
另外 v4 的 `@plugin` / `@custom-variant` 要開 `css.parser.tailwindDirectives`，
否則會被當成語法錯誤。

**CI 刻意不加 `--error-on-warnings`**：`pnpm lint:css` 的 warning 全是 `noImportantStyles`
（見下面的 `!important` 那節），會出現在 CI 輸出但不擋——用 ignore 藏起來就沒有人會回來清。
`noDescendingSpecificity` 的例外用 `biome-ignore` 標了理由。
**格式漂移不一樣，它是 error，會直接讓 CI 紅。**

`noDescendingSpecificity` **不是**在抓「覆蓋失效」——高特異性的規則不管寫在前面還是
後面都會贏，行為是對的。它守的是**可讀性**：覆蓋用的選擇器應該寫在被覆蓋者之後，
否則讀的人要同時在腦中跑「原始碼順序」與「特異性」兩套機制。要清的話是把 base 規則
搬到狀態變體前面，純搬移、零行為變化。

## TSX 裡的 Tailwind class 由 `@shadcn/lint` 守（掛在 oxlint 上）

`check:css-tokens` 只讀 `.css`，TSX 的 className 由這組規則守，避免 `text-[11px]` 這類
字面值繞過尺。設定在 `vite.config.ts` 的
`lint` 區塊（`jsPlugins` + `shadcn/*`），跟著 `pnpm exec vp lint … --max-warnings 0` 一起跑，不用另外接 CI。

| 規則 | 狀態 | 理由 |
|---|---|---|
| `no-arbitrary-values` | **error**（`allow: layout`） | 寬高與 `85vh` 這類版面尺寸本來就沒有尺；字級／間距／顏色要走尺 |
| `no-raw-colors` | **error** | 只准站上的色票（見調色盤那節）與 shadcn 語意色 |
| `no-restyle` | **error**（`allow: layout` + contracts） | 外觀走元件的 variant／size，頁面只決定擺哪、多寬 |
| `require-static-classes` | **error** | 純畫線 |
| `no-unknown-classes` | off | 假設全站只用 Tailwind；公開頁用 CSS 檔的 class，全是誤報 |
| `no-inline-styles` | off | 那些是 JS 算出來的動態位置（星星、軌道），inline style 是正確做法 |

後台的外觀寫在元件的 variant／size 裡，**不要在呼叫點手動壓尺寸或手寫顏色**：

| 元件 | 加了什麼 |
|---|---|
| Button | `size="compact"`（h-8）／`"xs"`（h-7）、`variant="subtle"`（淡邊框）、`tone=`（審核動作的語意色：success／danger／destructive／neutral／accent／info／caution／muted） |
| Input／SelectTrigger | `size="compact"`／`"sm"`、`variant="glass"`（後台面板的半透明框） |
| AlertDialogAction | `variant`（跟 Button 同一組） |
| Label | `size="xs"` |
| FormLabel／AvatarFallback | 後台慣用的樣式直接成為預設值（只有後台在用這些元件） |

contracts 放行的四個例外都有理由：Input 的 `pl-8`／`pl-9`（左側有搜尋圖示）、AvatarFallback
與 DialogTitle 的字級（跟著頭像大小／對話框層級走）、FormLabel 的 `gap-1.5`（帶圖示的 label）。

**Input 的 `compact` 是 text-sm 不是 text-xs，那是照實際畫面定的。** 基底的 `md:text-sm` 是另一個
variant，呼叫點寫的 `text-xs` 蓋不掉——所以那些「12px 的輸入框」在桌機上**一直是 14px**。
要真的改成 12px 是設計決定，不是重構。

FormLabel 的錯誤色要排在 `className` **之後**：反過來的話，呼叫點傳進的 `text-muted-foreground`
會蓋掉它，驗證失敗時 label 不會變紅。

`no-raw-colors` 對四個檔案整檔關掉（`overrides`）：NotFound 的 SVG 插畫、BrandIcons、
SignatureSVG 的金色漸層、ZeroGravityLibrary 的 3D 燈光色——全是「自成一套」或品牌色。

**字級在 Tailwind 裡叫 `text-fs-11`，而且 `cn()` 一定要認得它。** `--text-fs-*` 在
`@theme` 把 `--fs-*` 接成 utility；**預設的 tailwind-merge 會把 `text-fs-11` 當成文字顏色**，
`cn('text-fs-11 text-red-400')` 會靜靜刪掉字級。`src/lib/utils.ts` 擴充了清單，
`utils.test.ts` 會檢查清單跟 `index.css` 同步。

**`dark:` variant 在這個站是死碼。** `@custom-variant dark` 要 `.dark` 祖先，而全站沒有任何
地方掛它。看到 `bg-gray-100 dark:bg-gray-800` 這種寫法，實際生效的是**淺色**那個。

**不要裝 `@tailwindcss/typography` 來做排版，也不要寫 `prose-*`**（沒裝，寫了等於沒排版）。
後台的預覽一律用 `admin/PostPreview.tsx`（跟前台同一套渲染管線）；補 plugin 會讓每個公開頁
多下載一份全域樣式。

**文章的 markdown 清單靠 `article-shell.css` 補回符號**（`.post-content ul:not([class])`）。
Tailwind 的 preflight 把 `list-style` 歸零，不補的話清單沒有符號、有序清單沒有數字。
`list-style` 不在 computed-style 的 PROPS 裡，守它的是
`blog-post.spec.ts` 的「markdown 清單有項目符號」。只補沒有 class 的清單：MDX 區塊與 GFM 待辦
清單都帶自己的 class。

## 剩下的 `!important` 都是查過的，不要再清一次

**剩下的每一個都有註解寫明理由**，看到 linter 報 warning 不要直接拿掉——先讀那條規則上面的註解：

| 類別 | 為什麼留 |
|---|---|
| `@media (prefers-reduced-motion)` | 要蓋過全站元件動畫；**測試瀏覽器不會觸發** |
| `html.no-gpu *` | 無 GPU 機器的降級；**測試瀏覽器一定會觸發**（見下面） |
| `html.fs-active` | 全螢幕影片的 GPU 爭用修正；不會被觸發 |
| shiki 背景、`.toc-bottom-link` 邊框 | 壓 shiki 自己的主題／全域 button 規則 |
| 後台表單邊框、monaco 捲軸與行號 | 壓 shadcn utility 與 monaco 注入的樣式 |
| `.galaxy-bubble`（手機版） | 壓元件用 inline style 算出來的泡泡大小 |

**不要用 `grep -c '!important'` 數它**——會把**註解裡在討論** `!important` 的句子也算進去。
要數就跑 `pnpm lint:css`，biome 認的是語法樹。
同一個坑也會發生在數色彩字面值上。

**壓 inline style 是最常見的正當理由**（shiki、monaco、galaxy-bubble 都是這類）——
inline style 只有 `!important` 蓋得過，這種情況不管 cascade layer 怎麼排都一樣。
判斷「這個 `!important` 是不是多餘」時，先看它要蓋的對象是不是 JS 寫進 `style=""` 的。

## 要清 `!important` 的話，這套方法才測得準

**像素比對測不準。** mermaid 的渲染時序、Spotify CDN 的專輯圖都會產生大量像素噪音，
真正的 CSS 變化會被淹掉。改用 **`getComputedStyle` 比對**：它是 cascade 的最終結果，跟圖片載到
第幾張無關。噪音只剩動畫屬性（`transform`/`opacity`）與被 `html.no-gpu` 壓掉的
`filter`/`backdrop-filter`，過濾掉就是確定性的。

**`prefers-reduced-motion` 與 `html.fs-active` 在測試環境不會套用**，所以那兩類
「量到 0 差異」不代表安全，要靠讀規則判斷。

**但 `html.no-gpu` 會套用，而且是反過來的問題。** 無頭 Chromium 就是軟體渲染，
`SpaceBackdropShell` 的 GPU 探測（`lib/webglSupport.ts`）一律判成軟體渲染 → 那個 class 一定掛上去。後果是 `html.no-gpu *` 把**每一個元素**的
`backdrop-filter` 壓成 `none !important`，光暈類的 `filter` 也一樣。所以：

- 量 `backdrop-filter` / `filter` 時要先 `document.documentElement.classList.remove('no-gpu')`，
  否則量到的是降級後的畫面，不是使用者看到的。
- **這兩個屬性也因此不能收進 `computed-style` 的 PROPS**：基準會把「這台 runner
  沒有 GPU」寫死進去，而且那個 class 是 lazy + ClientOnly **非同步**掛的，
  快照拍到掛上前還是掛上後不保證。詳見那支 spec 裡 PROPS 上面的說明。

**`:hover` / `:focus` 也要主動觸發。** 靜態截圖與靜態 computed style 都碰不到。
做法是從 CSS 反推「哪些選擇器 × 哪些狀態」帶著 `!important`，再逐一 hover/focus。
切狀態前要先關掉 transition，否則抓到的是過渡中的中間值。

**base 用了 `!important`，狀態變體就必須跟著用。** 只補一半的下場是 base 反過來
蓋掉 `:hover`/`:focus`——滑過去完全不變色，而靜態截圖看不出來。

**後台要驗就起 e2e stack**（`node tests/e2e/stack.mjs`），照
`tests/e2e/admin-session.ts` 自己簽一個 OWNER token 塞 localStorage，
不需要碰正式環境的任何密鑰。但注意**每次重啟 stack 會重灌種子**，
`/admin/subscribers` 的表格欄寬會跟著變（`table-layout: auto` 依內容分配）——
那不是 CSS 回歸。噪音對照要「重啟 stack 之後再比一次」才有意義。
