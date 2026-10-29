import { useSyncExternalStore } from 'react';
import { currentTheme, onTheme, type Theme } from '@/lib/theme';

const subscribe = (notify: () => void) => onTheme(notify);
/** 伺服器不知道讀者選了哪個（主題由 head 的腳本掛在 <html> 上）：伺服器與 hydration 那一次一律是土星 */
const serverTheme = (): Theme => 'saturn';

/** 現在的主題（lib/theme），頁面開著時換了就跟著換 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, serverTheme);
}
