import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminFriendRow } from '@koimsurai/api-types';
import { toast } from 'sonner';

import { adminFriendsQueryOptions } from '@/data/adminData';
import { authHeaders, jsonAuthHeaders } from '@/lib/authToken';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import AdminLoading, { BusyDot } from './AdminLoading';
import { PageHead, SectionHead, TabPanel } from './AdminPage';
import { formatWhen } from './adminFormat';
import './AdminReview.css';
import './FriendsReview.css';

// 友鏈（2026-10 後台提案的「回」）：朋友頁送來的申請在這裡審。
// 「待看」是左邊清單、右邊選中那一份——對方的介紹與想說的話、五項自動檢查、在朋友頁上會長怎樣、
// 回信，最後是收下／等對方加回來再說／退回。「朋友」與「退回」是一般的表格。
//
// 自動檢查要站長按了才跑（後端過 net_guard 去連對方的站）：送出申請時不連，免得任何人都能
// 叫這台機器去連任意網址。

type View = 'queue' | 'approved' | 'rejected';

const TABS: { key: View; label: string }[] = [
  { key: 'queue', label: '待看' },
  { key: 'approved', label: '朋友' },
  { key: 'rejected', label: '退回' },
];

const hostOf = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

/** 清單上的一行摘要：「4 / 5 · 還沒連回來」，沒檢查過就說沒檢查過 */
function checkSummary(f: AdminFriendRow): { text: string; bad: boolean } {
  if (f.checks.length === 0) return { text: '還沒檢查', bad: false };
  const passed = f.checks.filter((c) => c.ok).length;
  const firstBad = f.checks.find((c) => !c.ok);
  return {
    text: `${passed} / ${f.checks.length}${firstBad ? ` · ${firstBad.label}沒過` : ''}`,
    bad: Boolean(firstBad),
  };
}

interface FriendForm {
  name: string;
  url: string;
  description: string;
  feed_url: string;
}

const EMPTY_FORM: FriendForm = { name: '', url: '', description: '', feed_url: '' };

