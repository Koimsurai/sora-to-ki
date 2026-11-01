import type { Signature, SignatureStep } from '@koimsurai/api-types';

/**
 * 上傳的 SVG → 簽名：照檔案裡的順序，`<path>` 是一筆、`<circle>` 是一個點（像 i 上面那點）。
 * 跟後端 handlers/signature.rs 的 `from_svg` 同一個規則；後端存之前還會再驗一次。
 * 只取路徑資料與座標，檔案裡其他東西（樣式、script、連結）一概不帶。
 * 讀不出筆畫回 `null`。
 */
export function signatureFromSvg(text: string): Signature | null {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  const viewBox = svg?.getAttribute('viewBox')?.trim();
  if (!svg || !viewBox) return null;
  const steps: SignatureStep[] = [];
  for (const el of svg.querySelectorAll('path, circle')) {
    if (el.tagName === 'path') {
      const d = el.getAttribute('d')?.trim();
      if (d) steps.push({ kind: 'stroke', d });
    } else {
      const x = Number(el.getAttribute('cx'));
      const y = Number(el.getAttribute('cy'));
      if (Number.isFinite(x) && Number.isFinite(y)) steps.push({ kind: 'dot', x, y });
    }
  }
  return steps.some((s) => s.kind === 'stroke') ? { view_box: viewBox, steps } : null;
}
