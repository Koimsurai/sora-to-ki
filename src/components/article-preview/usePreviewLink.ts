import { useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useArticlePreview } from './ArticlePreviewContext';
import { postDetailQueryOptions } from '../../blogList';
import { prefetchPostChunk } from '../../lib/prefetchPost';

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
  const queryClient = useQueryClient();
  const { isHoverCapable, requestPreview, cancelPendingHover, scheduleClose, dismissPreview } = useArticlePreview();

  const handleMouseEnter = useCallback(() => {
    if (!isHoverCapable || !postId) return;
    void prefetchPostChunk();
    // preview 卡片取原文（no-lang）→ 用同一 queryKey 熱身，hover 完 card 直接讀快取
    void queryClient.prefetchQuery(postDetailQueryOptions(postId, lang ?? ''));
    requestPreview(postId);
  }, [postId, lang, isHoverCapable, requestPreview, queryClient]);

  // 離開 anchor → 取消 pending hover；若 preview 已開啟，預約 400ms 後關
  // （給使用者從 anchor 移到 card 中間的空檔，card mouseEnter 會 cancelClose）
  const handleMouseLeave = useCallback(() => {
    if (!isHoverCapable) return;
    cancelPendingHover();
    scheduleClose();
  }, [isHoverCapable, cancelPendingHover, scheduleClose]);

  const handleFocus = useCallback(() => {
    if (!isHoverCapable || !postId) return;
    void prefetchPostChunk();
    void queryClient.prefetchQuery(postDetailQueryOptions(postId, lang ?? ''));
  }, [postId, lang, isHoverCapable, queryClient]);

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
