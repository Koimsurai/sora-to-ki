// MDX <CodeTabs>：多檔程式碼分頁。重用站上既有的 shiki 高亮（highlightCode）。
// SSR 出樸素 pre（fallback），client 端 idle 後套 shiki——與 CodeBlock 同策略、不需 ClientOnly。
import { useEffect, useState } from 'react';
import { highlightCode } from '../lib/shikiHighlight';

interface CodeFile {
  name: string;
  lang?: string;
  code: string;
}

export default function CodeTabsBlock({ files = [] }: { files?: CodeFile[] }) {
  const [active, setActive] = useState(0);
  const [html, setHtml] = useState<Record<number, string>>({});
  const cur = files.at(active);

  useEffect(() => {
    if (!cur || html[active]) return;
    let cancelled = false;
    highlightCode(cur.code, cur.lang ?? 'text')
      .then((h) => {
        if (!cancelled) setHtml((prev) => ({ ...prev, [active]: h }));
      })
      .catch(() => {
        /* 高亮失敗留 plain pre */
      });
    return () => {
      cancelled = true;
    };
  }, [active, cur, html]);

  if (!files.length) {
    return <div className="mdx-chart-empty">（CodeTabs：無檔案 / files 格式錯誤）</div>;
  }

  return (
    <div className="mdx-codetabs">
      <div className="mdx-codetabs-bar" role="tablist">
        {files.map((f, i) => (
          <button
            key={f.name}
            role="tab"
            aria-selected={i === active}
            className={i === active ? 'mdx-codetabs-tab active' : 'mdx-codetabs-tab'}
            onClick={() => setActive(i)}
          >
            {f.name}
          </button>
        ))}
      </div>
      <div className="mdx-codetabs-body">
        {html[active] ? (
          // shiki 產生的可信 HTML（作者內容 + shiki 高亮），與站上 CodeBlock 同一模式
          // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
          <div className="shiki-output" dangerouslySetInnerHTML={{ __html: html[active] }} />
        ) : (
          <pre className="shiki-fallback">
            <code>{cur?.code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
