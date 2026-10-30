import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminPostFull } from '@koimsurai/api-types';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { toast } from 'sonner';

import { adminPostsQueryOptions } from '@/data/adminData';
import { authHeaders } from '@/lib/authToken';
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
import { postPath } from '../../lib/postPath';
import AdminLoading from './AdminLoading';
import { LocaleDots, PageHead, TabPanel } from './AdminPage';
import { TRASH_KEEP_DAYS, formatWhen, missingTranslations, statusLabel, trashDaysLeft } from './adminFormat';

// 手記列表（2026-10 後台提案）：狀態用分頁切、可以只看缺譯文的，每篇後面五顆語系點。
// 篩選放在網址上（routes/admin/posts/index.tsx 的 validateSearch），總覽的「等你處理」直接連得進來。
//
// 讀網址用非嚴格的 useSearch、寫回去時直接指定 /admin/posts，而不是 getRouteApi('/admin/posts/')：
// 後者在元件不是掛在那條路由底下時會丟「Could not find an active match」——
// render-smoke.test 就是單獨掛它的，這樣元件也不綁死在某一條路由上。
// 值本身的驗證在路由的 validateSearch，這裡只挑出認得的幾種。
//
// 刪除是丟進回收桶（30 天後自動清掉），所以不先問；提示裡有「還原」。
// 永久刪除只在回收分頁裡，那裡才問一次。

const STATUSES = ['published', 'draft', 'scheduled', 'trashed'] as const;
type PostsStatus = (typeof STATUSES)[number];

function readFilters(search: { status?: unknown; missing?: unknown }): PostsSearch {
  return {
    status: STATUSES.find((s) => s === search.status),
    missing: search.missing === true ? true : undefined,
  };
}

interface PostsSearch {
  status?: PostsStatus;
  missing?: boolean;
}

/** 跟總覽同一個查詢鍵，兩頁共用快取。後端的「全部」不含回收桶 */
const ALL_POSTS = 'limit=500';
const TRASHED_POSTS = 'status=trashed&limit=500';

const TABS = [
  { key: undefined, label: '全部' },
  { key: 'published', label: '已發佈' },
  { key: 'draft', label: '草稿' },
  { key: 'scheduled', label: '排程' },
  { key: 'trashed', label: '回收' },
] as const;

const touched = (p: AdminPostFull) => p.updated_at ?? p.created_at;

function matches(post: AdminPostFull, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [post.title, post.category ?? '', ...post.tags].some((s) => s.toLowerCase().includes(needle));
}

