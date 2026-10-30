// 天體（主題，lib/theme）的 16px 小圖示，用站上的髮絲線畫，跟首頁主星同一個長相的縮寫：
//   土星：圓加一道斜環　海王星：圓加一道很淡的細環　黑洞：實心的暗圓加光子環　參宿四：圓外一圈點線（拋出去的物質）
// 頂欄的天體選單（layout/ThemeMenu）與後台的站台設定（admin/site）都用它。
import type { Theme } from '@/lib/theme';
import './ThemeGlyph.css';

export function ThemeGlyph({ theme }: { theme: Theme }) {
  return (
    <svg className={`sky-glyph sky-glyph-${theme}`} viewBox="-8 -8 16 16" width="16" height="16" aria-hidden="true">
      {theme === 'saturn' && (
        <>
          <circle r="3.6" />
          <ellipse rx="7.4" ry="2.5" transform="rotate(-14)" />
        </>
      )}
      {theme === 'neptune' && (
        <>
          <circle r="4.2" />
          <ellipse className="is-faint" rx="7.2" ry="2.3" transform="rotate(-14)" />
        </>
      )}
      {theme === 'blackhole' && (
        <>
          <circle className="is-solid" r="3.6" />
          <circle r="4.8" />
          <ellipse className="is-faint" rx="7.4" ry="1.8" transform="rotate(-8)" />
        </>
      )}
      {theme === 'betelgeuse' && (
        <>
          <circle r="4" />
          <circle className="is-dotted" r="6.8" />
        </>
      )}
    </svg>
  );
}
