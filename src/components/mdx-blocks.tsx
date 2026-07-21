// MDX 自訂 block 元件。之後每加一個 block 就在這裡多一個元件 export，
// 再到 MdxContent 的 scope 註冊。未來可由此衍生 prop 驗證 + Agent 的 block 目錄。
import type { ReactNode } from 'react';

/** 作者註卡：站長本人在文章裡的旁白，跟一般 alert 區隔（筆記標記 + 專屬樣式）。 */
export function Note({ children, title }: { children?: ReactNode; title?: string }) {
  return (
    <aside className="mdx-note">
      <div className="mdx-note-mark" aria-hidden>
        ✎
      </div>
      <div className="mdx-note-body">
        <div className="mdx-note-label">{title ?? '站長註'}</div>
        <div className="mdx-note-content">{children}</div>
      </div>
    </aside>
  );
}
