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

const TABS: { key: Status; label: string }[] = [
  { key: 'active', label: '訂閱中' },
  { key: 'unsubscribed', label: '已退訂' },
];

export default function SubscribersManager() {
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
        throw new Error(data.error ?? '退訂失敗');
      }
      toast.success(`已將 ${sub.email} 標記為退訂`);
      void invalidateSubs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '退訂失敗');
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
        title="電子報"
        latin="Newsletter"
        meta={isPending ? '載入中' : `訂閱中 ${active.length} · 已退訂 ${unsubscribed.length}`}
        actions={
          <>
            <button type="button" className="adm-btn" onClick={() => void invalidateSubs()} disabled={isPending}>
              重新整理
            </button>
            <button type="button" className="adm-btn" onClick={exportCSV} disabled={visible.length === 0}>
              匯出 CSV
            </button>
          </>
        }
      />

      <section className="adm-stack" aria-label="訂閱名單">
        <div className="adm-toolbar">
          <div className="adm-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className="adm-tab"
                aria-pressed={tab === t.key}
                onClick={() => setTab(t.key)}
              >
                <span className="adm-tab-dot" aria-hidden="true" />
                {t.label}
                <span className="adm-meta">{isPending ? '' : lists[t.key].length}</span>
              </button>
            ))}
          </div>
          <label className="adm-prompt">
            <span className="adm-prompt-mark" aria-hidden="true">
              &gt;
            </span>
            <span className="sr-only">搜尋訂閱者</span>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Email 或名字" />
          </label>
        </div>

        <TabPanel tab={tab}>
          {isPending ? (
            <AdminLoading />
          ) : visible.length === 0 ? (
            <p className="adm-empty">
              {q ? '找不到符合的訂閱者。' : tab === 'active' ? '還沒有人訂閱。' : '沒有退訂紀錄。'}
            </p>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">Email</th>
                    <th scope="col">名字</th>
                    <th scope="col">訂閱</th>
                    <th scope="col">退訂</th>
                    <th scope="col">
                      <span className="sr-only">動作</span>
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
                              aria-label={`把 ${s.email} 標記為退訂`}
                              onClick={() => setToUnsubscribe(s)}
                            >
                              標記退訂
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
            <AlertDialogTitle>標記為退訂？</AlertDialogTitle>
            <AlertDialogDescription>
              {toUnsubscribe?.email} 會被標記為已退訂，之後不會再寄信到這個地址。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (toUnsubscribe) void handleUnsubscribe(toUnsubscribe);
                setToUnsubscribe(null);
              }}
            >
              標記退訂
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
