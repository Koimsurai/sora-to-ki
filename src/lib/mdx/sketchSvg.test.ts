// sketchSvg：伺服器畫 Sketch 的手繪 SVG。直接跑真的 pele 與 rough.js，不 mock。
import { describe, expect, it } from 'vite-plus/test';
import { renderSketchSvg } from './sketchSvg';

const CHART =
  'graph TD; A[網際網路 讀者與掃描器] --> B[家用固網 路由器轉發 80/443]; B --> C[nftables CrowdSec bouncer]; F[CrowdSec 引擎] -.下封鎖決策.-> C';

describe('renderSketchSvg', () => {
  it('同一張圖每次畫出來一模一樣（抖法由圖決定，伺服器重畫不會換）', () => {
    expect(renderSketchSvg(CHART)).toBe(renderSketchSvg(CHART));
  });

  it('框與線都換成手繪路徑：沒有留下 pele 原本的矩形，也沒有 script', () => {
    const svg = renderSketchSvg(CHART);
    expect(svg).toMatch(/^<svg\b[^>]*class="pele mdx-sketch-svg/);
    // 連線上的字的底框是唯一留下來的 rect（只負責蓋住線）
    expect(svg.match(/<rect\b/g)).toHaveLength(1);
    expect(svg).toContain('fill="var(--sketch-bg, transparent)"');
    expect(svg).not.toMatch(/<script|\son\w+=/i);
  });

  it('虛線的連線還是虛線，箭頭是兩撇而不是實心三角形', () => {
    const svg = renderSketchSvg(CHART);
    expect(svg).toContain('stroke-dasharray="8 9"');
    expect(svg).not.toContain('pele-marker');
  });

  it('中日韓字：宣告一個只含這張圖用到的字的小賴字體（裁字路由的 hand 風格）', () => {
    const svg = renderSketchSvg(CHART);
    const url = /url\((\/fonts\/hand\/400\/[0-9a-f]{8}\.woff2\?c=[0-9a-z.]+)\)/.exec(svg)?.[1];
    expect(url).toBeDefined();
    expect(svg).toMatch(/font-family:"Sketch Hand [0-9a-f]{8}"/);
    expect(svg).toContain("--pele-font:Excalifont, 'Sketch Hand ");
  });

  it('全是拉丁字的圖不需要小賴字體', () => {
    expect(renderSketchSvg('graph LR; A[First load] --> B[hydrate]')).not.toContain('@font-face');
  });

  it('根元素的 style 屬性裡沒有雙引號（有的話屬性會被提早截斷，字變成預設的深灰色與明體）', () => {
    const style = /^<svg\b[^>]*?\sstyle="([^"]*)"/.exec(renderSketchSvg(CHART))?.[1] ?? '';
    // 截斷的話，pele 自己的變數（--_fg 在最後面）就不會出現在屬性裡
    expect(style).toContain('--pele-font:');
    expect(style).toContain('--_fg:');
  });

  it('作者標的顏色拿掉：手繪圖是單色的', () => {
    const svg = renderSketchSvg(
      'graph TD\n  A[x] --> B[y]\n  classDef bad fill:#fecaca,stroke:#b91c1c,color:#000\n  class A bad',
    );
    expect(svg).toContain('mdx-sketch-svg');
    expect(svg).not.toMatch(/#fecaca|#b91c1c|color:#000/i);
  });

  it('語法錯誤丟出 pele 的錯誤（訊息照 mermaid 的格式）', () => {
    expect(() => renderSketchSvg('graph TD; A[x --> ')).toThrow();
  });
});
