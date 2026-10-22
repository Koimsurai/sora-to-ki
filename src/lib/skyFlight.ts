// 換頁飛行的時間資訊（給頁面內容配合飛行進退場用）。
// 飛行本身在 starfieldGpu：鏡頭只在「首頁（土星前面）」與「外面」兩點之間飛，
// 所以只有首頁 ↔ 其他頁會飛，其他頁之間換來換去鏡頭不動。
// <html> 上的 data-sky / data-prev-sky / data-sky-since / data-flight 由 SpaceBackdropShell 維護。

/** 單程飛行的長度（starfieldGpu 的 TRAVEL_SECONDS） */
export const FLIGHT_MS = 2200;

/**
 * 進入 sky 這一頁的飛行已經飛了多久（ms）；這次換頁沒有飛行的話回 null。
 * 頁面可能在飛到一半才掛上（資料還在載），所以不能假設「掛上的那一刻就是起飛的那一刻」。
 * <html data-sky> 還不是這一頁的天空，代表 SpaceBackdropShell 的 effect 還沒跑，也就是剛起飛。
 */
export function flightElapsed(sky: string): number | null {
  const root = document.documentElement;
  if (root.dataset.flight !== '1') return null; // 這台機器沒有 3D（手機、沒有硬體加速）
  const current = root.dataset.sky;
  if (!current) return null; // 第一次載入
  const from = current === sky ? root.dataset.prevSky : current;
  if (!from || from === sky) return null;
  if ((from === 'home') === (sky === 'home')) return null; // 首頁以外的頁面之間不飛
  if (current !== sky) return 0;
  const ms = performance.now() - Number(root.dataset.skySince ?? Number.NEGATIVE_INFINITY);
  return ms < FLIGHT_MS ? ms : null;
}
