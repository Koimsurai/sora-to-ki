// 留言的「收到」（按讚）：按過哪幾則記在 localStorage（同一則不能按兩次），按下去把新的數字寫回留言清單的快取。
// 留言頁、文章頁、碎念共用。
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CommentRow } from '@koimsurai/api-types';
import { commentsQueryOptions } from '@/data/commentsData';
import { visitHeaders } from '@/lib/visitContext';

export function useCommentLikes(base: string, postId: string | number) {
  const queryClient = useQueryClient();
  const storeKey = `liked_comments_${base}_${postId}`;
  const [liked, setLiked] = useState<number[]>([]);

  // localStorage 只在瀏覽器端有
  useEffect(() => {
    try {
      // eslint-disable-next-line @eslint-react/set-state-in-effect
      setLiked(JSON.parse(localStorage.getItem(storeKey) ?? '[]') as number[]);
    } catch {
      // 私密視窗或封鎖了網站資料：沒有記住的東西就算了
    }
  }, [storeKey]);

  const like = async (id: number) => {
    if (liked.includes(id)) return;
    try {
      const res = await fetch(`/api/comments/${id}/like`, { method: 'POST', headers: visitHeaders() });
      if (!res.ok) return;
      const data = (await res.json()) as { likes: number };
      queryClient.setQueryData<CommentRow[]>(commentsQueryOptions(base, postId).queryKey, (old) =>
        (old ?? []).map((c) => (c.id === id ? { ...c, likes: data.likes } : c)),
      );
      const next = [...liked, id];
      setLiked(next);
      try {
        localStorage.setItem(storeKey, JSON.stringify(next));
      } catch {
        // 記不住的話下次重新整理可以再按一次，無妨
      }
    } catch {
      // 按讚失敗不打擾人
    }
  };

  return { liked, like };
}
