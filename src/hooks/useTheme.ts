import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { currentTheme, defaultTheme, onTheme, type Theme } from '@/lib/theme';

const subscribe = (notify: () => void) => onTheme(notify);

/**
 * 現在的主題（lib/theme），頁面開著時換了就跟著換。伺服器不知道讀者選了哪個（主題由 head 的腳本掛在
 * <html> 上）：伺服器與 hydration 那一次是站長的預設
 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme, defaultTheme);
}

/**
 * 現在這個主題的訊號色叫什麼（siteNav.skySignal）：文案裡寫到訊號色的地方用它，換主題時字跟著顏色換。
 * signalLower 給英文句中用（「The amber line」），其他語系跟 signal 一樣
 */
export function useSignalName() {
  const { t } = useTranslation();
  const signal = t(`siteNav.skySignal.${useTheme()}`);
  return { signal, signalLower: signal.toLowerCase() };
}
