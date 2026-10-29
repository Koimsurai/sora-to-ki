// MDX <Diff lang="ts">…</Diff>：程式碼前後對比。行首 + 為新增、- 為刪除、其餘上下文。
// 重用站上既有的程式碼高亮（highlightCode）上色 base 語言，再依 diff 類型給每行加紅綠底 class。
// 文章頁的上色在伺服器編譯時就做好了（lib/mdx/codeHighlightTree，經 `highlighted` 屬性帶進來）；
// 沒有的時候（後台預覽之類）才在瀏覽器裡上色，先出樸素 pre。
import { useEffect, useMemo, useState } from 'react';
import { highlightCode } from '@/lib/mdx/codeHighlight';
import { parseDiff, tagDiffLines } from '@/lib/mdx/diffLines';
import { langEmoji } from '@/lib/langEmoji';
import { CodeBody } from './CodeSurface';

export default function DiffBlock({
  code = '',
  lang = 'text',
  title,
  highlighted,
}: {
  code?: string;
  lang?: string;
  title?: string;
  /** 伺服器上好色的 HTML（乾淨碼的高亮，還沒加 diff class） */
  highlighted?: string;
}) {
  const { code: clean, types } = useMemo(() => parseDiff(code), [code]);
  const [html, setHtml] = useState<string | null>(() => (highlighted ? tagDiffLines(highlighted, types) : null));

  useEffect(() => {
    if (highlighted) return;
    let cancelled = false;
    highlightCode(clean, lang)
      .then((h) => {
        if (!cancelled) setHtml(tagDiffLines(h, types));
      })
      .catch(() => {
        /* 失敗留 plain pre fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [clean, lang, types, highlighted]);

  const adds = types.filter((t) => t === 'add').length;
  const dels = types.filter((t) => t === 'del').length;

  return (
    <div className="code-block-wrapper mdx-diff">
      <div className="code-block-header">
        <span className="language-name">
          <span className="language-emoji" aria-hidden>
            {langEmoji(lang)}
          </span>
          {title ?? lang}
        </span>
        <span className="mdx-diff-stat" aria-label={`新增 ${adds} 行、刪除 ${dels} 行`}>
          <span className="mdx-diff-stat-add">+{adds}</span>
          <span className="mdx-diff-stat-del">−{dels}</span>
        </span>
      </div>
      <CodeBody highlighted={html} code={clean} />
    </div>
  );
}
