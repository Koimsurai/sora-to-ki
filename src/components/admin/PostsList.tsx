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
import { LocaleDots, PageHead } from './AdminPage';
import { STATUS_LABEL, formatWhen, missingTranslations } from './adminFormat';

// 手記列表（2026-10 後台提案）：狀態用分頁切、可以只看缺譯文的，每篇後面五顆語系點。
// 篩選放在網址上（routes/admin/posts/index.tsx 的 validateSearch），總覽的「等你處理」直接連得進來。
//
// 讀網址用非嚴格的 useSearch、寫回去時直接指定 /admin/posts，而不是 getRouteApi('/admin/posts/')：
// 後者在元件不是掛在那條路由底下時會丟「Could not find an active match」——
// render-smoke.test 就是單獨掛它的，這樣元件也不綁死在某一條路由上。
// 值本身的驗證在路由的 validateSearch，這裡只挑出認得的兩種。
function readFilters(search: { status?: unknown; missing?: unknown }): PostsSearch {
  return {
    status: search.status === 'published' || search.status === 'draft' ? search.status : undefined,
    missing: search.missing === true ? true : undefined,
  };
}

interface PostsSearch {
  status?: 'published' | 'draft';
  missing?: boolean;
}

/** 跟總覽同一個查詢鍵，兩頁共用快取 */
const ALL_POSTS = 'limit=500';

const TABS = [
  { key: undefined, label: '全部' },
  { key: 'published', label: '已發佈' },
  { key: 'draft', label: '草稿' },
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
  const posts: AdminPostFull[] = data?.posts ?? [];
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const response = await fetch(`/api/admin/posts/${deleteId}`, { method: 'DELETE', headers: authHeaders() });
      if (response.ok) {
        toast.success('文章已刪除');
        void queryClient.invalidateQueries({ queryKey: ['admin', 'posts'] });
      } else {
        toast.error('刪除失敗');
      }
    } catch (error) {
      console.error('刪除文章失敗:', error);
      toast.error('刪除失敗');
    } finally {
      setDeleteId(null);
    }
  };

  const countOf = (key: (typeof TABS)[number]['key']) =>
    key ? posts.filter((p) => p.status === key).length : posts.length;
  const filtered = posts
    .filter((p) => !status || p.status === status)
    .filter((p) => !missing || (p.status === 'published' && missingTranslations(p).length > 0))
    .filter((p) => matches(p, search.trim()));
  const drafts = countOf('draft');

  return (
    <div className="adm-page">
      <PageHead
        title="手記"
        latin="Notes"
        meta={isPending ? '載入中' : `${posts.length} 篇 · 草稿 ${drafts}`}
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

        {isPending ? (
          <p className="adm-empty">載入中……</p>
        ) : filtered.length === 0 ? (
          <div className="adm-empty">
            {posts.length === 0 ? (
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
                  <th scope="col">更新</th>
                  <th scope="col">
                    <span className="sr-only">動作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((post) => (
                  <tr key={post.id}>
                    <td className="adm-cell-title">
                      <Link to="/admin/posts/edit/$id" params={{ id: String(post.id) }} className="adm-title-link">
                        {post.title}
                      </Link>
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
                        {STATUS_LABEL[post.status] ?? post.status}
                      </span>
                    </td>
                    <td>
                      <span className="adm-meta">{formatWhen(touched(post), 'yyyy.MM.dd')}</span>
                    </td>
                    <td>
                      <div className="adm-row-actions">
                        <Link
                          to="/admin/posts/edit/$id"
                          params={{ id: String(post.id) }}
                          className="adm-icon-btn"
                          aria-label={`編輯〈${post.title}〉`}
                        >
                          編輯
                        </Link>
                        <Link
                          to={postPath(post)}
                          target="_blank"
                          className="adm-icon-btn"
                          aria-label={`在前台開〈${post.title}〉`}
                        >
                          ↗
                        </Link>
                        <button
                          type="button"
                          className="adm-icon-btn adm-icon-btn-flare"
                          aria-label={`刪除〈${post.title}〉`}
                          onClick={() => setDeleteId(post.id)}
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!isPending && (
          <p className="adm-meta">
            顯示 {filtered.length} / {posts.length} 篇
          </p>
        )}
      </section>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定要刪除這篇文章嗎？</AlertDialogTitle>
            <AlertDialogDescription>此操作無法復原。文章將被永久刪除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void handleDelete();
              }}
              variant="destructive"
            >
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
