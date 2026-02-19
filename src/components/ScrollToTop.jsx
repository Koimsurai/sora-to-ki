import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const prevPathname = useRef(pathname);

  useEffect(() => {
    // 只在路徑 (pathname) 真正改變時才滾動到頂部
    // 如果只是 hash 改變（錨點跳轉），不干涉滾動行為
    if (pathname !== prevPathname.current) {
      // 如果新的路徑帶有 hash，讓瀏覽器自然處理錨點滾動
      if (!hash) {
        window.scrollTo(0, 0);
      }
      prevPathname.current = pathname;
    }
  }, [pathname, hash]);

  return null;
}

export default ScrollToTop;
