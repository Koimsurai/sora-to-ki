import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SubscriberRow } from '@koimsurai/api-types';
import { toast } from 'sonner';

import { adminSubscribersByStatusQueryOptions } from '@/data/adminData';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAdminT } from '@/i18n/admin-i18n';
import { jsonAuthHeaders } from '@/lib/authToken';
import { lookupOr } from '../../lib/tableLookup';
import AdminLoading from './AdminLoading';
import { PageHead, TabPanel } from './AdminPage';
import { formatWhen } from './adminFormat';

// 電子報（2026-10 後台提案的「回」）：訂閱中／已退訂兩個分頁，一位一列。
// 新文章要寄電子報是在編輯器的「發佈時推送 Newsletter」，這裡只管名單。

/** `GET /api/newsletter/subscribers` 的單列，型別由後端 Rust struct 生成（見 backend/SPECTA_PLAN.md）。 */
type Subscriber = SubscriberRow;
type Status = 'active' | 'unsubscribed';

const TABS: readonly Status[] = ['active', 'unsubscribed'];

export default function SubscribersManager() {
  const { t } = useAdminT();
  const queryClient = useQueryClient();
  const { data: active = [], isPending: la } = useQuery(adminSubscribersByStatusQueryOptions('active'));
  const { data: unsubscribed = [], isPending: lu } = useQuery(adminSubscribersByStatusQueryOptions('unsubscribed'));
  const lists = useMemo<Record<Status, Subscriber[]>>(() => ({ active, unsubscribed }), [active, unsubscribed]);
  const isPending = la || lu;
  const [tab, setTab] = useState<Status>('active');
  const [search, setSearch] = useState('');
  const [toUnsubscribe, setToUnsubscribe] = useState<Subscriber | null>(null);

  // 退訂之後兩份名單一起重抓（prefix invalidate）
  const invalidateSubs = () => queryClient.invalidateQueries({ queryKey: ['admin', 'subscribers'] });

  const q = search.trim().toLowerCase();
  const visible = lookupOr(lists, tab, []).filter(
    (s) => !q || s.email.toLowerCase().includes(q) || (s.name ?? '').toLowerCase().includes(q),
  );

  const handleUnsubscribe = async (sub: Subscriber) => {
    try {
      const res = await fetch('/api/newsletter/unsubscribe', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ email: sub.email }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? t('subscribers.unsubscribeFailed'));
      }
      toast.success(t('subscribers.unsubscribed', { email: sub.email }));
      void invalidateSubs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('subscribers.unsubscribeFailed'));
    }
  };

  const exportCSV = () => {
    const rows = visible.map((s) => [s.email, s.name ?? '', s.status, s.subscribed_at ?? '', s.unsubscribed_at ?? '']);
    const csv = [['email', 'name', 'status', 'subscribed_at', 'unsubscribed_at'], ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subscribers-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="adm-page adm-page-narrow">
      <PageHead
        title={t('nav.subscribers')}
        latin="Newsletter"
        meta={
          isPending
            ? t('common.loading')
            : t('subscribers.meta', { active: active.length, unsubscribed: unsubscribed.length })
        }
        actions={
          <>
            <button type="button" className="adm-btn" onClick={() => void invalidateSubs()} disabled={isPending}>
              {t('subscribers.refresh')}
            </button>
            <button type="button" className="adm-btn" onClick={exportCSV} disabled={visible.length === 0}>
              {t('subscribers.exportCsv')}
            </button>
          </>
        }
      />

      <section className="adm-stack" aria-label={t('subscribers.listLabel')}>
        <div className="adm-toolbar">
          <div className="adm-tabs">
            {TABS.map((key) => (
              <button
                key={key}
                type="button"
                className="adm-tab"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
              >
                <span className="adm-tab-dot" aria-hidden="true" />
                {t(`subscribers.tabs.${key}`)}
                <span className="adm-meta">{isPending ? '' : lists[key].length}</span>
              </button>
            ))}
          </div>
          <label className="adm-prompt">
            <span className="adm-prompt-mark" aria-hidden="true">
              &gt;
            </span>
            <span className="sr-only">{t('subscribers.searchLabel')}</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('subscribers.searchPlaceholder')}
            />
          </label>
        </div>

        <TabPanel tab={tab}>
          {isPending ? (
            <AdminLoading />
          ) : visible.length === 0 ? (
            <p className="adm-empty">
              {q
                ? t('subscribers.noMatch')
                : tab === 'active'
                  ? t('subscribers.emptyActive')
                  : t('subscribers.emptyUnsubscribed')}
            </p>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">{t('subscribers.col.email')}</th>
                    <th scope="col">{t('subscribers.col.name')}</th>
                    <th scope="col">{t('subscribers.col.subscribed')}</th>
                    <th scope="col">{t('subscribers.col.unsubscribed')}</th>
                    <th scope="col">
                      <span className="sr-only">{t('subscribers.col.actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => (
                    <tr key={s.id}>
                      <td className="adm-cell-title">
                        <span className="adm-cell-name adm-mono">{s.email}</span>
                      </td>
                      <td>
                        <span className="adm-cell-text">{s.name ?? '—'}</span>
                      </td>
                      <td>
                        <span className="adm-meta">{formatWhen(s.subscribed_at, 'yyyy.MM.dd') || '—'}</span>
                      </td>
                      <td>
                        <span className="adm-meta">{formatWhen(s.unsubscribed_at, 'yyyy.MM.dd') || '—'}</span>
                      </td>
                      <td>
                        {s.status === 'active' && (
                          <div className="adm-row-actions">
                            <button
                              type="button"
                              className="adm-icon-btn adm-icon-btn-flare"
                              aria-label={t('subscribers.markLabel', { email: s.email })}
                              onClick={() => setToUnsubscribe(s)}
                            >
                              {t('subscribers.mark')}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabPanel>
      </section>

      <AlertDialog
        open={toUnsubscribe !== null}
        onOpenChange={(open) => {
          if (!open) setToUnsubscribe(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('subscribers.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('subscribers.confirmDesc', { email: toUnsubscribe?.email ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('subscribers.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (toUnsubscribe) void handleUnsubscribe(toUnsubscribe);
                setToUnsubscribe(null);
              }}
            >
              {t('subscribers.mark')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
