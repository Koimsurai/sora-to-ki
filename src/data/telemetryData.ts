import { queryOptions } from '@tanstack/react-query';
import type { Telemetry } from '@koimsurai/api-types';
import { apiUrl } from '@/lib/api';

// 設備頁 HOME SERVER 那張圖紙的遙測（backend handlers::telemetry）：只有溫度、負載、記憶體、功耗。
// 後端快取 30 秒，這裡也每 30 秒問一次。拿不到（後端還沒有這支、或掛了）就是 null，畫面顯示「等待訊號」，
// 不當成錯誤：這是裝飾性的即時數字，不該讓整頁進錯誤狀態。
const EVERY = 30 * 1000;

export const telemetryQueryOptions = queryOptions({
  queryKey: ['telemetry'],
  queryFn: async (): Promise<Telemetry | null> => {
    try {
      const res = await fetch(apiUrl('/api/telemetry'));
      if (!res.ok) return null;
      return (await res.json()) as Telemetry;
    } catch {
      return null;
    }
  },
  staleTime: EVERY - 5000,
  refetchInterval: EVERY,
});
