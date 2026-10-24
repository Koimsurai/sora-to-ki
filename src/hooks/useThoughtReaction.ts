import { useEffect, useState } from 'react';
import type { ThoughtOut } from '@koimsurai/api-types';
import { apiUrl } from '@/lib/api';

export type Reaction = '' | 'like' | 'dislike';

/**
 * 碎念的讚／倒讚（碎念頁與單則頁共用）：可取消、可切換。
 * 按過哪一顆記在 localStorage，後端依「之前 → 之後」的差值調整計數
 */
export function useThoughtReaction(th: Pick<ThoughtOut, 'id' | 'likes' | 'dislikes'>) {
  // `?? 0` 拿掉了：後端這兩個欄位是 i64 不是 Option，每次都有值
  const [likes, setLikes] = useState(th.likes);
  const [dislikes, setDislikes] = useState(th.dislikes);
  const key = 'tk_react_' + th.id;
  // 按過的讚存在 localStorage，只有 client 讀得到：寫在 useState 初始化裡的話 server 繪 ''、
  // client 繪儲存值，hydrate 時 React 不會補正屬性，按過的讚就不亮。所以等掛上之後才讀。
  const [reacted, setReacted] = useState<Reaction>('');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      // eslint-disable-next-line @eslint-react/set-state-in-effect
      setReacted(saved === 'like' || saved === 'dislike' ? saved : '');
    } catch {
      /* 隱私模式等讀不到的情況：當成沒按過 */
    }
  }, [key]);

  const react = async (kind: Exclude<Reaction, ''>) => {
    const next: Reaction = reacted === kind ? '' : kind; // 同一顆=取消；不同=切換
    try {
      const r = await fetch(apiUrl(`/api/thoughts/${th.id}/react`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prev: reacted, next }),
      });
      const d = (await r.json().catch(() => ({}))) as { likes?: number; dislikes?: number };
      if (typeof d.likes === 'number') setLikes(d.likes);
      if (typeof d.dislikes === 'number') setDislikes(d.dislikes);
      localStorage.setItem(key, next);
      setReacted(next);
    } catch {
      /* ignore */
    }
  };

  return { likes, dislikes, reacted, react };
}
