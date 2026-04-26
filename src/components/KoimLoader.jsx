import './KoimLoader.css';

/**
 * 全站統一 loader：雙層軌道 + 漸層核心 + 紫光暈呼吸
 * @param {'sm'|'md'|'lg'} size  - 預設 md
 * @param {string} text          - 載入文字（可省略）
 * @param {boolean} fullscreen   - 是否撐滿視窗高度（預設 false）
 * @param {boolean} inline       - 內嵌模式：尺寸縮小且不留白（用於 Suspense fallback）
 */
function KoimLoader({ size = 'md', text, fullscreen = false, inline = false }) {
  const cls = [
    'koim-loader-shell',
    `koim-loader-shell--${size}`,
    fullscreen ? 'koim-loader-shell--fullscreen' : '',
    inline ? 'koim-loader-shell--inline' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cls} role="status" aria-busy="true" aria-live="polite">
      <div className="koim-loader" aria-hidden>
        <div className="koim-loader-orbit koim-loader-orbit-1" />
        <div className="koim-loader-orbit koim-loader-orbit-2" />
        <div className="koim-loader-core" />
        <div className="koim-loader-glow" />
      </div>
      {text && (
        <p className="koim-loader-text">
          {text}
          <span className="koim-loader-dots">
            <i></i><i></i><i></i>
          </span>
        </p>
      )}
    </div>
  );
}

export default KoimLoader;
