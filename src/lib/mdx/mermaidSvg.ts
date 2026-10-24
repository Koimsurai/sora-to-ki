// mermaid 語法 → SVG 字串。單獨一個模組是為了讓它能被「只在伺服器用」地引用：
// 元件裡的 SSR 分支靜態 import 它，client 分支改成動態 import，rollup 才切得開。
import { render } from 'pele';

/**
 * 產出**不含顏色**的 SVG：幾何交給 pele（Obsidian 開源的 mermaid 渲染器），配色全部留給 CSS。
 *
 * pele 的輸出用 `var(--pele-fg)`、`var(--pele-surface)` 這類變數上色，沒給值時才退回它自己的預設。
 * 變數由外層 `.mm-theme-*` 提供（見 blog/MermaidBlock.css）——換主題只是換一個 class，
 * 不需要重新渲染，client 端也就不需要渲染器。它同步、沒有執行期相依，也不碰 DOM，
 * 所以在伺服器端直接跑；輸出沒有 <script>、沒有對外請求。
 */
export function renderMermaidSvg(body: string): string {
  return render(body).svg;
}
