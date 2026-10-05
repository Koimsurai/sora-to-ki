import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * 字級尺接到 Tailwind 之後的 `text-fs-*`（見 index.css 的 `--text-fs-*`）。
 *
 * ⚠️ 不擴充的話 tailwind-merge 會把 `text-fs-11` 當成**文字顏色**：
 * `cn('text-fs-11 text-red-400')` 會靜靜地把字級刪掉、只留顏色，
 * 而 `cn('text-sm text-fs-11')` 兩個字級都留著、誰贏看 CSS 順序。兩種都沒有錯誤訊息。
 */
const FONT_SIZES = ['10', '11', '12', '13', '14', '16', '18', '20', '22', '24', '28', '32', '36', '40', '48', '56'].map(
  (n) => `fs-${n}`,
);

const twMerge = extendTailwindMerge({ extend: { theme: { text: FONT_SIZES } } });

/** Utility function to merge Tailwind CSS classes */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
