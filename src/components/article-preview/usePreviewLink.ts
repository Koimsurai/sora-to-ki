import { useRef, useCallback } from 'react';
import { useArticlePreview } from './ArticlePreviewContext';
import { prefetchArticle } from '../../lib/articleCache';
import { prefetchPost } from '../../lib/prefetchPost';

/**
 * 把 sidebar 文章 <Link> 升級成「hover 顯示 centered preview modal」的形式。
 *
 * v2 行為：
 *  - hover 200ms 後開啟（之前已開的另一篇會被替換）
 *  - mouse leave **不關閉**（避免移到 centered modal 路上 flicker）
 *  - 關閉由 Esc / backdrop click / 點 link 觸發
 *
 * 用法：
 *   const previewLink = usePreviewLink(post.id);
 *   <Link to={`/blog/${post.id}`} {...previewLink.bind} viewTransition>...</Link>
 */
export function usePreviewLink(postId: string, options: { lang?: string } = {}) {
  const { lang } = options;
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const { isHoverCapable, requestPreview, cancelPendingHover, scheduleClose, dismissPreview } = useArticlePreview();

  const handleMouseEnter = useCallback(() => {
    if (!isHoverCapable || !postId) return;
    prefetchPost(postId, lang);
    prefetchArticle(postId, lang);
    requestPreview(postId);
  }, [postId, lang, isHoverCapable, requestPreview]);

  // 離開 anchor → 取消 pending hover；若 preview 已開啟，預約 400ms 後關
  // （給使用者從 anchor 移到 card 中間的空檔，card mouseEnter 會 cancelClose）
  const handleMouseLeave = useCallback(() => {
    if (!isHoverCapable) return;
    cancelPendingHover();
    scheduleClose();
  }, [isHoverCapable, cancelPendingHover, scheduleClose]);

  const handleFocus = useCallback(() => {
    if (!isHoverCapable || !postId) return;
    prefetchPost(postId, lang);
    prefetchArticle(postId, lang);
  }, [postId, lang, isHoverCapable]);

  // 點 link → 立即 dismiss preview，讓 Link 預設導航接管
  const handleClick = useCallback(() => {
    if (!isHoverCapable) return;
    dismissPreview();
  }, [isHoverCapable, dismissPreview]);

  return {
    bind: {
      ref: anchorRef,
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      onFocus: handleFocus,
      onClick: handleClick,
    },
  };
}
