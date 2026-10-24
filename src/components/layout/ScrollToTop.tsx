import { useEffect, useRef } from 'react';
import { useRouterState } from '@tanstack/react-router';

function ScrollToTop() {
  const location = useRouterState({ select: (s) => s.location });
  const { pathname, hash } = location;
  const keepScroll = location.state.keepScroll === true;
  const prevPathnameRef = useRef(pathname);

  useEffect(() => {
    // 只在路徑 (pathname) 真正改變時才滾動到頂部
    // 如果只是 hash 改變（錨點跳轉），不干涉滾動行為
    // 導覽時帶了 keepScroll（文章頁切語系）也不滾頂端：目的頁會自己放回讀者原本的位置
    if (pathname !== prevPathnameRef.current) {
      if (!hash && !keepScroll) {
        window.scrollTo(0, 0);
      }
      prevPathnameRef.current = pathname;
    }
  }, [pathname, hash, keepScroll]);

  return null;
}

export default ScrollToTop;
