import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminCommentRow } from '@koimsurai/api-types';
import { toast } from 'sonner';

import {
  adminBlacklistQueryOptions,
  adminCommentsQueryOptions,
  adminKeywordFiltersQueryOptions,
} from '@/data/adminData';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { at, useAdminT } from '@/i18n/admin-i18n';
import { jsonAuthHeaders } from '@/lib/authToken';
import AdminLoading from './AdminLoading';
import { AdminSelect } from './AdminFields';
import { PageHead, TabPanel } from './AdminPage';
import { formatWhen } from './adminFormat';
import './AdminReview.css';

// 留言審核（2026-10 後台提案）：左邊是清單，右邊是選中那一則的全文與動作。
// 審完自動停在下一則（批准之後那則從「待審」消失，選取落到清單的第一則），
// 鍵盤 j／k 上下、a 批准、s 垃圾、r 回覆。回覆直接寫在右邊，不再開對話框。
// 封鎖名單與關鍵字是同一排分頁裡的另外兩頁。

type Comment = AdminCommentRow;
type Status = 'pending' | 'approved' | 'spam' | 'trash';
type View = Status | 'all' | 'blacklist' | 'keywords';

const STATUSES: readonly string[] = ['pending', 'approved', 'spam', 'trash'] satisfies Status[];

const PAGE_SIZE = 50;

/** 狀態名；後端回了這裡沒列到的值（或 null）就照原樣顯示 */
const statusLabel = (s: string | null) => (s ? (STATUSES.includes(s) ? at(`comments.status.${s}`) : s) : '');

/** 這則留言留在哪裡：手記、碎念，或兩者都不是的留言板 */
function placeOf(c: Comment): { label: string; href: string | null } {
  if (c.post_id)
    return {
      label: c.post_title
        ? at('comments.place.titled', { title: c.post_title })
        : at('comments.place.post', { id: c.post_id }),
      href: `/blog/${c.post_id}`,
    };
  if (c.thought_id)
    return { label: at('comments.place.thought', { id: c.thought_id }), href: `/thinking/${c.thought_id}` };
  return { label: at('comments.place.board'), href: '/messages' };
}

