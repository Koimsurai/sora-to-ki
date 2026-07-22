// MDX 自訂 block 元件。之後每加一個 block 就在這裡多一個元件 export，
// 再到 MdxContent 的 scope 註冊。未來可由此衍生 prop 驗證 + Agent 的 block 目錄。
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { ClientOnly } from '@tanstack/react-router';

// recharts 很重 → lazy import，只有文章真的用到 <BarChart> 才進 bundle。
const BarChartImpl = lazy(() => import('./BarChartBlock'));
const chartFallback = <div className="mdx-chart-loading" aria-hidden />;

/** 作者註卡：段落長度的站長旁白，在內文流裡的卡片（跟一般 alert 區隔）。 */
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

/** 行內作者註解：被註解的文字帶虛線底，hover/點擊 → 底線由左長出 + 冒出小卡。
 *  刻意跟「連結 hover 預覽卡」區隔：琥珀色調、純文字小卡、無 OG 圖。 */
export function Annot({ children, note }: { children?: ReactNode; note?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="annot"
      data-open={open ? 'true' : undefined}
      tabIndex={0}
      // 觸控裝置沒有 hover：點一下 toggle（桌機 hover 由 CSS 顯示，這裡不影響）
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen((o) => !o);
        }
      }}
      role="note"
    >
      <span className="annot-text">{children}</span>
      <span className="annot-card" role="tooltip">
        <span className="annot-card-label">站長註</span>
        <span className="annot-card-body">{note}</span>
      </span>
    </span>
  );
}

/** 吃 JSON 資料的長條圖（recharts）。SSR 不友善（要量容器尺寸）→ ClientOnly 包 + lazy 載，
 *  fallback 是固定高佔位（避免 hydration reflow）。
 *  用法：<BarChart data={[{label:'int8',value:42},…]} title="…" unit="tok/s" /> */
export function BarChart(props: {
  data?: { label: string; value: number }[];
  title?: string;
  unit?: string;
  color?: string;
}) {
  return (
    <ClientOnly fallback={chartFallback}>
      <Suspense fallback={chartFallback}>
        <BarChartImpl {...props} />
      </Suspense>
    </ClientOnly>
  );
}

/** 防劇透：內容模糊，點擊揭開。純視覺遮擋（非加密），適合劇情/答案。 */
export function Spoiler({ children }: { children?: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      className={revealed ? 'spoiler spoiler--revealed' : 'spoiler'}
      role="button"
      tabIndex={revealed ? -1 : 0}
      title={revealed ? undefined : '點擊顯示'}
      onClick={() => setRevealed(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setRevealed(true);
        }
      }}
    >
      {children}
    </span>
  );
}
