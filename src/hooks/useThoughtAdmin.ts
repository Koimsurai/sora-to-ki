import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiUrl } from '@/lib/api';
import { authHeaders, jsonAuthHeaders } from '@/lib/authToken';
import { thoughtsListQueryOptions } from '@/data/thinkingData';
import { thoughtDetailQueryOptions } from '@/data/thoughtData';

/**
 * 碎念的刪除／編輯（站長用）。列表頁與單則頁共用這一份：以前單則頁自己重寫了一套，
 * 沒檢查回應（失敗也當成功）、刪除後用 window.location 整頁重載，連語系前綴都丟了。
 * 成功後列表與那一則的快取都失效，兩頁之間切換不會看到舊內容。
 */
export function useThoughtAdmin() {
  const queryClient = useQueryClient();
  const refresh = (id: number) => {
    void queryClient.invalidateQueries({ queryKey: thoughtsListQueryOptions.queryKey });
    void queryClient.invalidateQueries({ queryKey: thoughtDetailQueryOptions(String(id)).queryKey });
  };

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(apiUrl(`/api/admin/thoughts/${id}`), { method: 'DELETE', headers: authHeaders() });
      if (!r.ok) throw new Error(`DELETE /admin/thoughts/${id} ${r.status}`);
    },
    onSuccess: (_, id) => refresh(id),
  });

  const edit = useMutation({
    mutationFn: async ({ id, content }: { id: number; content: string }) => {
      const r = await fetch(apiUrl(`/api/admin/thoughts/${id}`), {
        method: 'PUT',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ content }),
      });
      if (!r.ok) throw new Error(`PUT /admin/thoughts/${id} ${r.status}`);
    },
    onSuccess: (_, { id }) => refresh(id),
  });

  return { remove, edit };
}
