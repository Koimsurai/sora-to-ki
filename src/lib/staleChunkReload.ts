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
}
