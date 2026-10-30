// HTML-in-Canvas（Chrome 157 起）：把一般的 DOM 元素畫進 canvas，元素本身留在 DOM 裡，
// 點擊、鍵盤、輔助技術都照常。站上拿它把首頁的字卡與常駐小標註畫進 3D 的那一層（store/canvasLabels）。

/** 這個瀏覽器有沒有 HTML-in-Canvas（content 屬性只在支援的瀏覽器上會反射成 'drawable'） */
function supportsHtmlInCanvas(): boolean {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('content', 'drawable');
  return (canvas as { content?: string }).content === 'drawable' && typeof canvas.captureElementImage === 'function';
}

/** 用不用得到。網址帶 ?hic=0 時一律走 DOM（A/B 比較用） */
export function htmlInCanvasEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('hic') !== '0' && supportsHtmlInCanvas();
}
