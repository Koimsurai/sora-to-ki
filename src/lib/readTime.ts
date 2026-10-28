// 閱讀時間：一篇文章（或一節）要讀幾分鐘。
//
// 後端 backend/src/util.rs 的 read_minutes 是同一套規則（手記列表的分鐘數由後端算好送來），
// 兩邊的測試用同一組範例對齊——改這裡要一起改那邊，不然列表跟文章頁會顯示不同的分鐘數。
//
// 中日韓文一分鐘 400 字（技術文章比一般閱讀慢）、英文一分鐘 230 個詞、一張圖 10 秒、
// 程式碼一行 2 秒（掃過去，不是逐字讀）。原本是整份 markdown 原始碼的字數除以 500，連程式碼、
// 網址（圖片網址還帶著一長串尺寸與雜湊）、元件屬性都算進去，英文也當中文算，普遍高估四到五成。

const CJK_PER_MIN = 400;
const WORDS_PER_MIN = 230;
const SECONDS_PER_IMAGE = 10;
const SECONDS_PER_CODE_LINE = 2;

const CJK = /[㐀-鿿豈-﫿぀-ヿ가-힯]/g;
const WORD = /[A-Za-z0-9][A-Za-z0-9'’.-]*/g;

/** 一段純文字要讀幾秒（中日韓文照字數、其他照詞數） */
function textSeconds(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  const words = text.replace(CJK, ' ').match(WORD)?.length ?? 0;
  return (cjk / CJK_PER_MIN + words / WORDS_PER_MIN) * 60;
}

const toMinutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));

/** 一篇文章（markdown / MDX 原始碼）要讀幾分鐘，最少 1 分鐘 */
export function readMinutes(markdown: string): number {
  // 程式碼區塊（``` 或 ~~~ 圍起來的）只算行數，內容不當文字讀
  const prose: string[] = [];
  let fence: string | null = null;
  let codeLines = 0;
  for (const line of markdown.split('\n')) {
    const t = line.trimStart();
    if (fence) {
      if (t.startsWith(fence)) fence = null;
      else codeLines++;
    } else if (t.startsWith('```') || t.startsWith('~~~')) fence = t.slice(0, 3);
    else prose.push(line);
  }
  let text = prose.join('\n');
  const images = (text.match(/!\[[^\]]*\]\([^)]*\)/g)?.length ?? 0) + (text.match(/<img\b/gi)?.length ?? 0);
  text = text
    .replace(/`[^`\n]*`/g, ' x ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ');
  return toMinutes(textSeconds(text) + images * SECONDS_PER_IMAGE + codeLines * SECONDS_PER_CODE_LINE);
}

/**
 * 已經畫出來的一段內文（文章目錄的每一節）要讀幾分鐘：程式碼框照行數、圖照張數、其餘照字數。
 * 跟 readMinutes 同一組速度
 */
export function readMinutesOfElements(els: Iterable<Element>): number {
  let seconds = 0;
  for (const el of els) {
    const code: Element[] = el.matches('pre') ? [el] : [...el.querySelectorAll('pre')];
    for (const pre of code) seconds += (pre.textContent.split('\n').length - 1) * SECONDS_PER_CODE_LINE;
    seconds += (el.matches('img') ? 1 : el.querySelectorAll('img').length) * SECONDS_PER_IMAGE;
    if (!code.includes(el)) {
      // 程式碼框裡的字已經照行數算過了：拿掉它們再算字
      let text = el.textContent;
      for (const pre of code) text = text.replace(pre.textContent, ' ');
      seconds += textSeconds(text);
    }
  }
  return toMinutes(seconds);
}
