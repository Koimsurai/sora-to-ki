import { queryOptions } from '@tanstack/react-query';
import type { FriendStar } from '@koimsurai/api-types';
import { apiUrl } from '@/lib/api';

// 朋友頁的星（backend handlers::friends）：朋友清單寫死在後端，每位附上 RSS 抓到的最新一篇。
// 後端快取一小時，這裡也不必常問。拿不到（後端還沒有這支、或掛了）就是空陣列：
// 畫面上只剩中心那顆，不當成錯誤。
export const friendsQueryOptions = queryOptions({
  queryKey: ['friends'],
  queryFn: async (): Promise<FriendStar[]> => {
    try {
      const res = await fetch(apiUrl('/api/friends'));
      if (!res.ok) return [];
      return (await res.json()) as FriendStar[];
    } catch {
      return [];
    }
  },
  staleTime: 30 * 60 * 1000,
});