export default function CommentsManager() {
  const { t } = useAdminT();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const [editDialog, setEditDialog] = useState<{ open: boolean; comment: Comment | null }>({
    open: false,
    comment: null,
  });
  const [editText, setEditText] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [newBlacklistIp, setNewBlacklistIp] = useState('');
  const [newBlacklistReason, setNewBlacklistReason] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [newKeywordAction, setNewKeywordAction] = useState('spam');

  const isList = view !== 'blacklist' && view !== 'keywords';

  // 留言列表由 TanStack Query 讀（分頁／篩選進 queryKey）；封鎖名單、關鍵字切到那一頁才抓
  const commentsQuery = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (isList && view !== 'all') params.set('status', view);
    if (searchQuery) params.set('search', searchQuery);
    return params.toString();
  }, [page, view, isList, searchQuery]);
  const { data: commentsData, isPending } = useQuery(adminCommentsQueryOptions(commentsQuery));
  const comments: Comment[] = commentsData?.comments ?? [];
  const counts = commentsData?.counts ?? { pending: 0, approved: 0, spam: 0, trash: 0 };
  const total = commentsData?.total ?? 0;

  const { data: blacklist = [] } = useQuery({ ...adminBlacklistQueryOptions, enabled: view === 'blacklist' });
  const { data: keywordFilters = [] } = useQuery({ ...adminKeywordFiltersQueryOptions, enabled: view === 'keywords' });

  // 選取跟著資料走：選中的那則不在清單裡了（審完、換頁、換分頁），就落到第一則
  const selected: Comment | null = comments.find((c) => c.id === selectedId) ?? comments.at(0) ?? null;

  const invalidateComments = () => queryClient.invalidateQueries({ queryKey: ['admin', 'comments'] });
  const invalidateBlacklist = () => queryClient.invalidateQueries({ queryKey: adminBlacklistQueryOptions.queryKey });
  const invalidateKeywords = () =>
    queryClient.invalidateQueries({ queryKey: adminKeywordFiltersQueryOptions.queryKey });

  const switchView = (next: View) => {
    setView(next);
    setPage(1);
    setSelectedId(null);
  };

  // ── 動作 ──
  const updateStatus = async (id: number, status: Status) => {
    try {
      const res = await fetch(`/api/admin/comments/${id}/status`, {
        method: 'PATCH',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast.success(t(`comments.done.${status}`));
        void invalidateComments();
      } else {
        toast.error(t('comments.actionFailed'));
      }
    } catch {
      toast.error(t('comments.actionFailed'));
    }
  };

  const handleReply = async () => {
    if (!selected || !replyText.trim()) return;
    try {
      const res = await fetch(`/api/admin/comments/${selected.id}/reply`, {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ content: replyText }),
      });
      if (res.ok) {
        toast.success(t('comments.replied'));
        setReplyText('');
        void invalidateComments();
      } else {
        toast.error(t('comments.replyFailed'));
      }
    } catch {
      toast.error(t('comments.replyFailed'));
    }
  };

  const handleEdit = async () => {
    if (!editText.trim()) return;
    try {
      const res = await fetch(`/api/admin/comments/${editDialog.comment?.id}`, {
        method: 'PUT',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ content: editText }),
      });
      if (res.ok) {
        toast.success(t('comments.edited'));
        setEditDialog({ open: false, comment: null });
        void invalidateComments();
      }
    } catch {
      toast.error(t('comments.editFailed'));
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/admin/comments/${deleteId}`, { method: 'DELETE', headers: jsonAuthHeaders() });
      if (res.ok) {
        toast.success(t('comments.deleted'));
        setDeleteId(null);
        void invalidateComments();
      }
    } catch {
      toast.error(t('comments.deleteFailed'));
    }
  };

  const blockIp = async (ip: string) => {
    try {
      const res = await fetch('/api/admin/blacklist', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ ip, reason: t('comments.blockReason') }),
      });
      if (res.ok) toast.success(t('comments.blocked', { ip }));
    } catch {
      toast.error(t('comments.blockFailed'));
    }
  };

  const addBlacklist = async () => {
    if (!newBlacklistIp.trim()) return;
    try {
      const res = await fetch('/api/admin/blacklist', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ ip: newBlacklistIp, reason: newBlacklistReason }),
      });
      if (res.ok) {
        toast.success(t('comments.blacklistAdded'));
        setNewBlacklistIp('');
        setNewBlacklistReason('');
        void invalidateBlacklist();
      }
    } catch {
      toast.error(t('comments.actionFailed'));
    }
  };

  const removeBlacklist = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/blacklist/${id}`, { method: 'DELETE', headers: jsonAuthHeaders() });
      if (res.ok) {
        toast.success(t('comments.removed'));
        void invalidateBlacklist();
      }
    } catch {
      toast.error(t('comments.actionFailed'));
    }
  };

  const addKeyword = async () => {
    if (!newKeyword.trim()) return;
    try {
      const res = await fetch('/api/admin/keyword-filters', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ keyword: newKeyword, action: newKeywordAction }),
      });
      if (res.ok) {
        toast.success(t('comments.keywordAdded'));
        setNewKeyword('');
        void invalidateKeywords();
      }
    } catch {
      toast.error(t('comments.actionFailed'));
    }
  };

  const removeKeyword = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/keyword-filters/${id}`, { method: 'DELETE', headers: jsonAuthHeaders() });
      if (res.ok) {
        toast.success(t('comments.removed'));
        void invalidateKeywords();
      }
    } catch {
      toast.error(t('comments.actionFailed'));
    }
  };

  // ── 鍵盤：j／k 上下、a 批准、s 垃圾、r 回覆。打字、開著對話框、按著修飾鍵時不攔 ──
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (!isList || !selected || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
    const index = comments.findIndex((c) => c.id === selected.id);
    const move = (to: Comment | undefined) => to && setSelectedId(to.id);
    switch (e.key) {
      case 'j':
        move(comments[index + 1]);
        break;
      case 'k':
        move(comments[index - 1]);
        break;
      case 'a':
        if (selected.status !== 'approved') void updateStatus(selected.id, 'approved');
        break;
      case 's':
        if (selected.status !== 'spam') void updateStatus(selected.id, 'spam');
        break;
      case 'r':
        replyRef.current?.focus();
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const totalAll = counts.pending + counts.approved + counts.spam + counts.trash;
  const tabs: { key: View; label: string; count?: number }[] = [
    { key: 'pending', label: t('comments.status.pending'), count: counts.pending },
    { key: 'approved', label: t('comments.status.approved'), count: counts.approved },
    { key: 'spam', label: t('comments.status.spam'), count: counts.spam },
    { key: 'trash', label: t('comments.status.trash'), count: counts.trash },
    { key: 'all', label: t('comments.tabs.all'), count: totalAll },
    { key: 'blacklist', label: t('comments.tabs.blacklist') },
    { key: 'keywords', label: t('comments.tabs.keywords') },
  ];

  return (
    <div className="adm-page">
      <PageHead
        title={t('nav.comments')}
        latin="Signals"
        meta={commentsData ? t('comments.meta', { pending: counts.pending, total: totalAll }) : t('common.loading')}
      />

      <section className="adm-stack" aria-label={t('comments.reviewLabel')}>
        <div className="adm-toolbar">
          <div className="adm-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className="adm-tab"
                aria-pressed={view === tab.key}
                onClick={() => switchView(tab.key)}
              >
                <span className="adm-tab-dot" aria-hidden="true" />
                {tab.label}
                {tab.count !== undefined && <span className="adm-meta">{tab.count}</span>}
              </button>
            ))}
          </div>
          {isList && (
            <label className="adm-prompt">
              <span className="adm-prompt-mark" aria-hidden="true">
                &gt;
              </span>
              <span className="sr-only">{t('comments.searchLabel')}</span>
              <input
                type="text"
                placeholder={t('comments.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
              />
            </label>
          )}
        </div>

        <TabPanel tab={view}>
          {isList &&
            (isPending ? (
              <AdminLoading />
            ) : comments.length === 0 ? (
              <p className="adm-empty">
                {searchQuery
                  ? t('comments.noMatch')
                  : view === 'all'
                    ? t('comments.empty')
                    : t('comments.emptyIn', { status: statusLabel(view) })}
              </p>
            ) : (
              <div className="adm-review">
                <ul className="adm-review-list" aria-label={t('comments.listLabel')}>
                  {comments.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="adm-review-item"
                        aria-pressed={selected?.id === c.id}
                        aria-label={t('comments.itemLabel', { author: c.author, content: c.content })}
                        onClick={() => setSelectedId(c.id)}
                      >
                        <span className="adm-tab-dot" aria-hidden="true" />
                        <span className="adm-review-item-main">
                          <span className="adm-review-item-top">
                            <span className="adm-review-who">{c.author}</span>
                            <span className="adm-meta">{formatWhen(c.created_at)}</span>
                          </span>
                          <span className="adm-meta adm-review-where">
                            {placeOf(c).label}
                            {view === 'all' && c.status ? ` · ${statusLabel(c.status)}` : ''}
                          </span>
                          <span className="adm-review-excerpt">{c.content}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>

                {selected && (
                  <section className="adm-review-detail" aria-label={t('comments.detailLabel')}>
                    <div className="adm-review-head">
                      <div className="adm-head-text">
                        <span className="adm-review-name">
                          {selected.author}
                          {selected.is_admin ? <span className="adm-meta"> · {t('comments.owner')}</span> : null}
                        </span>
                        <span className="adm-meta">
                          {formatWhen(selected.created_at, 'yyyy.MM.dd HH:mm')}
                          {selected.email ? ` · ${selected.email}` : ''}
                          {selected.ip ? ` · IP ${selected.ip}` : ''}
                          {selected.status ? ` · ${statusLabel(selected.status)}` : ''}
                        </span>
                      </div>
                      {placeOf(selected).href && (
                        <a
                          href={placeOf(selected).href ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="adm-row-action"
                        >
                          {t('comments.openIn', { place: placeOf(selected).label })}
                        </a>
                      )}
                    </div>

                    {selected.parent_id ? (
                      <p className="adm-meta">{t('comments.replyTo', { id: selected.parent_id })}</p>
                    ) : null}
                    <p className="adm-review-body">{selected.content}</p>

                    <div className="adm-review-actions">
                      {selected.status !== 'approved' && (
                        <button
                          type="button"
                          className="adm-btn adm-btn-primary"
                          onClick={() => void updateStatus(selected.id, 'approved')}
                        >
                          {t('comments.approve')} <kbd>A</kbd>
                        </button>
                      )}
                      {selected.status !== 'spam' && (
                        <button
                          type="button"
                          className="adm-btn"
                          onClick={() => void updateStatus(selected.id, 'spam')}
                        >
                          {t('comments.markSpam')} <kbd>S</kbd>
                        </button>
                      )}
                      {selected.status !== 'trash' && (
                        <button
                          type="button"
                          className="adm-btn"
                          onClick={() => void updateStatus(selected.id, 'trash')}
                        >
                          {t('comments.toTrash')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="adm-btn"
                        onClick={() => {
                          setEditDialog({ open: true, comment: selected });
                          setEditText(selected.content);
                        }}
                      >
                        {t('comments.edit')}
                      </button>
                      <span className="adm-review-gap" />
                      {selected.ip && (
                        <button
                          type="button"
                          className="adm-icon-btn adm-icon-btn-flare"
                          onClick={() => {
                            if (selected.ip) void blockIp(selected.ip);
                          }}
                        >
                          {t('comments.blockIp')}
                        </button>
                      )}
                      {selected.status === 'trash' && (
                        <button
                          type="button"
                          className="adm-icon-btn adm-icon-btn-flare"
                          onClick={() => setDeleteId(selected.id)}
                        >
                          {t('comments.deleteForever')}
                        </button>
                      )}
                    </div>

                    <form
                      className="adm-review-reply"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void handleReply();
                      }}
                    >
                      <label className="adm-caps" htmlFor="adm-reply">
                        {t('comments.replyAs')}
                      </label>
                      <div className="adm-prompt adm-prompt-multi">
                        <span className="adm-prompt-mark" aria-hidden="true">
                          &gt;
                        </span>
                        <textarea
                          id="adm-reply"
                          ref={replyRef}
                          rows={3}
                          value={replyText}
                          placeholder={t('comments.replyPlaceholder')}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                              e.preventDefault();
                              void handleReply();
                            }
                          }}
                        />
                      </div>
                      <div className="adm-review-reply-foot">
                        <span className="adm-meta">{t('comments.shortcuts')}</span>
                        <button type="submit" className="adm-btn" disabled={!replyText.trim()}>
                          {t('comments.sendReply')}
                        </button>
                      </div>
                    </form>
                  </section>
                )}
              </div>
            ))}

          {isList && total > PAGE_SIZE && (
            <div className="adm-pager">
              <button
                type="button"
                className="adm-btn adm-btn-small"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t('comments.prev')}
              </button>
              <span className="adm-meta">{t('comments.pageInfo', { page, total })}</span>
              <button
                type="button"
                className="adm-btn adm-btn-small"
                disabled={comments.length < PAGE_SIZE}
                onClick={() => setPage((p) => p + 1)}
              >
                {t('comments.next')}
              </button>
            </div>
          )}

          {view === 'blacklist' && (
            <div className="adm-stack">
              <form
                className="adm-inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addBlacklist();
                }}
              >
                <label className="adm-prompt">
                  <span className="adm-prompt-mark" aria-hidden="true">
                    &gt;
                  </span>
                  <span className="sr-only">{t('comments.ip')}</span>
                  <input
                    placeholder={t('comments.ip')}
                    value={newBlacklistIp}
                    onChange={(e) => setNewBlacklistIp(e.target.value)}
                  />
                </label>
                <label className="adm-prompt adm-grow">
                  <span className="sr-only">{t('comments.reason')}</span>
                  <input
                    placeholder={t('comments.reasonPlaceholder')}
                    value={newBlacklistReason}
                    onChange={(e) => setNewBlacklistReason(e.target.value)}
                  />
                </label>
                <button type="submit" className="adm-btn">
                  {t('comments.block')}
                </button>
              </form>
              {blacklist.length === 0 ? (
                <p className="adm-empty">{t('comments.blacklistEmpty')}</p>
              ) : (
                <ul className="adm-list">
                  {blacklist.map((b) => (
                    <li key={b.id} className="adm-row">
                      <span className="adm-row-main">
                        <span className="adm-row-title adm-mono">{b.ip}</span>
                        <span className="adm-meta">
                          {b.reason ? `${b.reason} · ` : ''}
                          {formatWhen(b.created_at, 'yyyy.MM.dd')}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="adm-icon-btn"
                        aria-label={t('comments.unblockLabel', { ip: b.ip })}
                        onClick={() => void removeBlacklist(b.id)}
                      >
                        {t('comments.unblock')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {view === 'keywords' && (
            <div className="adm-stack">
              <form
                className="adm-inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addKeyword();
                }}
              >
                <label className="adm-prompt adm-grow">
                  <span className="adm-prompt-mark" aria-hidden="true">
                    &gt;
                  </span>
                  <span className="sr-only">{t('comments.keyword')}</span>
                  <input
                    placeholder={t('comments.keyword')}
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                  />
                </label>
                <div className="adm-prompt">
                  <AdminSelect
                    label={t('comments.keywordAction')}
                    value={newKeywordAction}
                    onChange={setNewKeywordAction}
                    options={[
                      { value: 'spam', label: t('comments.actionSpam') },
                      { value: 'reject', label: t('comments.actionReject') },
                    ]}
                  />
                </div>
                <button type="submit" className="adm-btn">
                  {t('comments.add')}
                </button>
              </form>
              {keywordFilters.length === 0 ? (
                <p className="adm-empty">{t('comments.keywordsEmpty')}</p>
              ) : (
                <ul className="adm-chips">
                  {keywordFilters.map((f) => (
                    <li key={f.id} className="adm-chip">
                      {f.keyword}
                      <span className="adm-meta">
                        {f.action === 'reject' ? t('comments.chipReject') : t('comments.chipSpam')}
                      </span>
                      <button
                        type="button"
                        className="adm-chip-x"
                        aria-label={t('comments.removeKeyword', { keyword: f.keyword })}
                        onClick={() => void removeKeyword(f.id)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </TabPanel>
      </section>

      <Dialog open={editDialog.open} onOpenChange={(o) => setEditDialog({ open: o, comment: editDialog.comment })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('comments.editTitle')}</DialogTitle>
            <DialogDescription>{t('comments.editDesc')}</DialogDescription>
          </DialogHeader>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            aria-label={t('comments.contentLabel')}
            className="adm-dialog-textarea"
          />
          <DialogFooter>
            <button type="button" className="adm-btn" onClick={() => setEditDialog({ open: false, comment: null })}>
              {t('comments.cancel')}
            </button>
            <button type="button" className="adm-btn adm-btn-primary" onClick={() => void handleEdit()}>
              {t('comments.saveEdit')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(o) => {
          if (!o) setDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('comments.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('comments.deleteDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('comments.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} variant="destructive">
              {t('comments.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
