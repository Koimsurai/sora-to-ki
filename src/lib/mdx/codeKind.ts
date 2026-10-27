// 程式碼是區塊（``` 圍籬）還是行內（`code`）。
//
// MDX 與 react-markdown 給 code 元件的 props 裡都沒有 `inline`（那是 react-markdown 很舊的版本才有的），
// 只看 props 的話永遠是 undefined。可靠的訊號是內容本身：圍籬轉成 <pre><code> 時，
// mdast-util-to-hast 一定會在內容後面補一個換行；行內程式碼不會有換行結尾。
//
// 原本 CodeBlock 用 `!inline` 擋行內程式碼，結果行內的 `flowchart LR` 被當成一整張 mermaid 圖去畫，
// 畫不出來就在段落中間冒出「解析失敗」。

/** children 攤平成的文字（還沒去掉結尾換行） → 是不是區塊程式碼 */
export function isBlockCode(rawText: string): boolean {
  return rawText.endsWith('\n');
}
