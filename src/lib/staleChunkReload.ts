// 重新部署之後，還開著舊版本的分頁要載新的 chunk 時會 404：資產檔名帶內容雜湊，新映像裡沒有舊的那些
// （GlitchTip 上的「Failed to fetch dynamically imported module」「Importing a module script failed」）。
// 後果是載了一半的頁面：首頁的土星（SpaceBackdropShell）、轉場這些 lazy 的部分整塊不見。
//
// vite 在動態 import 失敗時會在 window 上發 `vite:preloadError`；這時重新整理一次就拿到新版本。
// 只重整一次：同一個分頁短時間內又失敗，代表真的載不到（離線、伺服器掛了），不要無限重整。

const KEY = 'koim-stale-chunk-reload';
/** 這段時間內重整過就不再重整 */
const COOLDOWN_MS = 30_000;

/** 上次重整的時間（毫秒）→ 現在該不該重整 */
export function shouldReload(last: number | null, now: number): boolean {
  return last === null || !Number.isFinite(last) || now - last > COOLDOWN_MS;
}

let installed = false;

export function installStaleChunkReload(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('vite:preloadError', (event) => {
    let last: number | null = null;
    try {
      const v = sessionStorage.getItem(KEY);
      last = v === null ? null : Number(v);
    } catch {
      // 無痕模式等讀不到 sessionStorage：當成沒重整過，最壞也只是多重整一次
    }
    if (!shouldReload(last, Date.now())) return;
    try {
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      // 寫不進去就不重整，避免在讀寫都失敗的環境裡一直重整
      return;
    }
    // 不讓 vite 把錯誤往外丟：頁面馬上就要重整了
    event.preventDefault();
    window.location.reload();
  });
  // 路由在滑過連結時就預先載入下一頁（defaultPreload: 'intent'），預載失敗的 promise 沒有人接，
  // 會變成 unhandledrejection 進 GlitchTip。那只是舊分頁，真的點下去時路由與上面那段會重整，
  // 不在這裡重整（滑過就整頁重來會弄丟還沒送出的留言）。只是不回報：
  // 這裡比 Sentry 的監聽器早掛上（AppShell 一載入就裝，Sentry 是之後動態載入的），
  // stopImmediatePropagation 讓它收不到
  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason;
    const msg = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '';
    if (!isStaleChunkError(msg)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  });
}

/** 舊分頁載到已經不存在的 chunk 時，各家瀏覽器與 vite 的訊息 */
export function isStaleChunkError(msg: string): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
    msg,
  );
}
