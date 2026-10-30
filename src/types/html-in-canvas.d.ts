// HTML-in-Canvas（Chrome 157 起的正式版，WICG/html-in-canvas）：lib.dom 還沒有，先宣告用到的部分。
// 全部標成可有可無：不支援的瀏覽器上這些都不存在，呼叫前一定要先偵測（lib/htmlInCanvas）。
import 'react';

declare global {
  /** drawable 元素某一刻的快照；可以 transfer 給 worker，畫完要 close */
  interface ElementImage {
    close(): void;
  }

  interface ElementImageGeometry {
    /** 把元素的 border box（CSS 變形之前）對到畫布上的矩陣，單位是 CSS 像素 */
    canvasTransform?: DOMMatrixInit;
    canvasClip?: DOMRectInit;
    preserveHitTestOrder?: boolean;
  }

  interface HTMLCanvasElement {
    requestPaint?(): void;
    captureElementImage?(element: Element): ElementImage;
    updateElementGeometry?(element: Element | ElementImage, options?: ElementImageGeometry): void;
    clearElementGeometry?(element: Element | ElementImage): void;
  }

  /** WebGPU 的上傳：@webgpu/types 沒裝，只寫用到的這一支 */
  interface DrawElementImageQueue {
    drawElementImageToTexture(
      source: { source: Element | ElementImage },
      destination: { texture: unknown; size?: { width: number; height: number } },
    ): void;
  }
}

declare module 'react' {
  interface HTMLAttributes<T> {
    /** 放在 content="drawable" 的 canvas 裡、要被畫進去的子元素（值寫空字串） */
    drawable?: '';
  }
}
