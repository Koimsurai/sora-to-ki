// 一般 CodeBlock 與 CodeTabs 共用的程式碼呈現，確保兩者視覺一致：
//   CodeBody：shiki 高亮輸出（或 fallback）+ 長碼「展開程式碼」收合。行號由 CSS counter 加（見 CSS）。
// 語言 emoji（標頭用）在 ../lib/langEmoji（單獨成檔，避免與元件同檔觸發 fast-refresh 警告）。
import { useState } from 'react';

// 超過這行數的程式碼才可收合。
const COLLAPSE_THRESHOLD = 15;

export function CodeBody({ highlighted, code }: { highlighted: string | null; code: string }) {
  const lineCount = code.split('\n').length;
  const collapsible = lineCount > COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(false);
  const collapsed = collapsible && !expanded;

  return (
    <div className={collapsed ? 'code-surface-body code-surface-body--collapsed' : 'code-surface-body'}>
      {highlighted ? (
        // shiki 產生的可信 HTML（作者內容 + shiki 高亮）
        // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
        <div className="shiki-output" dangerouslySetInnerHTML={{ __html: highlighted }} />
      ) : (
        <pre className="shiki-fallback">
          <code>{code}</code>
        </pre>
      )}
      {collapsible ? (
        <button
          type="button"
          className="code-surface-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
        >
          <span className="code-surface-toggle-chevron" aria-hidden>
            {expanded ? '▲' : '▼'}
          </span>
          {expanded ? '收合程式碼' : `展開程式碼（共 ${lineCount} 行）`}
        </button>
      ) : null}
    </div>
  );
}
