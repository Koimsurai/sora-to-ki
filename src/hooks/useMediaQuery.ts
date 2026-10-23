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
