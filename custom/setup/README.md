# 設備頁的圖紙包

設備頁（`/setup`）是一艘太空梭的貨艙，四格貨艙各裝一張「圖紙」：一張線稿，上面有幾個標了編號的部件。
後台「頁面 → 設備」可以直接上傳一張圖、點圖放部件；這裡的圖紙包是**完整版**：

- 滑過零件表時，**整個部件**會亮成琥珀色（不只是引線與編號）
- 可以畫網路線、訊號圈、「見第幾張」這類程式畫的東西

放在這個資料夾的圖紙包，重新建置之後會出現在後台「圖紙」的下拉選單裡。
這個資料夾是給你改的：升級（`git pull`）時原專案不會動到這裡的檔案。

> ⚠ 用了圖紙包就要自己建映像：`docker compose up -d --build`。發版預先建好的映像裡沒有你的檔案。

## 一張圖紙包長這樣

```text
custom/setup/
  my-desk.ts             ← 圖紙的資料（這個檔名不重要，一支 .ts 一張或好幾張）
  my-desk.webp           ← 線稿：白色的線、透明底（會畫在深色的貨艙上）
  my-desk.parts.png      ← 部件分區圖：用下面的指令產生，不用自己畫
```

```ts
// custom/setup/my-desk.ts
import type { Sheet } from '../../src/components/about/setupSheets';

const sheet: Sheet = {
  id: 'my-desk', // 不要跟內建的 white-build、server、network、desk 撞名（撞名會蓋掉內建的那張）
  name: '我的桌面', // 後台下拉選單上的名字
  art: './my-desk.webp', // 相對這支檔案
  parts_map: './my-desk.parts.png', // 沒有就只亮引線與編號
  ratio: 1024 / 1536, // 線稿的「高 ÷ 寬」
  parts: [
    // 座標都是線稿寬高的百分比（0–100），從左上角量
    { key: 'monitor', at: [52, 30], b: [80, 8], seeds: [[[30, 10], [74, 10], [74, 52], [30, 52]]] },
    { key: 'keyboard', at: [45, 78], b: [12, 92], points: [[38, 80], [60, 80]] },
  ],
};

export default sheet;
```

每個部件：

| 欄位 | 是什麼 |
|---|---|
| `key` | 這個部件的代號。後台填的名稱與規格用它對回來，同一張圖紙裡不能重複 |
| `at` | 引線落在部件上的那一點 |
| `b` | 編號圈的位置（引線的另一端） |
| `seeds` | 選填：圈住這個部件的多邊形（一個或幾個）。圈裡的線就是這個部件 |
| `loose` | 選填：只認多邊形裡「獨立的小碎片」（例如浮起來的鍵帽），剛好穿過的長線不算 |
| `points` | 選填：再補幾個「這裡也是這個部件」的點 |

部件的順序就是畫面上的編號（第一個是 01）。完整的範例是內建那四張：
[`src/components/about/setupSheets.ts`](../../src/components/about/setupSheets.ts)
（網路那張有 `links`、`rings`、`refs` 的寫法）。

## 產生部件分區圖

```bash
pnpm exec tsx scripts/setup-part-maps.ts --only my-desk --preview /tmp/preview
```

它照 `seeds`、`loose`、`points` 與 `at` 從線稿的像素切出每個部件，存成 `parts_map` 寫的那個檔。
`--preview` 會輸出一張上色的對照圖：每個部件一種顏色，灰色是沒分到任何部件的線。
哪裡分錯了就調那個部件的 `seeds`，再跑一次。

## 交給 AI 改

用 Claude Code 這類工具的話，可以直接這樣說：

> 照 custom/setup/README.md 的格式，用 `<你的線稿>` 做一張設備頁的圖紙包放進 custom/setup/。
> 部件有：螢幕、鍵盤、滑鼠……（每個說一下大概在圖上哪裡）。
> 做完跑 `scripts/setup-part-maps.ts --only <id> --preview /tmp/preview`，看對照圖把分錯的部件修好。

做好之後重新建置，到後台「頁面 → 設備」選這張圖紙，再填每個部件的名稱與規格。
