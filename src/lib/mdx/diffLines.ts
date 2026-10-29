// <Diff> 區塊的文字處理（元件 components/mdx/DiffBlock 與伺服器上色 lib/mdx/codeHighlightTree 共用）。

export type LineType = 'add' | 'del' | 'ctx';

/** 解析 diff 文字：去掉每行的 +/-/space 標記，回傳乾淨碼 + 每行類型 */
export function parseDiff(raw: string): { code: string; types: LineType[] } {
  const lines = raw.replace(/^\n+/, '').replace(/\n+$/, '').split('\n');
  const types: LineType[] = [];
  const code = lines
    .map((l) => {
      if (l.startsWith('+')) {
        types.push('add');
        return l.slice(1);
      }
      if (l.startsWith('-')) {
        types.push('del');
        return l.slice(1);
      }
      types.push('ctx');
      return l.startsWith(' ') ? l.slice(1) : l;
    })
    .join('\n');
  return { code, types };
}

/** 高亮輸出每行一個 <span class="line">（lib/mdx/codeHighlight 刻意照 shiki 的結構排）；依序把 add/del 行補上 diff class（CSS 上紅綠底） */
export function tagDiffLines(html: string, types: LineType[]): string {
  let i = 0;
  return html.replace(/<span class="line"/g, () => {
    const t = types[i++];
    if (t === 'add') return '<span class="line diff-line-add"';
    if (t === 'del') return '<span class="line diff-line-del"';
    return '<span class="line"';
  });
}
