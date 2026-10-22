import './IntroSkip.css';

interface IntroSkipProps {
  /** 開場層開始淡出：提示跟著淡掉，也不再接點擊 */
  ending: boolean;
  onSkip: () => void;
}

// 開場的 DOM 那一半只剩這個：整個畫面就是一顆「跳過」按鈕。畫面本身在 3D 背景的 canvas 上
// （lib/hyperspace.ts），canvas 是 pointer-events: none，點擊穿過它落到這裡。
//
// 用 <button> 而不是 div + onClick：畫面寫著 click anywhere to skip，鍵盤使用者也要跳得過
// （div 不可聚焦、沒有 keydown），而且這是可互動的東西，不該被報讀成圖片。
export default function IntroSkip({ ending, onSkip }: IntroSkipProps) {
  return (
    <button
      type="button"
      className={`intro-skip ${ending ? 'intro-skip--ending' : ''}`}
      onClick={onSkip}
      aria-label="跳過開場動畫"
    >
      <span className="intro-skip-hint" aria-hidden>
        click anywhere to skip
      </span>
    </button>
  );
}
