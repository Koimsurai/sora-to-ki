// 視窗的形狀：除了寬窄，還有「又寬又矮」與「摺疊機打開直拿」這兩種要另外排。
//
// 摺疊機（iPhone Duo 等）攤平時沒有 API 告訴我們摺痕在哪（Safari 的 viewport-segments 在功能旗標後面），
// 所以只看尺寸。內螢幕直拿約 669×867，摺痕是橫的、在高度 45% 上下；畫面的焦點（土星、太陽、標題）
// 原本放在 46%–50%，正好壓在上面。這類尺寸的焦點往上挪到摺痕以上——同樣寬度的直式平板只是重心偏高一點。
// 純函式，不碰 DOM，canvas 與 React 元件都用同一份判斷。

/** 又寬又矮：手機橫拿、摺疊機外螢幕橫拿（594×368）。用寬螢幕的左右構圖，不能照寬度當成手機直式疊上下 */
export const isShortLandscape = (w: number, h: number) => w > h && h < 520;

/** 中等寬度的直式：摺疊機內螢幕直拿（669×867）、直式平板 */
export const isTallMedium = (w: number, h: number) => h > w && w >= 560 && w < 1100;

/**
 * 焦點放在高度的幾成：中等寬度的直式提到摺痕以上（up，預設 0.36），其他照原本的位置（phone）。
 * 焦點上面還有標題的頁面 up 給高一點，免得撞到標題
 */
export const focusY = (w: number, h: number, phone: number, up = 0.36) =>
  isTallMedium(w, h) ? Math.min(phone, up) : phone;
