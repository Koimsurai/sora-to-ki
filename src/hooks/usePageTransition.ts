import { useEffect, useRef } from 'react';
import { registerPage, type PageTransitionHandle } from '@/store/pageTransition';

/**
 * 頁面報上自己的錨點、怎麼收、點從哪裡進來、怎麼長（見 store/pageTransition）。
 * handle 每次 render 都可以是新的物件：這裡只登記一次，呼叫時讀最新的那份
 */
export function usePageTransition(handle: PageTransitionHandle) {
  const ref = useRef(handle);
  ref.current = handle;
  useEffect(
    () =>
      registerPage({
        anchor: () => ref.current.anchor?.() ?? null,
        arrive: (dot) => ref.current.arrive?.(dot) ?? null,
        leave: (ctx) => ref.current.leave?.(ctx) ?? null,
        onGrow: (ctx) => ref.current.onGrow?.(ctx),
        rejoin: () => ref.current.rejoin?.() ?? null,
      }),
    [],
  );
}
