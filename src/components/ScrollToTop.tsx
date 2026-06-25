import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

function ScrollToTop() {
  const location = useLocation();
  const { pathname, hash } = location;
  const state = location.state as { fromPreview?: boolean } | null;
  const prevPathname = useRef(pathname);

  useEffect(() => {
    // 只在路徑 (pathname) 真正改變時才滾動到頂部
    // 如果只是 hash 改變（錨點跳轉），不干涉滾動行為
    // 如果是從 preview scroll-to-commit 過來，也不滾頂端（BlogPost 會還原到段落位置）
    if (pathname !== prevPathname.current) {
      if (!hash && !state?.fromPreview) {
        window.scrollTo(0, 0);
      }
      prevPathname.current = pathname;
    }
  }, [pathname, hash, state]);

  return null;
}

export default ScrollToTop;
