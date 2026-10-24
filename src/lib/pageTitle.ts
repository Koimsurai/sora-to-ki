/**
 * 各頁大標旁邊那個小小的英文名（「收藏 Collection」）：標題本身已經寫著它的時候不重複
 * （英文頁會變成「Collection Collection」、「Flight log Log」）。
 */
export function sameTitle(title: string, latin: string): boolean {
  return title.toLowerCase().includes(latin.toLowerCase());
}
