import './KoimLoader.css';

interface KoimLoaderProps {
  /** 預設 md：點的大小 */
  size?: 'sm' | 'md' | 'lg';
  /** 載入文字（可省略） */
  text?: string;
  /** 是否撐滿視窗高度（預設 false） */
  fullscreen?: boolean;
  /** 內嵌模式：不留白（用於 Suspense fallback） */
  inline?: boolean;
}

/**
 * 前台的載入中：一顆琥珀點在呼吸，旁邊一行等寬小字。
 * 跟開場（#boot）與後台的 AdminLoading 同一個語言（2026-10 翻新）：站上「正在發生的事」是那顆點，不轉圈。
 * 翻新前是雙層旋轉軌道加紫光暈，登入回呼、文章載入、client-only 頁面的 fallback 都還在用舊的。
 */
function KoimLoader({ size = 'md', text, fullscreen = false, inline = false }: KoimLoaderProps) {
  const cls = [
    'koim-loader-shell',
    `koim-loader-shell--${size}`,
    fullscreen ? 'koim-loader-shell--fullscreen' : '',
    inline ? 'koim-loader-shell--inline' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    // <output> 本身就是 role="status"：報讀器會念出載入的字，不用另外加 role
    <output className={cls} aria-busy="true">
      <span className="koim-loader" aria-hidden="true" />
      {text && <span className="koim-loader-text">{text}</span>}
    </output>
  );
}

export default KoimLoader;
