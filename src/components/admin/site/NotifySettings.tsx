import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { at, useAdminT } from '@/i18n/admin-i18n';
import { apiErrorText } from '@/lib/apiError';
import { jsonAuthHeaders } from '@/lib/authToken';
import { SiteField } from './SiteFields';

// 通知（/admin/site 的一段）：給站長自己的 webhook，與回覆信那條管道的狀態。
// 跟上面的站台設定分開存：webhook 網址是密鑰，走只有站長讀得到的 /api/admin/notify（後端 notify.rs）。

interface Settings {
  webhook_url: string;
  on_comment: boolean;
  on_friend: boolean;
}

interface NotifyResponse {
  settings: Settings;
  /** Resend 與寄件人都設好了，回覆信寄得出去 */
  mail_ready: boolean;
}

const notifyQueryOptions = {
  queryKey: ['admin', 'notify'] as const,
  queryFn: async (): Promise<NotifyResponse> => {
    const res = await fetch('/api/admin/notify', { headers: jsonAuthHeaders() });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as NotifyResponse;
  },
};

export default function NotifySettings() {
  const { t } = useAdminT();
  const queryClient = useQueryClient();
  const { data, isError } = useQuery(notifyQueryOptions);
  const [edited, setEdited] = useState<Settings | null>(null);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);

  if (isError) return <p className="sf-hint">{t('site.notify.loadFailed')}</p>;
  if (!data) return null;
  const draft = edited ?? data.settings;
  const dirty = edited !== null && JSON.stringify(edited) !== JSON.stringify(data.settings);
  const patch = (p: Partial<Settings>) => setEdited({ ...draft, ...p });

  const save = async () => {
    setBusy('save');
    try {
      const res = await fetch('/api/admin/notify', {
        method: 'PUT',
        headers: jsonAuthHeaders(),
        body: JSON.stringify(draft),
      });
      const body = (await res.json().catch(() => ({}))) as NotifyResponse & { error?: string };
      if (!res.ok) {
        toast.error(apiErrorText(body, at, 'errors', t('common.saveFailed', { status: res.status })));
        return;
      }
      queryClient.setQueryData(notifyQueryOptions.queryKey, body);
      setEdited(null);
      toast.success(t('site.notify.saved'));
    } catch {
      toast.error(t('common.offline'));
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      const res = await fetch('/api/admin/notify/test', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ webhook_url: draft.webhook_url }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) toast.error(apiErrorText(body, at, 'errors', t('site.notify.testFailed', { error: res.status })));
      else if (body.ok) toast.success(t('site.notify.testOk'));
      else toast.error(t('site.notify.testFailed', { error: body.error ?? '' }));
    } catch {
      toast.error(t('common.offline'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <p className="sf-hint">{data.mail_ready ? t('site.notify.mailReady') : t('site.notify.mailOff')}</p>
      <SiteField label={t('site.notify.webhook')} hint={t('site.notify.optional')}>
        <input
          className="sf-input"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://discord.com/api/webhooks/…"
          value={draft.webhook_url}
          onChange={(e) => patch({ webhook_url: e.target.value })}
        />
      </SiteField>
      <p className="sf-hint">{t('site.notify.formats')}</p>
      <div className="sf-checks">
        <label className="sf-check">
          <input type="checkbox" checked={draft.on_comment} onChange={(e) => patch({ on_comment: e.target.checked })} />
          {t('site.notify.onComment')}
        </label>
        <label className="sf-check">
          <input type="checkbox" checked={draft.on_friend} onChange={(e) => patch({ on_friend: e.target.checked })} />
          {t('site.notify.onFriend')}
        </label>
      </div>
      <div className="sfs-notify-actions">
        <button
          type="button"
          className="adm-btn"
          disabled={busy !== null || draft.webhook_url.trim() === ''}
          aria-busy={busy === 'test'}
          onClick={() => void test()}
        >
          {t('site.notify.test')}
        </button>
        <button
          type="button"
          className="adm-btn adm-btn-primary"
          disabled={busy !== null || !dirty}
          aria-busy={busy === 'save'}
          onClick={() => void save()}
        >
          {t('site.notify.save')}
        </button>
      </div>
    </>
  );
}
