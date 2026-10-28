import { useMediaQuery } from './useMediaQuery';

export type FoldPose = 'book' | 'laptop';

/**
 * 摺疊機現在怎麼摺（viewport-segments 的 media query）：書本式左右兩半、筆電式上下兩半，攤平是 null。
 * 跟 CSS 用同一個來源，元件與樣式不會一個摺、一個沒摺
 */
export function useFoldPose(): FoldPose | null {
  const book = useMediaQuery('(horizontal-viewport-segments: 2)');
  const laptop = useMediaQuery('(vertical-viewport-segments: 2)');
  return book ? 'book' : laptop ? 'laptop' : null;
}
