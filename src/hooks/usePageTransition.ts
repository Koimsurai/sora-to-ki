import { useEffect, useRef } from 'react';
import { registerPage, type PageTransitionHandle } from '@/store/pageTransition';

/**
 * 頁面報上自己的錨點與「長」的方式（見 store/pageTransition）。
 * handle 每次 render 都可以是新的物件：這裡只登記一次，呼叫時讀最新的那份
 */
export function usePageTransition(handle: PageTransitionHandle) {
  const ref = useRef(handle);
  ref.current = handle;
  useEffect(
    () =>
      registerPage({
        anchor: () => ref.current.anchor?.() ?? null,
        onGrow: (ctx) => ref.current.onGrow?.(ctx),
      }),
    [],
  );
}
