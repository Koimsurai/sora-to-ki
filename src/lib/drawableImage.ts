/**
 * 給 canvas 畫的插圖。`complete && naturalWidth` 擋不住壞掉的圖：下載被切斷（部署時容器重啟）或內容壞掉時，
 * 檔頭已經讀到寬高，drawImage 卻丟「in the 'broken' state」，而且每一幀都丟。decode() 成功才算畫得了
 */
const decoded = new WeakSet<HTMLImageElement>();

/** 開始載一張圖；解碼成功之後 `canDraw` 才回 true */
export function loadDrawable(src: string): HTMLImageElement {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  // jsdom（單元測試）沒有 decode：那邊不畫就好
  if ('decode' in img)
    img.decode().then(
      () => decoded.add(img),
      () => {
        // 解不出來就不畫，這些插圖都是裝飾
      },
    );
  return img;
}

export const canDraw = (img: HTMLImageElement | null | undefined): img is HTMLImageElement => !!img && decoded.has(img);
