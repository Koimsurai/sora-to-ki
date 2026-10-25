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
import { jsonAuthHeaders } from '@/lib/authToken';
import AdminLoading from './AdminLoading';
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

const STATUS_LABEL: Record<Status, string> = {
  pending: '待審',
  approved: '已批准',
  spam: '垃圾',
  trash: '垃圾桶',
};

/** 動作做完的 toast：說「做了什麼」 */
const DONE: Record<Status, string> = {
  pending: '已退回待審',
  approved: '已批准',
  spam: '已標成垃圾',
  trash: '已丟進垃圾桶',
};

const PAGE_SIZE = 50;

/** 狀態名；後端回了這裡沒列到的值（或 null）就照原樣顯示 */
const statusLabel = (s: string | null) => (s ? ((STATUS_LABEL as Record<string, string | undefined>)[s] ?? s) : '');

/** 這則留言留在哪裡：手記、碎念，或兩者都不是的留言板 */
function placeOf(c: Comment): { label: string; href: string | null } {
  if (c.post_id)
    return { label: c.post_title ? `〈${c.post_title}〉` : `手記 #${c.post_id}`, href: `/blog/${c.post_id}` };
  if (c.thought_id) return { label: `碎念 #${c.thought_id}`, href: `/thinking/${c.thought_id}` };
  return { label: '留言板', href: '/messages' };
}

