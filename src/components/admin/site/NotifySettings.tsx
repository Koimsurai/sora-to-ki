import { useState } from 'react';
import { toast } from 'sonner';

import { at, useAdminT } from '@/i18n/admin-i18n';
import { apiErrorText } from '@/lib/apiError';
import { jsonAuthHeaders } from '@/lib/authToken';
import type { NotifyDraft, NotifyResponse } from './notifyApi';
import { SiteField } from './SiteFields';

// 通知（/admin/site 的一段）：給站長自己的 webhook，與回覆信那條管道的狀態。
// webhook 網址是密鑰，走只有站長讀得到的 /api/admin/notify（後端 notify.rs），不跟站台設定同一支 API；
// 但畫面上跟整頁一起存（SiteSettings 的儲存列），不再有自己的「儲存通知設定」：
// 一頁三種存法，站長分不出改了哪個要按哪個。「送一則測試」是立即動作，留在這裡

export default function NotifySettings({
  data,
  draft,
  patch,
}: {
  data: NotifyResponse;
  draft: NotifyDraft;
  patch: (p: Partial<NotifyDraft>) => void;
}) {
  const { t } = useAdminT();
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
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
      setTesting(false);
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
          disabled={testing || draft.webhook_url.trim() === ''}
          aria-busy={testing}
          onClick={() => void test()}
        >
          {t('site.notify.test')}
        </button>
      </div>
    </>
  );
}
