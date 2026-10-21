import type { CSSProperties } from 'react';

interface EnterOptions {
  /** 延遲（ms）。列表逐項出現時用 index 算。 */
  delay?: number;
  /** 位移起點（px）。沒給就用 CSS 的預設（x 0、y 20）。 */
  x?: number;
  y?: number;
  /** 長度（ms）。 */
  dur?: number;
}

/**
 * `.enter` / `.enter-pop` / `.enter-grow` 這組 CSS 進場動畫的參數，回傳要放進 `style` 的 CSS 變數。
 * 動畫本身與為什麼不用 framer-motion 見 index.css 的「頁面進場動畫」。
 *
 * ```tsx
 * <li className="row enter" style={enterStyle({ delay: i * 30, x: -10, y: 0 })} />
 * ```
 */
export function enterStyle({ delay, x, y, dur }: EnterOptions = {}): CSSProperties {
  const vars: Record<string, string> = {};
  if (delay) vars['--enter-delay'] = `${delay}ms`;
  if (x !== undefined) vars['--enter-x'] = `${x}px`;
  if (y !== undefined) vars['--enter-y'] = `${y}px`;
  if (dur) vars['--enter-dur'] = `${dur}ms`;
  return vars;
}
