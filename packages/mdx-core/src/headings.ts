// 文章標題與章節編號：前台的目錄／錨點、後台的摘要連結編輯器、MCP 的大綱與連結檢查共用。
// 不依賴任何套件（前台會把它打進主 bundle），所以跟編譯管線分開放。

export interface RawHeading {
  text: string;
  level: number;
}

/**
 * 斷行：CRLF 算一個，並且 `\r` 與 U+2028 / U+2029 也都是行終止符。
 *
 * ⚠ 只 `split('\n')` 是不夠的。站上有幾篇文章是 CRLF 存進資料庫的，那樣切每行尾端會留一個
 * `\r`——而 JS 的 `.` **不吃行終止符**，沒有 `m` 旗標的 `$` 也不會在 `\r` 前成立，於是
 * `^(#{1,4})\s+(.+)$` 整個比對失敗，那幾篇的目錄會空到一條都不剩（實測有 3 篇會這樣）。
 * 舊寫法用的是 `gm`，`m` 讓 `$` 在 `\r` 前也算行尾，所以剛好躲過這件事。
 *
 * ⚠ 用 `new RegExp` 而不是 regex literal，是因為 U+2028 / U+2029 本身就是行終止符：
 * 字面字元放進 literal 會讓那一行沒收尾（tsc 報 Unterminated regular expression literal）。
 */
const LINE_BREAK = new RegExp(`\\r\\n|[\\n\\r${String.fromCharCode(0x2028, 0x2029)}]`);

/**
 * 從 markdown 內文抽 h1~h4，code block 裡的 `#` 不算。
 *
 * ⚠ 逐行掃而不是用 `content.replace(/```[\s\S]*?```/g, '')`，因為那個寫法有兩個漏洞：
 *   1. **沒閉合的 fence 完全擋不住**——非貪婪比對找不到收尾就整段不刪，後面 code 裡的
 *      `# 註解` 全部變成目錄項目。寫到一半的草稿常常就是這樣。
 *   2. `~~~` 也是合法的 fence，舊寫法只認 ```。
 * 這裡改成記住「是哪一種標記開的」，同種才收得掉；沒收掉就當文件到尾都還在 code block 內。
 */
export function scanHeadings(content: string): RawHeading[] {
  const out: RawHeading[] = [];
  let fence: string | null = null;
  for (const line of content.split(LINE_BREAK)) {
    const f = /^\s{0,3}(```+|~~~+)/.exec(line);
    if (f) {
      const kind = f[1][0];
      if (fence === null) fence = kind;
      else if (fence === kind) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const m = /^(#{1,4})\s+(.+)$/.exec(line);
    if (!m) continue;
    out.push({ text: m[2].trim(), level: m[1].length });
  }
  return out;
}

/**
 * 每個標題的章節編號，跟文章頁左邊留白印的一樣：第幾個 `##` 寫兩位數（`05`），
 * 它底下第幾個 `###` 再接 `.N`（`05.4`）。其他層級、以及出現在第一個 `##` 之前的 `###` 沒有編號。
 * 摘要裡連到章節的句子（`excerpt_links`）用這個編號，因為各語系的章節結構相同、標題文字不同。
 */
export function chapterNumbers(headings: readonly { level: number }[]): (string | undefined)[] {
  let major = 0;
  let minor = 0;
  return headings.map((h) => {
    if (h.level === 2) {
      major += 1;
      minor = 0;
      return String(major).padStart(2, '0');
    }
    if (h.level === 3 && major > 0) {
      minor += 1;
      return `${String(major).padStart(2, '0')}.${minor}`;
    }
    return undefined;
  });
}
