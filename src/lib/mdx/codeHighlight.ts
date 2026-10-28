// 程式碼高亮：@pierre/highlights（用 WebAssembly 寫的高亮器，2026-10 從 shiki 換過來）。
//
// 為什麼換：一包 wasm 裡就有 121 種語言，載入後同步呼叫，不用再按語言各下載一份 grammar，
// C 家族也不用再多載 oniguruma（231 KB gzip）。換之前拿正式站所有已發布文章的程式碼（2026-10：
// 23 篇、632 段，含各語系譯文）兩邊各跑一次逐字比顏色：ts、yaml、json、rust 九成左右一樣，
// bash、python 差比較多是兩邊切 token 的方式不同，看起來差不多。整份跑完 shiki 1.6 秒、這個 7 毫秒。
// 沒有的語言（console、stylus、fish、regex）退回純文字；console 在 shiki 那時也不在白名單，一樣是純文字。
//
// 輸出刻意照 shiki 的結構排：<pre class="shiki"> 裡每一行是一個 <span class="line">。
// 行號（CSS counter）、DiffBlock 的紅綠底、終端機框都靠這一層，套件自己的 codeToHtml 沒有，
// 所以用 codeToTokens 自己組。
import type * as HighlightsModule from '@pierre/highlights';
import type { Theme, ThemedToken } from '@pierre/highlights';

/** 主題沿用換之前的 vitesse-dark（套件內建同名主題），換套件時文章的配色不變 */
const THEME_CLASS = 'vitesse-dark';
const FALLBACK_LANG = 'text';

/** 套件不認得、但文章裡會寫的別名 → 它認得的名字 */
const LANG_ALIAS: Record<string, string> = {
  svg: 'xml',
  mysql: 'sql',
  postgresql: 'sql',
  plsql: 'sql',
  'objective-c': 'objc',
  makefile: 'make',
};

type Highlights = typeof HighlightsModule;
let loaded: Promise<{ hl: Highlights; theme: Theme }> | null = null;

/** 第一次用到才載（wasm 內嵌在模組裡，載完就能同步呼叫）；文章頁沒有程式碼就不付這筆 */
function load() {
  loaded ??= Promise.all([import('@pierre/highlights'), import('@pierre/highlights/themes/vitesse-dark')]).then(
    ([hl, theme]) => ({ hl, theme: theme.default }),
  );
  return loaded;
}

/** 文章裡寫的語言 → 套件的語言名稱；認不得的退回純文字 */
export function resolveLang(input: string | undefined, isSupported: (lang: string) => boolean): string {
  if (!input) return FALLBACK_LANG;
  const lower = String(input).toLowerCase();
  const lang = Object.hasOwn(LANG_ALIAS, lower) ? LANG_ALIAS[lower] : lower;
  return isSupported(lang) ? lang : FALLBACK_LANG;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 一個 token 的 inline style（字型樣式照 shiki 的位元：1 斜體、2 粗體、4 底線、8 刪除線） */
function tokenStyle(t: ThemedToken): string {
  const parts = t.color ? [`color:${t.color}`] : [];
  const fs = t.fontStyle ?? 0;
  if (fs > 0) {
    if (fs & 1) parts.push('font-style:italic');
    if (fs & 2) parts.push('font-weight:bold');
    const lines = [fs & 4 ? 'underline' : '', fs & 8 ? 'line-through' : ''].filter(Boolean);
    if (lines.length) parts.push(`text-decoration:${lines.join(' ')}`);
  }
  return parts.join(';');
}

export async function highlightCode(code: string, langInput?: string): Promise<string> {
  const { hl, theme } = await load();
  const lang = resolveLang(langInput, hl.isSupportedLanguage);
  const { tokens, fg, bg } = hl.codeToTokens(code, {
    lang: hl.isSupportedLanguage(lang) ? lang : FALLBACK_LANG,
    theme,
  });
  const lines = tokens.map(
    (line) =>
      `<span class="line">${line
        .map((t) => {
          const style = tokenStyle(t);
          return style ? `<span style="${style}">${escapeHtml(t.content)}</span>` : escapeHtml(t.content);
        })
        .join('')}</span>`,
  );
  return `<pre class="shiki ${THEME_CLASS}" style="background-color:${bg};color:${fg}" tabindex="0"><code>${lines.join('\n')}</code></pre>`;
}
