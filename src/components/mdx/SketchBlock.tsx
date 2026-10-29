// MDX <Sketch>：讓作者只寫 mermaid，就得到手繪風（rough.js）的圖。
// 圖在伺服器上就畫好了（lib/mdx/sketchSvg.ts），跟 mermaid 圍籬放在同一張對照表裡隨文章送來，
// 這裡只查表：瀏覽器不需要任何繪圖程式，圖跟著頁面一起出現。
// 拉丁字的手寫字型在 SketchFonts.css；中日韓字的字型宣告在 SVG 自己的 <style> 裡（每張圖裁一個小檔）。
import { useMermaidSvgs } from '@/contexts/mermaidSvgs';
import { sketchErrorKey, sketchKey } from '@/lib/mdx/mermaidFences';
import './SketchFonts.css';

interface SketchBlockProps {
  /** mermaid 圖定義（graph/flowchart/sequenceDiagram/classDiagram…）。 */
  chart?: string;
  /** 圖說（選填），顯示在圖下方。 */
  title?: string;
}

export default function SketchBlock({ chart = '', title }: SketchBlockProps) {
  const svgs = useMermaidSvgs();
  const def = chart.trim();

  if (!def) {
    return (
      <div className="mdx-sketch-error">
        <strong>⚠ Sketch</strong>
        <pre>chart 為空</pre>
      </div>
    );
  }

  const svg = svgs[sketchKey(def)];
  if (!svg) {
    // 後台預覽打字時，伺服器還沒把新的圖畫回來（對照表整張是空的）：先留位置
    if (Object.keys(svgs).length === 0) return <div className="mdx-sketch-loading" aria-hidden />;
    const error = svgs[sketchErrorKey(def)] ?? '伺服器沒有畫這張圖：chart 要寫成字串（chart="…"），不能寫成 {…}';
    return (
      <div className="mdx-sketch-error">
        <strong>⚠ Sketch 轉換失敗</strong>
        <pre>{error}</pre>
      </div>
    );
  }

  return (
    <figure className="mdx-sketch">
      {/* SVG 是伺服器用 pele＋rough.js 產生的（沒有 script、沒有事件屬性），不是讀者輸入 */}
      {/* eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml */}
      <div className="mdx-sketch-canvas" dangerouslySetInnerHTML={{ __html: svg }} />
      {title ? <figcaption className="mdx-sketch-caption">{title}</figcaption> : null}
    </figure>
  );
}
