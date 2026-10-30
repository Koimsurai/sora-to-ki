/**
 * Monaco 編輯器斜線指令片段庫（C-2）
 *
 * 內建 snippets + 使用者自訂 snippets（localStorage 持久化），
 * 讓部落格作者可以在不改 codebase 的情況下擴充自己常用的模板。
 *
 * 自訂格式（在瀏覽器 console 執行）：
 *   localStorage.setItem('koimsurai_user_snippets', JSON.stringify([
 *     { label: '/sig', detail: '簽名檔', body: '\\n— *Timo*  $0' },
 *     { label: '/ts',  detail: '今天日期', body: '${1:' + new Date().toISOString().slice(0,10) + '}' },
 *   ]));
 *
 * label 必須以 `/` 開頭；body 支援 Monaco snippet 語法（`$0`、`${1:placeholder}`）。
 */
import { at } from '@/i18n/admin-i18n';

export interface Snippet {
  label: string;
  detail: string;
  body: string;
}

// 說明與佔位字跟著後台語言，所以每次叫的時候才組（插進文章的語法本身不變）
function builtinSnippets(): Snippet[] {
  const header = at('monaco.snippet.tableHeader');
  return [
    { label: '/note', detail: 'GitHub Callout: Note', body: '> [!NOTE]\n> $0' },
    { label: '/tip', detail: 'GitHub Callout: Tip', body: '> [!TIP]\n> $0' },
    { label: '/important', detail: 'GitHub Callout: Important', body: '> [!IMPORTANT]\n> $0' },
    { label: '/warning', detail: 'GitHub Callout: Warning', body: '> [!WARNING]\n> $0' },
    { label: '/caution', detail: 'GitHub Callout: Caution', body: '> [!CAUTION]\n> $0' },
    { label: '/code', detail: at('monaco.snippet.code'), body: '```${1:ts}\n$0\n```' },
    {
      label: '/mermaid',
      detail: at('monaco.snippet.mermaid'),
      body: '```mermaid\nflowchart LR\n  A[$1] --> B[$0]\n```',
    },
    {
      label: '/table',
      detail: at('monaco.snippet.table'),
      body: `| \${1:${header}} | \${2:${header}} |\n| --- | --- |\n| $3 | $0 |`,
    },
    {
      label: '/details',
      detail: at('monaco.snippet.details'),
      body: `<details>\n<summary>\${1:${at('monaco.snippet.detailsSummary')}}</summary>\n\n$0\n\n</details>`,
    },
    { label: '/img', detail: at('monaco.snippet.img'), body: '![${1:alt}](${2:url})' },
    {
      label: '/fn',
      detail: at('monaco.snippet.footnote'),
      body: `\${1:${at('monaco.snippet.footnoteText')}}[^\${2:1}]\n\n[^\${2:1}]: $0`,
    },
  ];
}

const USER_SNIPPETS_KEY = 'koimsurai_user_snippets';

function loadUserSnippets(): Snippet[] {
  try {
    const raw = localStorage.getItem(USER_SNIPPETS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[])
      .filter((s): s is { label: string; detail?: unknown; body: string } => {
        if (typeof s !== 'object' || s === null) return false;
        const o = s as Record<string, unknown>;
        return typeof o.label === 'string' && o.label.startsWith('/') && typeof o.body === 'string';
      })
      .map((s) => ({
        label: s.label,
        detail: typeof s.detail === 'string' ? s.detail : at('monaco.snippet.userDefined'),
        body: s.body,
      }));
  } catch {
    return [];
  }
}

/**
 * 取得當前使用者可見的 snippets：使用者自訂的會 override 同名的內建項目。
 */
export function getActiveSnippets(): Snippet[] {
  const user = loadUserSnippets();
  const builtin = builtinSnippets();
  if (user.length === 0) return builtin;
  const userLabels = new Set(user.map((s) => s.label));
  return [...user, ...builtin.filter((s) => !userLabels.has(s.label))];
}
