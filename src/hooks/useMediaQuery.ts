import { useSyncExternalStore } from 'react';

/**
 * 訂閱一個 media query。伺服器端一律回 false——hydrate 時 React 先用 server snapshot，
 * 之後才換成瀏覽器的真值，所以不會有 hydration mismatch，也不用在 effect 裡 setState。
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** 「是否在瀏覽器端」這件事不會變，所以不需要真的訂閱任何東西；回傳的取消訂閱也不用做事。 */
const subscribeNever = () => () => undefined;

/** 是否已在瀏覽器端（portal 要掛到 document.body 前用這個擋 SSR）。 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}