export default function CommentsManager() {
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
        toast.success(DONE[status]);
        void invalidateComments();
      } else {
        toast.error('操作失敗');
      }
    } catch {
      toast.error('操作失敗');
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
        toast.success('已回覆');
        setReplyText('');
        void invalidateComments();
      } else {
        toast.error('回覆失敗');
      }
    } catch {
      toast.error('回覆失敗');
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
        toast.success('已修改');
        setEditDialog({ open: false, comment: null });
        void invalidateComments();
      }
    } catch {
      toast.error('修改失敗');
    }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/admin/comments/${deleteId}`, { method: 'DELETE', headers: jsonAuthHeaders() });
      if (res.ok) {
        toast.success('已永久刪除');
        setDeleteId(null);
        void invalidateComments();
      }
    } catch {
      toast.error('刪除失敗');
    }
  };

  const blockIp = async (ip: string) => {
    try {
      const res = await fetch('/api/admin/blacklist', {
        method: 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ ip, reason: '來自留言管理封鎖' }),
      });
      if (res.ok) toast.success(`已封鎖 IP：${ip}`);
    } catch {
      toast.error('封鎖失敗');
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
        toast.success('已加入封鎖名單');
        setNewBlacklistIp('');
        setNewBlacklistReason('');
        void invalidateBlacklist();
      }
    } catch {
      toast.error('操作失敗');
    }
  };

  const removeBlacklist = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/blacklist/${id}`, { method: 'DELETE', headers: jsonAuthHeaders() });
      if (res.ok) {
        toast.success('已移除');
        void invalidateBlacklist();
      }
    } catch {
      toast.error('操作失敗');
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
        toast.success('已新增過濾詞');
        setNewKeyword('');
        void invalidateKeywords();
      }
    } catch {
      toast.error('操作失敗');
    }
  };

  const removeKeyword = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/keyword-filters/${id}`, { method: 'DELETE', headers: jsonAuthHeaders() });
      if (res.ok) {
        toast.success('已移除');
        void invalidateKeywords();
      }
    } catch {
      toast.error('操作失敗');
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
    { key: 'pending', label: STATUS_LABEL.pending, count: counts.pending },
    { key: 'approved', label: STATUS_LABEL.approved, count: counts.approved },
    { key: 'spam', label: STATUS_LABEL.spam, count: counts.spam },
    { key: 'trash', label: STATUS_LABEL.trash, count: counts.trash },
    { key: 'all', label: '全部', count: totalAll },
    { key: 'blacklist', label: '封鎖名單' },
    { key: 'keywords', label: '關鍵字' },
  ];

  return (
    <div className="adm-page">
      <PageHead
        title="留言"
        latin="Signals"
        meta={commentsData ? `待審 ${counts.pending} · 全部 ${totalAll}` : '載入中'}
      />

      <section className="adm-stack" aria-label="留言審核">
        <div className="adm-toolbar">
          <div className="adm-tabs">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                className="adm-tab"
                aria-pressed={view === t.key}
                onClick={() => switchView(t.key)}
              >
                <span className="adm-tab-dot" aria-hidden="true" />
                {t.label}
                {t.count !== undefined && <span className="adm-meta">{t.count}</span>}
              </button>
            ))}
          </div>
          {isList && (
            <label className="adm-prompt">
              <span className="adm-prompt-mark" aria-hidden="true">
                &gt;
              </span>
              <span className="sr-only">搜尋留言</span>
              <input
                type="text"
                placeholder="內容、名字、信箱"
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
                {searchQuery ? '找不到符合的留言。' : `${statusLabel(view === 'all' ? null : view)}沒有留言。`}
              </p>
            ) : (
              <div className="adm-review">
                <ul className="adm-review-list" aria-label="留言">
                  {comments.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="adm-review-item"
                        aria-pressed={selected?.id === c.id}
                        aria-label={`${c.author}：${c.content}`}
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
                  <section className="adm-review-detail" aria-label="這則留言">
                    <div className="adm-review-head">
                      <div className="adm-head-text">
                        <span className="adm-review-name">
                          {selected.author}
                          {selected.is_admin ? <span className="adm-meta"> · 站長</span> : null}
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
                          在{placeOf(selected).label}裡開 ↗
                        </a>
                      )}
                    </div>

                    {selected.parent_id ? <p className="adm-meta">這是一則回覆（回覆 #{selected.parent_id}）</p> : null}
                    <p className="adm-review-body">{selected.content}</p>

                    <div className="adm-review-actions">
                      {selected.status !== 'approved' && (
                        <button
                          type="button"
                          className="adm-btn adm-btn-primary"
                          onClick={() => void updateStatus(selected.id, 'approved')}
                        >
                          批准 <kbd>A</kbd>
                        </button>
                      )}
                      {selected.status !== 'spam' && (
                        <button
                          type="button"
                          className="adm-btn"
                          onClick={() => void updateStatus(selected.id, 'spam')}
                        >
                          標成垃圾 <kbd>S</kbd>
                        </button>
                      )}
                      {selected.status !== 'trash' && (
                        <button
                          type="button"
                          className="adm-btn"
                          onClick={() => void updateStatus(selected.id, 'trash')}
                        >
                          丟進垃圾桶
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
                        編輯
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
                          封鎖這個 IP
                        </button>
                      )}
                      {selected.status === 'trash' && (
                        <button
                          type="button"
                          className="adm-icon-btn adm-icon-btn-flare"
                          onClick={() => setDeleteId(selected.id)}
                        >
                          永久刪除…
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
                        以站長身分回覆 · R
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
                          placeholder="寫點什麼；回覆會帶著站長的標記"
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
                        <span className="adm-meta">j k 上下 · a 批准 · s 垃圾 · r 回覆</span>
                        <button type="submit" className="adm-btn" disabled={!replyText.trim()}>
                          送出回覆 ⌘↵
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
                ← 上一頁
              </button>
              <span className="adm-meta">
                第 {page} 頁 · 共 {total} 則
              </span>
              <button
                type="button"
                className="adm-btn adm-btn-small"
                disabled={comments.length < PAGE_SIZE}
                onClick={() => setPage((p) => p + 1)}
              >
                下一頁 →
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
                  <span className="sr-only">IP 位址</span>
                  <input
                    placeholder="IP 位址"
                    value={newBlacklistIp}
                    onChange={(e) => setNewBlacklistIp(e.target.value)}
                  />
                </label>
                <label className="adm-prompt adm-grow">
                  <span className="sr-only">原因</span>
                  <input
                    placeholder="原因（選填）"
                    value={newBlacklistReason}
                    onChange={(e) => setNewBlacklistReason(e.target.value)}
                  />
                </label>
                <button type="submit" className="adm-btn">
                  封鎖
                </button>
              </form>
              {blacklist.length === 0 ? (
                <p className="adm-empty">封鎖名單是空的。</p>
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
                        aria-label={`解除封鎖 ${b.ip}`}
                        onClick={() => void removeBlacklist(b.id)}
                      >
                        解除
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
                  <span className="sr-only">關鍵字</span>
                  <input placeholder="關鍵字" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} />
                </label>
                <label className="adm-prompt">
                  <span className="sr-only">碰到時怎麼辦</span>
                  <select value={newKeywordAction} onChange={(e) => setNewKeywordAction(e.target.value)}>
                    <option value="spam">標成垃圾</option>
                    <option value="reject">直接拒絕</option>
                  </select>
                </label>
                <button type="submit" className="adm-btn">
                  新增
                </button>
              </form>
              {keywordFilters.length === 0 ? (
                <p className="adm-empty">還沒有過濾的關鍵字。</p>
              ) : (
                <ul className="adm-chips">
                  {keywordFilters.map((f) => (
                    <li key={f.id} className="adm-chip">
                      {f.keyword}
                      <span className="adm-meta">{f.action === 'reject' ? '拒絕' : '垃圾'}</span>
                      <button
                        type="button"
                        className="adm-chip-x"
                        aria-label={`拿掉 ${f.keyword}`}
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
            <DialogTitle>編輯留言</DialogTitle>
            <DialogDescription>修改之後讀者看到的就是新的版本。</DialogDescription>
          </DialogHeader>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            aria-label="留言內容"
            className="adm-dialog-textarea"
          />
          <DialogFooter>
            <button type="button" className="adm-btn" onClick={() => setEditDialog({ open: false, comment: null })}>
              取消
            </button>
            <button type="button" className="adm-btn adm-btn-primary" onClick={() => void handleEdit()}>
              儲存修改
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
            <AlertDialogTitle>永久刪除留言？</AlertDialogTitle>
            <AlertDialogDescription>刪掉就拿不回來，留言會從資料庫裡完全移除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} variant="destructive">
              永久刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