export default function FriendsReview() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(adminFriendsQueryOptions);
  const friends = data?.friends ?? [];
  const counts = data?.counts;
  const [view, setView] = useState<View>('queue');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState<'check' | 'save' | null>(null);
  /** 正在檢查的那一份（朋友表格一列一顆鈕，要知道是哪一列在跑） */
  const [checkingId, setCheckingId] = useState<number | null>(null);
  const [editing, setEditing] = useState<AdminFriendRow | 'new' | null>(null);
  const [form, setForm] = useState<FriendForm>(EMPTY_FORM);
  const [removeTarget, setRemoveTarget] = useState<AdminFriendRow | null>(null);

  const queue = friends.filter((f) => f.status === 'pending' || f.status === 'waiting');
  const shown =
    view === 'queue' ? queue : friends.filter((f) => f.status === (view === 'approved' ? 'approved' : 'rejected'));
  // 選中的那一份：沒選或選的那份已經離開待看（審完了），就停在清單的第一份
  const selected = queue.find((f) => f.id === selectedId) ?? queue.at(0);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'friends'] });

  const patch = async (id: number, body: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/friends/${id}`, {
      method: 'PATCH',
      headers: jsonAuthHeaders(),
      body: JSON.stringify(body),
    });
    const out = (await res.json().catch(() => ({}))) as {
      error?: string;
      mail?: { sent: boolean; error?: string } | null;
    };
    if (!res.ok) throw new Error(out.error ?? `${res.status}`);
    return out;
  };

  const decide = async (f: AdminFriendRow, status: 'approved' | 'waiting' | 'rejected' | 'pending') => {
    setBusy('save');
    try {
      const out = await patch(f.id, { status, reply: reply.trim() || undefined });
      const verb = { approved: '收下了', waiting: '先放著，等對方加回來', rejected: '退回了', pending: '放回待看' }[
        status
      ];
      toast.success(`〈${f.name}〉${verb}`);
      if (out.mail?.sent) toast.success('回信寄出了');
      else if (out.mail) toast.error(`回信沒寄出：${out.mail.error ?? ''}`);
      setReply('');
      refresh();
    } catch (e) {
      toast.error(`沒有存到：${e instanceof Error ? e.message : ''}`);
    } finally {
      setBusy(null);
    }
  };

  // 檢查要連到對方的站（逾時可能好幾秒），按下去的那一列要看得出在跑，跑完說結果——
  // 不然結果只是表格裡一格字悄悄變了，看起來像按了沒反應
  const runCheck = async (f: AdminFriendRow) => {
    setBusy('check');
    setCheckingId(f.id);
    try {
      const res = await fetch(`/api/admin/friends/${f.id}/check`, { method: 'POST', headers: authHeaders() });
      if (!res.ok) throw new Error(`${res.status}`);
      const row = (await res.json()) as AdminFriendRow;
      await queryClient.invalidateQueries({ queryKey: ['admin', 'friends'] });
      const sum = checkSummary(row);
      if (sum.bad) toast.warning(`〈${f.name}〉檢查完了：${sum.text}`);
      else toast.success(`〈${f.name}〉檢查完了：${sum.text}，全部通過`);
    } catch (e) {
      toast.error(`檢查失敗：${e instanceof Error ? e.message : ''}`);
    } finally {
      setBusy(null);
      setCheckingId(null);
    }
  };

  const openEdit = (target: AdminFriendRow | 'new') => {
    setEditing(target);
    setForm(
      target === 'new'
        ? EMPTY_FORM
        : {
            name: target.name,
            url: target.url,
            description: target.description,
            feed_url: target.feed_url ?? '',
          },
    );
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      if (editing === 'new') {
        const res = await fetch('/api/admin/friends', {
          method: 'POST',
          headers: jsonAuthHeaders(),
          body: JSON.stringify(form),
        });
        const out = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(out.error ?? `${res.status}`);
        toast.success(`〈${form.name}〉加進朋友了`);
      } else {
        await patch(editing.id, { ...form });
        toast.success('改好了');
      }
      setEditing(null);
      refresh();
    } catch (err) {
      toast.error(`沒有存到：${err instanceof Error ? err.message : ''}`);
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    try {
      const res = await fetch(`/api/admin/friends/${removeTarget.id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error(`${res.status}`);
      toast.success('刪掉了');
      refresh();
    } catch (e) {
      toast.error(`刪除失敗：${e instanceof Error ? e.message : ''}`);
    } finally {
      setRemoveTarget(null);
    }
  };

  const countOf = (v: View) =>
    v === 'queue'
      ? counts
        ? counts.pending + counts.waiting
        : 0
      : v === 'approved'
        ? counts?.approved
        : counts?.rejected;

  return (
    <div className="adm-page">
      <PageHead
        title="友鏈"
        latin="Friends"
        meta={isPending ? '載入中' : `待看 ${countOf('queue') ?? 0} · 朋友 ${counts?.approved ?? 0}`}
        actions={
          <button type="button" className="adm-btn adm-btn-primary" onClick={() => openEdit('new')}>
            加一位朋友
          </button>
        }
      />

      <section className="adm-stack" aria-label="友鏈">
        <div className="adm-toolbar">
          <div className="adm-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className="adm-tab"
                aria-pressed={view === t.key}
                onClick={() => setView(t.key)}
              >
                <span className="adm-tab-dot" aria-hidden="true" />
                {t.label}
                <span className="adm-meta">{isPending ? '' : countOf(t.key)}</span>
              </button>
            ))}
          </div>
        </div>

        <TabPanel tab={view}>
          {isPending ? (
            <AdminLoading />
          ) : view === 'queue' ? (
            queue.length === 0 || !selected ? (
              <p className="adm-empty">沒有待看的申請。朋友頁的「成為下一顆」送來的會出現在這裡。</p>
            ) : (
              <div className="adm-review">
                <ul className="adm-review-list" aria-label="申請">
                  {queue.map((f) => {
                    const sum = checkSummary(f);
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          className="adm-review-item"
                          aria-pressed={selected.id === f.id}
                          // 鈕裡全是資料，沒有固定的字；報讀器念名字、網域與檢查結果
                          aria-label={`${f.name}，${hostOf(f.url)}，${sum.text}`}
                          onClick={() => {
                            setSelectedId(f.id);
                            setReply('');
                          }}
                        >
                          <span className="adm-tab-dot" aria-hidden="true" />
                          <span className="adm-review-item-main">
                            <span className="adm-review-item-top">
                              <span className="adm-review-who">{f.name}</span>
                              <span className="adm-meta">{formatWhen(f.created_at)}</span>
                            </span>
                            <span className="adm-meta">{hostOf(f.url)}</span>
                            <span className="adm-meta adm-fr-sum" data-bad={sum.bad || undefined}>
                              {f.status === 'waiting' ? '等對方加回來 · ' : ''}
                              {sum.text}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <section className="adm-review-detail" aria-label="這份申請">
                  <div className="adm-review-head">
                    <div className="adm-head-text">
                      <span className="adm-review-name">{selected.name}</span>
                      <a href={selected.url} target="_blank" rel="noreferrer" className="adm-meta">
                        {selected.url} ↗
                      </a>
                    </div>
                    <span className="adm-meta">
                      {formatWhen(selected.created_at, 'MM.dd HH:mm')} 送出 · {selected.email ? '有留信箱' : '沒留信箱'}
                    </span>
                  </div>

                  {selected.description && <p className="adm-review-body">{selected.description}</p>}
                  {selected.message && (
                    <blockquote className="adm-fr-message">
                      <span className="adm-caps">想說的話</span>
                      {selected.message}
                    </blockquote>
                  )}

                  <div className="adm-fr-checks">
                    <SectionHead
                      id="fr-checks-h"
                      action={
                        <button
                          type="button"
                          className="adm-btn adm-btn-small"
                          disabled={busy !== null}
                          aria-busy={checkingId === selected.id}
                          onClick={() => void runCheck(selected)}
                        >
                          {checkingId === selected.id ? (
                            <>
                              <BusyDot />
                              檢查中
                            </>
                          ) : selected.checks.length ? (
                            '重新檢查'
                          ) : (
                            '檢查'
                          )}
                        </button>
                      }
                    >
                      自動檢查{selected.checked_at ? ` · ${formatWhen(selected.checked_at)}` : ''}
                    </SectionHead>
                    {checkingId === selected.id && (
                      <p className="adm-meta adm-fr-checking" aria-live="polite">
                        <BusyDot />
                        正在連到 {hostOf(selected.url)}——連不到的話會等到逾時，可能要十幾秒
                      </p>
                    )}
                    {selected.checks.length === 0 ? (
                      checkingId !== selected.id && (
                        <p className="adm-meta">
                          還沒檢查。按下去會連到對方的站，看連不連得到、有沒有 RSS、有沒有連回來。
                        </p>
                      )
                    ) : (
                      <ul className="adm-fr-check-list" data-stale={checkingId === selected.id || undefined}>
                        {selected.checks.map((c) => (
                          <li key={c.key} data-ok={c.ok || undefined}>
                            <span className="adm-fr-mark" aria-hidden="true">
                              {c.ok ? '✓' : '×'}
                            </span>
                            <span>
                              {c.label}
                              <span className="sr-only">{c.ok ? '：通過' : '：沒過'}</span>
                            </span>
                            <span className="adm-meta">{c.detail}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="adm-fr-preview">
                    <span className="adm-caps">在朋友頁會是</span>
                    <div className="adm-fr-card">
                      <span className="adm-fr-star" aria-hidden="true" />
                      <span className="adm-fr-card-text">
                        <b>{selected.name}</b>
                        <span className="adm-meta">{hostOf(selected.url)}</span>
                        {selected.description && <span>{selected.description}</span>}
                      </span>
                    </div>
                  </div>

                  <div className="adm-review-reply">
                    <label className="adm-caps" htmlFor="fr-reply">
                      回信 · 選填，寄到對方留的信箱
                    </label>
                    <div className="adm-prompt adm-prompt-multi">
                      <span className="adm-prompt-mark" aria-hidden="true">
                        &gt;
                      </span>
                      <textarea
                        id="fr-reply"
                        rows={2}
                        value={reply}
                        disabled={!selected.email}
                        placeholder={selected.email ? '例如：已經收下，也請記得把這邊加回去' : '對方沒有留信箱'}
                        onChange={(e) => setReply(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="adm-review-actions">
                    <button
                      type="button"
                      className="adm-btn adm-btn-primary"
                      disabled={busy !== null}
                      onClick={() => void decide(selected, 'approved')}
                    >
                      收下
                    </button>
                    {selected.status === 'pending' && (
                      <button
                        type="button"
                        className="adm-btn"
                        disabled={busy !== null}
                        onClick={() => void decide(selected, 'waiting')}
                      >
                        等對方加回來再說
                      </button>
                    )}
                    <span className="adm-review-gap" />
                    <button
                      type="button"
                      className="adm-icon-btn adm-icon-btn-flare"
                      disabled={busy !== null}
                      onClick={() => void decide(selected, 'rejected')}
                    >
                      退回
                    </button>
                  </div>
                </section>
              </div>
            )
          ) : shown.length === 0 ? (
            <p className="adm-empty">{view === 'approved' ? '還沒有朋友。' : '沒有退回的申請。'}</p>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">站名</th>
                    <th scope="col">網址</th>
                    <th scope="col">檢查</th>
                    <th scope="col">{view === 'approved' ? '收下' : '退回'}</th>
                    <th scope="col">
                      <span className="sr-only">動作</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((f) => {
                    const sum = checkSummary(f);
                    return (
                      <tr key={f.id}>
                        <td className="adm-cell-title">
                          <span className="adm-title-link">{f.name}</span>
                          {f.description && <span className="adm-meta adm-tags">{f.description}</span>}
                        </td>
                        <td>
                          <a href={f.url} target="_blank" rel="noreferrer" className="adm-meta">
                            {hostOf(f.url)} ↗
                          </a>
                        </td>
                        <td>
                          {checkingId === f.id ? (
                            <span className="adm-meta adm-fr-checking">
                              <BusyDot />
                              檢查中
                            </span>
                          ) : (
                            <span className="adm-meta adm-fr-sum" data-bad={sum.bad || undefined}>
                              {sum.text}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="adm-meta">{formatWhen(f.reviewed_at, 'yyyy.MM.dd')}</span>
                        </td>
                        <td>
                          <div className="adm-row-actions">
                            {view === 'approved' ? (
                              <>
                                <button
                                  type="button"
                                  className="adm-icon-btn"
                                  aria-label={checkingId === f.id ? `正在檢查 ${f.name}` : `檢查 ${f.name}`}
                                  aria-busy={checkingId === f.id}
                                  disabled={busy !== null}
                                  onClick={() => void runCheck(f)}
                                >
                                  {checkingId === f.id ? (
                                    <>
                                      <BusyDot />
                                      檢查中
                                    </>
                                  ) : (
                                    '檢查'
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="adm-icon-btn"
                                  aria-label={`編輯 ${f.name}`}
                                  onClick={() => openEdit(f)}
                                >
                                  編輯
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="adm-icon-btn"
                                aria-label={`把 ${f.name} 放回待看`}
                                onClick={() => void decide(f, 'pending')}
                              >
                                放回待看
                              </button>
                            )}
                            <button
                              type="button"
                              className="adm-icon-btn adm-icon-btn-flare"
                              aria-label={`刪除 ${f.name}`}
                              onClick={() => setRemoveTarget(f)}
                            >
                              刪除
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabPanel>
      </section>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? '加一位朋友' : '編輯朋友'}</DialogTitle>
            <DialogDescription>
              站名與介紹照對方站上寫的。直接加的朋友不經過申請，存了就出現在朋友頁。
            </DialogDescription>
          </DialogHeader>
          <form className="adm-form" onSubmit={(e) => void saveEdit(e)}>
            <label className="adm-field">
              <span className="adm-caps">站名</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label className="adm-field">
              <span className="adm-caps">網址</span>
              <input
                type="url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://"
                required
              />
            </label>
            <label className="adm-field">
              <span className="adm-caps">一句介紹</span>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className="adm-field">
              <span className="adm-caps">RSS · 選填</span>
              <input
                type="url"
                value={form.feed_url}
                onChange={(e) => setForm({ ...form, feed_url: e.target.value })}
                placeholder="https://"
              />
            </label>
            <div className="adm-form-actions">
              <button type="button" className="adm-btn" onClick={() => setEditing(null)}>
                取消
              </button>
              <button type="submit" className="adm-btn adm-btn-primary">
                {editing === 'new' ? '加進朋友' : '更新'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeTarget !== null} onOpenChange={() => setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除〈{removeTarget?.name}〉？</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.status === 'approved' ? '會從朋友頁上消失。' : '這份申請會整個刪掉。'}
              想留著紀錄的話，改成退回就好。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>留著</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()} variant="destructive">
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
