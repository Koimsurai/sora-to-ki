import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminFriendRow } from '@koimsurai/api-types';
import { toast } from 'sonner';

import { adminFriendsQueryOptions } from '@/data/adminData';
import { at, useAdminT } from '@/i18n/admin-i18n';
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

const TABS: readonly View[] = ['queue', 'approved', 'rejected'];

const hostOf = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

/** 清單上的一行摘要：「4 / 5 · 還沒連回來」，沒檢查過就說沒檢查過 */
function checkSummary(f: AdminFriendRow): { text: string; bad: boolean } {
  if (f.checks.length === 0) return { text: at('friends.checkNone'), bad: false };
  const passed = f.checks.filter((c) => c.ok).length;
  const firstBad = f.checks.find((c) => !c.ok);
  const total = f.checks.length;
  return {
    text: firstBad
      ? at('friends.checkSumBad', { passed, total, label: firstBad.label })
      : at('friends.checkSum', { passed, total }),
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
  const { t } = useAdminT();
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
      toast.success(t(`friends.decided.${status}`, { name: f.name }));
      if (out.mail?.sent) toast.success(t('friends.mailSent'));
      else if (out.mail) toast.error(t('friends.mailFailed', { error: out.mail.error ?? '' }));
      setReply('');
      refresh();
    } catch (e) {
      toast.error(t('friends.saveFailed', { error: e instanceof Error ? e.message : '' }));
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
      if (sum.bad) toast.warning(t('friends.checkedBad', { name: f.name, summary: sum.text }));
      else toast.success(t('friends.checkedOk', { name: f.name, summary: sum.text }));
    } catch (e) {
      toast.error(t('friends.checkFailed', { error: e instanceof Error ? e.message : '' }));
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
        toast.success(t('friends.added', { name: form.name }));
      } else {
        await patch(editing.id, { ...form });
        toast.success(t('friends.updated'));
      }
      setEditing(null);
      refresh();
    } catch (err) {
      toast.error(t('friends.saveFailed', { error: err instanceof Error ? err.message : '' }));
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    try {
      const res = await fetch(`/api/admin/friends/${removeTarget.id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error(`${res.status}`);
      toast.success(t('friends.deleted'));
      refresh();
    } catch (e) {
      toast.error(t('friends.deleteFailed', { error: e instanceof Error ? e.message : '' }));
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
        title={t('nav.friends')}
        latin="Friends"
        meta={
          isPending
            ? t('common.loading')
            : t('friends.meta', { queue: countOf('queue') ?? 0, approved: counts?.approved ?? 0 })
        }
        actions={
          <button type="button" className="adm-btn adm-btn-primary" onClick={() => openEdit('new')}>
            {t('friends.addFriend')}
          </button>
        }
      />

      <section className="adm-stack" aria-label={t('nav.friends')}>
        <div className="adm-toolbar">
          <div className="adm-tabs">
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                className="adm-tab"
                aria-pressed={view === tab}
                onClick={() => setView(tab)}
              >
                <span className="adm-tab-dot" aria-hidden="true" />
                {t(`friends.tabs.${tab}`)}
                <span className="adm-meta">{isPending ? '' : countOf(tab)}</span>
              </button>
            ))}
          </div>
        </div>

        <TabPanel tab={view}>
          {isPending ? (
            <AdminLoading />
          ) : view === 'queue' ? (
            queue.length === 0 || !selected ? (
              <p className="adm-empty">{t('friends.queueEmpty')}</p>
            ) : (
              <div className="adm-review">
                <ul className="adm-review-list" aria-label={t('friends.listLabel')}>
                  {queue.map((f) => {
                    const sum = checkSummary(f);
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          className="adm-review-item"
                          aria-pressed={selected.id === f.id}
                          // 鈕裡全是資料，沒有固定的字；報讀器念名字、網域與檢查結果
                          aria-label={t('friends.itemLabel', { name: f.name, host: hostOf(f.url), summary: sum.text })}
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
                              {f.status === 'waiting' ? `${t('friends.waitingTag')} · ` : ''}
                              {sum.text}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <section className="adm-review-detail" aria-label={t('friends.detailLabel')}>
                  <div className="adm-review-head">
                    <div className="adm-head-text">
                      <span className="adm-review-name">{selected.name}</span>
                      <a href={selected.url} target="_blank" rel="noreferrer" className="adm-meta">
                        {selected.url} ↗
                      </a>
                    </div>
                    <span className="adm-meta">
                      {t('friends.submittedAt', { when: formatWhen(selected.created_at, 'MM.dd HH:mm') })} ·{' '}
                      {selected.email ? t('friends.hasEmail') : t('friends.noEmail')}
                    </span>
                  </div>

                  {selected.description && <p className="adm-review-body">{selected.description}</p>}
                  {selected.message && (
                    <blockquote className="adm-fr-message">
                      <span className="adm-caps">{t('friends.message')}</span>
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
                              {t('friends.checking')}
                            </>
                          ) : selected.checks.length ? (
                            t('friends.recheck')
                          ) : (
                            t('friends.check')
                          )}
                        </button>
                      }
                    >
                      {t('friends.checksHead')}
                      {selected.checked_at ? ` · ${formatWhen(selected.checked_at)}` : ''}
                    </SectionHead>
                    {checkingId === selected.id && (
                      <p className="adm-meta adm-fr-checking" aria-live="polite">
                        <BusyDot />
                        {t('friends.connecting', { host: hostOf(selected.url) })}
                      </p>
                    )}
                    {selected.checks.length === 0 ? (
                      checkingId !== selected.id && <p className="adm-meta">{t('friends.checksNone')}</p>
                    ) : (
                      <ul className="adm-fr-check-list" data-stale={checkingId === selected.id || undefined}>
                        {selected.checks.map((c) => (
                          <li key={c.key} data-ok={c.ok || undefined}>
                            <span className="adm-fr-mark" aria-hidden="true">
                              {c.ok ? '✓' : '×'}
                            </span>
                            <span>
                              {c.label}
                              <span className="sr-only">{c.ok ? t('friends.checkPass') : t('friends.checkFail')}</span>
                            </span>
                            <span className="adm-meta">{c.detail}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="adm-fr-preview">
                    <span className="adm-caps">{t('friends.preview')}</span>
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
                      {t('friends.replyLabel')}
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
                        placeholder={selected.email ? t('friends.replyPlaceholder') : t('friends.noEmailPlaceholder')}
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
                      {t('friends.accept')}
                    </button>
                    {selected.status === 'pending' && (
                      <button
                        type="button"
                        className="adm-btn"
                        disabled={busy !== null}
                        onClick={() => void decide(selected, 'waiting')}
                      >
                        {t('friends.wait')}
                      </button>
                    )}
                    <span className="adm-review-gap" />
                    <button
                      type="button"
                      className="adm-icon-btn adm-icon-btn-flare"
                      disabled={busy !== null}
                      onClick={() => void decide(selected, 'rejected')}
                    >
                      {t('friends.reject')}
                    </button>
                  </div>
                </section>
              </div>
            )
          ) : shown.length === 0 ? (
            <p className="adm-empty">{view === 'approved' ? t('friends.emptyApproved') : t('friends.emptyRejected')}</p>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">{t('friends.col.name')}</th>
                    <th scope="col">{t('friends.col.url')}</th>
                    <th scope="col">{t('friends.col.check')}</th>
                    <th scope="col">{view === 'approved' ? t('friends.col.approved') : t('friends.col.rejected')}</th>
                    <th scope="col">
                      <span className="sr-only">{t('friends.col.actions')}</span>
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
                              {t('friends.checking')}
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
                                  aria-label={
                                    checkingId === f.id
                                      ? t('friends.checkingName', { name: f.name })
                                      : t('friends.checkName', { name: f.name })
                                  }
                                  aria-busy={checkingId === f.id}
                                  disabled={busy !== null}
                                  onClick={() => void runCheck(f)}
                                >
                                  {checkingId === f.id ? (
                                    <>
                                      <BusyDot />
                                      {t('friends.checking')}
                                    </>
                                  ) : (
                                    t('friends.check')
                                  )}
                                </button>
                                <button
                                  type="button"
                                  className="adm-icon-btn"
                                  aria-label={t('friends.editName', { name: f.name })}
                                  onClick={() => openEdit(f)}
                                >
                                  {t('friends.edit')}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="adm-icon-btn"
                                aria-label={t('friends.requeueName', { name: f.name })}
                                onClick={() => void decide(f, 'pending')}
                              >
                                {t('friends.requeue')}
                              </button>
                            )}
                            <button
                              type="button"
                              className="adm-icon-btn adm-icon-btn-flare"
                              aria-label={t('friends.deleteName', { name: f.name })}
                              onClick={() => setRemoveTarget(f)}
                            >
                              {t('common.delete')}
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
            <DialogTitle>{editing === 'new' ? t('friends.addFriend') : t('friends.editTitle')}</DialogTitle>
            <DialogDescription>{t('friends.editDesc')}</DialogDescription>
          </DialogHeader>
          <form className="adm-form" onSubmit={(e) => void saveEdit(e)}>
            <label className="adm-field">
              <span className="adm-caps">{t('friends.field.name')}</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label className="adm-field">
              <span className="adm-caps">{t('friends.field.url')}</span>
              <input
                type="url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://"
                required
              />
            </label>
            <label className="adm-field">
              <span className="adm-caps">{t('friends.field.description')}</span>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className="adm-field">
              <span className="adm-caps">{t('friends.field.feed')}</span>
              <input
                type="url"
                value={form.feed_url}
                onChange={(e) => setForm({ ...form, feed_url: e.target.value })}
                placeholder="https://"
              />
            </label>
            <div className="adm-form-actions">
              <button type="button" className="adm-btn" onClick={() => setEditing(null)}>
                {t('friends.cancel')}
              </button>
              <button type="submit" className="adm-btn adm-btn-primary">
                {editing === 'new' ? t('friends.submitNew') : t('friends.submitUpdate')}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeTarget !== null} onOpenChange={() => setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('friends.removeTitle', { name: removeTarget?.name ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.status === 'approved' ? t('friends.removeApproved') : t('friends.removePending')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('friends.keep')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()} variant="destructive">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