export default function PostsList() {
  const queryClient = useQueryClient();
  const { status, missing } = readFilters(useSearch({ strict: false }));
  const navigate = useNavigate();
  const setFilters = (next: PostsSearch) => void navigate({ to: '/admin/posts', search: next });
  const { data, isPending } = useQuery(adminPostsQueryOptions(ALL_POSTS));
  const { data: trashedData } = useQuery(adminPostsQueryOptions(TRASHED_POSTS));
  const posts: AdminPostFull[] = data?.posts ?? [];
  const trashed: AdminPostFull[] = trashedData?.posts ?? [];
  const [purgeTarget, setPurgeTarget] = useState<AdminPostFull | null>(null);
  const [search, setSearch] = useState('');
  // 「還剩幾天」算一次就好；render 裡直接 new Date() 每次重畫都會變
  const [now] = useState(() => new Date());

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'posts'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
  };

  const send = async (path: string, method: 'POST' | 'DELETE') => {
    const res = await fetch(path, { method, headers: authHeaders() });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `${res.status}`);
    }
  };

  const restore = async (post: AdminPostFull) => {
    try {
      await send(`/api/admin/posts/${post.id}/restore`, 'POST');
      toast.success(`〈${post.title}〉已還原`);
      refresh();
    } catch (e) {
      toast.error(`還原失敗：${e instanceof Error ? e.message : ''}`);
    }
  };

  const moveToTrash = async (post: AdminPostFull) => {
    try {
      await send(`/api/admin/posts/${post.id}`, 'DELETE');
      toast(`〈${post.title}〉丟進回收桶了`, {
        description: `${TRASH_KEEP_DAYS} 天後自動清掉`,
        action: { label: '還原', onClick: () => void restore(post) },
      });
      refresh();
    } catch (e) {
      toast.error(`刪除失敗：${e instanceof Error ? e.message : ''}`);
    }
  };

  const purge = async () => {
    if (!purgeTarget) return;
    try {
      await send(`/api/admin/posts/${purgeTarget.id}?permanent=true`, 'DELETE');
      toast.success('已永久刪除');
      refresh();
    } catch (e) {
      toast.error(`刪除失敗：${e instanceof Error ? e.message : ''}`);
    } finally {
      setPurgeTarget(null);
    }
  };

  const countOf = (key: PostsStatus | undefined) => {
    if (key === 'trashed') return trashed.length;
    return key ? posts.filter((p) => p.status === key).length : posts.length;
  };
  const source = status === 'trashed' ? trashed : posts;
  const filtered = source
    .filter((p) => !status || p.status === status)
    .filter((p) => !missing || (p.status === 'published' && missingTranslations(p).length > 0))
    .filter((p) => matches(p, search.trim()));
  const scheduledCount = countOf('scheduled');

  /** 時間欄：排程的是預定發佈的時間、回收的是還剩幾天、其他是最後更新 */
  const whenOf = (post: AdminPostFull) => {
    if (post.status === 'scheduled') return `${formatWhen(post.publish_at, 'MM.dd HH:mm')} 發佈`;
    if (post.status === 'trashed') return `還剩 ${trashDaysLeft(post.trashed_at, now)} 天`;
    return formatWhen(touched(post), 'yyyy.MM.dd');
  };

  return (
    <div className="adm-page">
      <PageHead
        title="手記"
        latin="Notes"
        meta={
          isPending
            ? '載入中'
            : `${posts.length} 篇 · 草稿 ${countOf('draft')}${scheduledCount ? ` · 排程 ${scheduledCount}` : ''}`
        }
        actions={
          <Link to="/admin/posts/create" className="adm-btn adm-btn-primary">
            新寫一篇
          </Link>
        }
      />

      <section className="adm-stack" aria-label="手記清單">
        <div className="adm-toolbar">
          <div className="adm-tabs">
            {TABS.map((t) => (
              <button
                key={t.label}
                type="button"
                className="adm-tab"
                aria-pressed={status === t.key}
                onClick={() => setFilters({ status: t.key, missing })}
              >
                <span className="adm-tab-dot" aria-hidden="true" />
                {t.label}
                <span className="adm-meta">{isPending ? '' : countOf(t.key)}</span>
              </button>
            ))}
            <button
              type="button"
              className="adm-tab"
              aria-pressed={missing === true}
              onClick={() => setFilters({ status, missing: missing ? undefined : true })}
            >
              <span className="adm-tab-dot" aria-hidden="true" />
              缺譯文
            </button>
          </div>
          <label className="adm-prompt">
            <span className="adm-prompt-mark" aria-hidden="true">
              &gt;
            </span>
            <span className="sr-only">搜尋手記</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="標題、分類、標籤"
            />
          </label>
        </div>

        <TabPanel tab={`${status ?? 'all'}:${missing ? 'missing' : ''}`}>
          {status === 'trashed' && (
            <p className="adm-form-note">丟進回收的手記讀者看不到，放滿 {TRASH_KEEP_DAYS} 天會自動清掉。</p>
          )}

          {isPending ? (
            <AdminLoading />
          ) : filtered.length === 0 ? (
            <div className="adm-empty">
              {status === 'trashed' ? (
                '回收桶是空的。'
              ) : posts.length === 0 ? (
                <>
                  還沒有手記。<Link to="/admin/posts/create">寫第一篇 →</Link>
                </>
              ) : (
                '沒有符合的手記。'
              )}
            </div>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">標題</th>
                    <th scope="col">分類</th>
                    <th scope="col">語系</th>
                    <th scope="col">狀態</th>
                    <th scope="col">時間</th>
                    <th scope="col">
                      <span className="sr-only">動作</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((post) => (
                    <tr key={post.id} data-status={post.status}>
                      <td className="adm-cell-title">
                        {post.status === 'trashed' ? (
                          <span className="adm-title-link">{post.title}</span>
                        ) : (
                          <Link to="/admin/posts/edit/$id" params={{ id: String(post.id) }} className="adm-title-link">
                            {post.title}
                          </Link>
                        )}
                        {post.tags.length > 0 && (
                          <span className="adm-meta adm-tags">{post.tags.map((tag) => `#${tag}`).join(' ')}</span>
                        )}
                      </td>
                      <td>
                        <span className="adm-cell-text">{post.category ?? '未分類'}</span>
                      </td>
                      <td>
                        <LocaleDots post={post} />
                      </td>
                      <td>
                        <span className="adm-status" data-status={post.status}>
                          {statusLabel(post.status)}
                        </span>
                      </td>
                      <td>
                        <span className="adm-meta">{whenOf(post)}</span>
                      </td>
                      <td>
                        {post.status === 'trashed' ? (
                          <div className="adm-row-actions">
                            <button
                              type="button"
                              className="adm-icon-btn"
                              aria-label={`還原〈${post.title}〉`}
                              onClick={() => void restore(post)}
                            >
                              還原
                            </button>
                            <button
                              type="button"
                              className="adm-icon-btn adm-icon-btn-flare"
                              aria-label={`永久刪除〈${post.title}〉`}
                              onClick={() => setPurgeTarget(post)}
                            >
                              永久刪除
                            </button>
                          </div>
                        ) : (
                          <div className="adm-row-actions">
                            <Link
                              to="/admin/posts/edit/$id"
                              params={{ id: String(post.id) }}
                              className="adm-icon-btn"
                              aria-label={`編輯〈${post.title}〉`}
                            >
                              編輯
                            </Link>
                            {post.status === 'published' && (
                              <Link
                                to={postPath(post)}
                                target="_blank"
                                className="adm-icon-btn"
                                aria-label={`在前台開〈${post.title}〉`}
                              >
                                ↗
                              </Link>
                            )}
                            <button
                              type="button"
                              className="adm-icon-btn adm-icon-btn-flare"
                              aria-label={`刪除〈${post.title}〉`}
                              onClick={() => void moveToTrash(post)}
                            >
                              刪除
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

          {!isPending && (
            <p className="adm-meta">
              顯示 {filtered.length} / {source.length} 篇
            </p>
          )}
        </TabPanel>
      </section>

      <AlertDialog open={!!purgeTarget} onOpenChange={() => setPurgeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>永久刪除〈{purgeTarget?.title}〉？</AlertDialogTitle>
            <AlertDialogDescription>刪了就找不回來，連同它的標籤關聯。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>留著</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void purge();
              }}
              variant="destructive"
            >
              永久刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
