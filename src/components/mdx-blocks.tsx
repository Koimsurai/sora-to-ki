// MDX 自訂 block 元件。之後每加一個 block 就在這裡多一個元件 export，
// 再到 MdxContent 的 scope 註冊。未來可由此衍生 prop 驗證 + Agent 的 block 目錄。
import { Children, isValidElement, lazy, Suspense, useState, type ReactElement, type ReactNode } from 'react';
import { ClientOnly } from '@tanstack/react-router';
import { FaGithub, FaXTwitter } from 'react-icons/fa6';
import CodeTabsBlock from './CodeTabsBlock';

// 重的元件 lazy import，只有文章真的用到才進 bundle。
const BarChartImpl = lazy(() => import('./BarChartBlock'));
const MathImpl = lazy(() => import('./MathBlock'));
const SketchImpl = lazy(() => import('./SketchBlock'));
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

/** CJK 注音（Ruby）：base 字 + 上方讀音。用法 <Ruby text="漢字" reading="かんじ" />。 */
export function Ruby({ text, reading }: { text?: ReactNode; reading?: string }) {
  return (
    <ruby className="mdx-ruby">
      {text}
      {reading ? <rt>{reading}</rt> : null}
    </ruby>
  );
}

/** 社群提及徽章。用法 <Mention platform="github" user="innei" /> 或 platform="x"。 */
export function Mention({ platform = 'github', user }: { platform?: string; user?: string }) {
  const u = (user ?? '').replace(/^@/, '');
  const isX = platform === 'x' || platform === 'twitter';
  const href = isX ? `https://x.com/${u}` : `https://github.com/${u}`;
  return (
    <a className="mdx-mention" href={href} target="_blank" rel="noreferrer noopener">
      {isX ? <FaXTwitter aria-hidden /> : <FaGithub aria-hidden />}
      <span>{u}</span>
    </a>
  );
}

/** 多檔程式碼分頁。用法 <CodeTabs files={[{ name:'index.ts', lang:'ts', code:'…' }, …]} />。 */
export function CodeTabs(props: { files?: { name: string; lang?: string; code: string }[] }) {
  return <CodeTabsBlock {...props} />;
}

/** KaTeX 數學公式。tex 用屬性字串傳（避免 { } 被 MDX 當表達式）。
 *  <Math tex="E=mc^2" /> 行內；<Math tex="\\int_0^1 x\\,dx" display /> 區塊。 */
export function Math(props: { tex?: string; display?: boolean }) {
  const fallback = props.display ? (
    <div className="mdx-math-loading" aria-hidden />
  ) : (
    <span className="mdx-math-inline">{props.tex}</span>
  );
  return (
    <ClientOnly fallback={fallback}>
      <Suspense fallback={fallback}>
        <MathImpl {...props} />
      </Suspense>
    </ClientOnly>
  );
}

interface TabProps {
  title?: string;
  children?: ReactNode;
}

/** 內容分頁容器：藥丸切換，每個 <Tab title="…"> 放整段內容（prose、code、其他 block 皆可）。
 *  用法：
 *  <Tabs>
 *    <Tab title="做法 A（推薦）">…</Tab>
 *    <Tab title="做法 B">…</Tab>
 *  </Tabs>
 *  適合「同一件事的多種做法/取捨」對照。 */
export function Tabs({ children }: { children?: ReactNode }) {
  // Children.toArray：取 <Tab> 子元素成陣列（要 map 出藥丸 + 只渲染 active 那頁）。分頁清單靜態不重排。
  // eslint-disable-next-line @eslint-react/no-children-to-array
  const tabs = Children.toArray(children).filter(isValidElement) as ReactElement<TabProps>[];
  const [active, setActive] = useState(0);
  if (!tabs.length) return null;
  // ⚠ 本模組 export 了名為 Math 的元件（KaTeX），會遮蔽全域 Math → 不能用 Math.min。
  const cur = active < tabs.length ? active : tabs.length - 1;
  return (
    <div className="mdx-tabs">
      <div className="mdx-tabs-bar" role="tablist">
        {tabs.map((t, i) => (
          <button
            // 靜態分頁清單不重排 → index 當 key 安全
            // eslint-disable-next-line @eslint-react/no-array-index-key
            key={t.props.title ?? `tab-${i}`}
            type="button"
            role="tab"
            aria-selected={i === cur}
            className={i === cur ? 'mdx-tabs-pill active' : 'mdx-tabs-pill'}
            onClick={() => setActive(i)}
          >
            {t.props.title ?? `分頁 ${i + 1}`}
          </button>
        ))}
      </div>
      <div className="mdx-tabs-panel" role="tabpanel">
        {tabs[cur]}
      </div>
    </div>
  );
}

/** <Tabs> 的單一分頁。title 為藥丸標籤；children 為該頁內容。 */
export function Tab({ children }: TabProps) {
  return <div className="mdx-tab">{children}</div>;
}

/** mermaid → Excalidraw 真手繪風（rough.js）SVG。用法 <Sketch chart="graph TD; A-->B" title="…" />。
 *  chart 收 mermaid 定義；重套件（excalidraw）→ 只在 client、lazy 載入（只有用到才進 bundle）。 */
export function Sketch(props: { chart?: string; title?: string }) {
  const fallback = <div className="mdx-sketch-loading" aria-hidden />;
  return (
    <ClientOnly fallback={fallback}>
      <Suspense fallback={fallback}>
        <SketchImpl {...props} />
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
