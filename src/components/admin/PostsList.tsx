import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminPostFull } from '@koimsurai/api-types';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { toast } from 'sonner';

import { adminPostsQueryOptions } from '@/data/adminData';
import { useAdminT } from '@/i18n/admin-i18n';
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

/** label 是語系檔的 key */
const TABS = [
  { key: undefined, label: 'posts.tabAll' },
  { key: 'published', label: 'common.status.published' },
  { key: 'draft', label: 'common.status.draft' },
  { key: 'scheduled', label: 'common.status.scheduled' },
  { key: 'trashed', label: 'common.status.trashed' },
] as const;

const touched = (p: AdminPostFull) => p.updated_at ?? p.created_at;

function matches(post: AdminPostFull, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [post.title, post.category ?? '', ...post.tags].some((s) => s.toLowerCase().includes(needle));
}

export default function PostsList() {
  const { t } = useAdminT();
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
      toast.success(t('posts.restored', { title: post.title }));
      refresh();
    } catch (e) {
      toast.error(t('posts.restoreFailed', { message: e instanceof Error ? e.message : '' }));
    }
  };

  const moveToTrash = async (post: AdminPostFull) => {
    try {
      await send(`/api/admin/posts/${post.id}`, 'DELETE');
      toast(t('posts.trashedToast', { title: post.title }), {
        description: t('posts.trashedDesc', { days: TRASH_KEEP_DAYS }),
        action: { label: t('posts.restore'), onClick: () => void restore(post) },
      });
      refresh();
    } catch (e) {
      toast.error(t('posts.deleteFailed', { message: e instanceof Error ? e.message : '' }));
    }
  };

  const purge = async () => {
    if (!purgeTarget) return;
    try {
      await send(`/api/admin/posts/${purgeTarget.id}?permanent=true`, 'DELETE');
      toast.success(t('posts.purged'));
      refresh();
    } catch (e) {
      toast.error(t('posts.deleteFailed', { message: e instanceof Error ? e.message : '' }));
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
    if (post.status === 'scheduled')
      return t('posts.whenScheduled', { when: formatWhen(post.publish_at, 'MM.dd HH:mm') });
    if (post.status === 'trashed') return t('posts.whenTrashed', { days: trashDaysLeft(post.trashed_at, now) });
    return formatWhen(touched(post), 'yyyy.MM.dd');
  };

  return (
    <div className="adm-page">
      <PageHead
        title={t('nav.posts')}
        latin="Notes"
        meta={
          isPending
            ? t('common.loading')
            : t('posts.meta', { total: posts.length, drafts: countOf('draft') }) +
              (scheduledCount ? t('posts.metaScheduled', { n: scheduledCount }) : '')
        }
        actions={
          <Link to="/admin/posts/create" className="adm-btn adm-btn-primary">
            {t('posts.newPost')}
          </Link>
        }
      />

      <section className="adm-stack" aria-label={t('posts.listLabel')}>
        <div className="adm-toolbar">
          <div className="adm-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.label}
                type="button"
                className="adm-tab"
                aria-pressed={status === tab.key}
                onClick={() => setFilters({ status: tab.key, missing })}
              >
                <span className="adm-tab-dot" aria-hidden="true" />
                {t(tab.label)}
                <span className="adm-meta">{isPending ? '' : countOf(tab.key)}</span>
              </button>
            ))}
            <button
              type="button"
              className="adm-tab"
              aria-pressed={missing === true}
              onClick={() => setFilters({ status, missing: missing ? undefined : true })}
            >
              <span className="adm-tab-dot" aria-hidden="true" />
              {t('posts.missing')}
            </button>
          </div>
          <label className="adm-prompt">
            <span className="adm-prompt-mark" aria-hidden="true">
              &gt;
            </span>
            <span className="sr-only">{t('posts.searchLabel')}</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('posts.searchPlaceholder')}
            />
          </label>
        </div>

        <TabPanel tab={`${status ?? 'all'}:${missing ? 'missing' : ''}`}>
          {status === 'trashed' && <p className="adm-form-note">{t('posts.trashNote', { days: TRASH_KEEP_DAYS })}</p>}

          {isPending ? (
            <AdminLoading />
          ) : filtered.length === 0 ? (
            <div className="adm-empty">
              {status === 'trashed' ? (
                t('posts.emptyTrash')
              ) : posts.length === 0 ? (
                <>
                  {t('posts.noPosts')}
                  <Link to="/admin/posts/create">{t('posts.writeFirst')}</Link>
                </>
              ) : (
                t('posts.noMatch')
              )}
            </div>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">{t('posts.col.title')}</th>
                    <th scope="col">{t('posts.col.category')}</th>
                    <th scope="col">{t('posts.col.locales')}</th>
                    <th scope="col">{t('posts.col.status')}</th>
                    <th scope="col">{t('posts.col.when')}</th>
                    <th scope="col">
                      <span className="sr-only">{t('posts.col.actions')}</span>
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
                        <span className="adm-cell-text">{post.category ?? t('posts.uncategorized')}</span>
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
                              aria-label={t('posts.restoreAria', { title: post.title })}
                              onClick={() => void restore(post)}
                            >
                              {t('posts.restore')}
                            </button>
                            <button
                              type="button"
                              className="adm-icon-btn adm-icon-btn-flare"
                              aria-label={t('posts.purgeAria', { title: post.title })}
                              onClick={() => setPurgeTarget(post)}
                            >
                              {t('posts.purge')}
                            </button>
                          </div>
                        ) : (
                          <div className="adm-row-actions">
                            <Link
                              to="/admin/posts/edit/$id"
                              params={{ id: String(post.id) }}
                              className="adm-icon-btn"
                              aria-label={t('posts.editAria', { title: post.title })}
                            >
                              {t('posts.edit')}
                            </Link>
                            {post.status === 'published' && (
                              <Link
                                to={postPath(post)}
                                target="_blank"
                                className="adm-icon-btn"
                                aria-label={t('posts.openAria', { title: post.title })}
                              >
                                ↗
                              </Link>
                            )}
                            <button
                              type="button"
                              className="adm-icon-btn adm-icon-btn-flare"
                              aria-label={t('posts.deleteAria', { title: post.title })}
                              onClick={() => void moveToTrash(post)}
                            >
                              {t('common.delete')}
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
            <p className="adm-meta">{t('posts.shown', { shown: filtered.length, total: source.length })}</p>
          )}
        </TabPanel>
      </section>

      <AlertDialog open={!!purgeTarget} onOpenChange={() => setPurgeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('posts.purgeTitle', { title: purgeTarget?.title ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>{t('posts.purgeBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('posts.keep')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void purge();
              }}
              variant="destructive"
            >
              {t('posts.purge')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
