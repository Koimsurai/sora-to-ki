// 通知設定的讀與存（/api/admin/notify，後端 notify.rs）。跟元件分開放：元件檔只匯出元件，fast refresh 才認得
import { at } from '@/i18n/admin-i18n';
import { apiErrorText } from '@/lib/apiError';
import { jsonAuthHeaders } from '@/lib/authToken';

export interface NotifyDraft {
  webhook_url: string;
  on_comment: boolean;
  on_friend: boolean;
}

export interface NotifyResponse {
  settings: NotifyDraft;
  /** Resend 與寄件人都設好了，回覆信寄得出去 */
  mail_ready: boolean;
}

export const notifyQueryOptions = {
  queryKey: ['admin', 'notify'] as const,
  queryFn: async (): Promise<NotifyResponse> => {
    const res = await fetch('/api/admin/notify', { headers: jsonAuthHeaders() });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as NotifyResponse;
  },
};

/** 存通知設定；失敗時丟出要顯示給站長的訊息 */
export async function saveNotify(draft: NotifyDraft): Promise<NotifyResponse> {
  const res = await fetch('/api/admin/notify', {
    method: 'PUT',
    headers: jsonAuthHeaders(),
    body: JSON.stringify(draft),
  });
  const body = (await res.json().catch(() => ({}))) as NotifyResponse & { error?: string };
  if (!res.ok) throw new Error(apiErrorText(body, at, 'errors', at('common.saveFailed', { status: res.status })));
  return body;
}
