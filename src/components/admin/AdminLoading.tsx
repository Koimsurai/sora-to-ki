import './AdminLoading.css';

// 後台的載入狀態（2026-10 後台提案）：一顆琥珀點在呼吸，旁邊一行等寬小字。
// 取代原本的 KoimLoader 與各頁手刻的轉圈圈——站上「正在發生的事」一律是那顆琥珀點，不轉圈。
// CSS 跟著元件走：路由的 Suspense fallback 出現時，後台其他的 CSS 可能還沒載進來。

/**
 * 一整塊的載入中；`label` 換成要說的那件事，例如「看看有什麼事」。
 * `page`：整頁還沒出來（路由的 Suspense fallback），內距對齊頁面的 .adm-page。
 */
export default function AdminLoading({ label = '載入中', page = false }: { label?: string; page?: boolean }) {
  return (
    // <output> 本身就是 role="status"：報讀器會念出「載入中」，不用另外加 role
    <output className="adm-loading" data-page={page || undefined}>
      <span className="adm-busy-dot" aria-hidden="true" />
      <span className="adm-loading-text">{label}</span>
    </output>
  );
}

/** 按鈕裡的「正在做」：取代轉圈的 Loader2 圖示 */
export function BusyDot() {
  return <span className="adm-busy-dot adm-busy-dot-small" aria-hidden="true" />;
}
