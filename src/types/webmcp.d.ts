// WebMCP 宣告式工具屬性（Lighthouse「Agentic Browsing」稽核 / Chrome WebMCP 提案）。
// 加在 <form>（toolname/tooldescription）與其 input（toolparamdescription）上，讓瀏覽器內的
// AI agent 能辨識可呼叫的表單工具。React 執行期會透傳這些自訂屬性，這裡只是補上 TS 型別。
import 'react';

declare module 'react' {
  interface HTMLAttributes<T> {
    /** 表單作為 WebMCP 工具的名稱（放在 <form> 上）。 */
    toolname?: string;
    /** 表單工具的用途描述（放在 <form> 上）。 */
    tooldescription?: string;
    /** 單一輸入欄位作為工具參數的描述（放在 <input>/<select> 上，需搭配 name）。 */
    toolparamdescription?: string;
  }
}
