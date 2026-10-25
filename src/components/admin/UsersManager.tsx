import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminUserRow } from '@koimsurai/api-types';
import { toast } from 'sonner';

import { adminUsersQueryOptions } from '@/data/adminData';
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
import { useAuth } from '@/contexts/auth';
import { jsonAuthHeaders } from '@/lib/authToken';
import { lookupOr } from '../../lib/tableLookup';
import AdminLoading from './AdminLoading';
import { PageHead } from './AdminPage';
import { formatWhen } from './adminFormat';

// 帳號（2026-10 後台提案的「站」，只有站長看得到）：用 OAuth 登入過的人，一人一列。
// 站長可以把讀者升成管理員、或降回讀者；站長自己與另一位站長不能在這裡改。

// 型別來源＝Rust struct（specta 生成）；原手寫 interface 已與 API 漂移（avatar vs avatar_url、id 型別）
type AdminUser = AdminUserRow;

const ROLE_LABEL: Record<string, string> = { OWNER: '站長', ADMIN: '管理員', USER: '讀者' };
const PROVIDER_LABEL: Record<string, string> = { google: 'Google', github: 'GitHub' };

const roleLabel = (role: string | null) => lookupOr(ROLE_LABEL, role ?? 'USER', role ?? '讀者');

export default function UsersManager() {
  const { user: currentUser, isOwner } = useAuth();
  const queryClient = useQueryClient();
  const { data: users = [], isPending } = useQuery(adminUsersQueryOptions);
  const [search, setSearch] = useState('');
  const [change, setChange] = useState<{ user: AdminUser; role: string } | null>(null);

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: adminUsersQueryOptions.queryKey });

  const handleRoleChange = async () => {
    if (!change) return;
    const { user: target, role } = change;
    try {
      const res = await fetch(`/api/admin/users/${target.id}/role`, {
        method: 'PUT',
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        toast.success(`已把 ${target.display_name ?? ''} 改成${roleLabel(role)}`);
        void invalidateUsers();
      } else {
        const data = (await res.json()) as { error?: string };
        toast.error(data.error ?? '更改角色失敗');
      }
    } catch {
      toast.error('更改角色失敗');
    } finally {
      setChange(null);
    }
  };

  const q = search.trim().toLowerCase();
  const shown = users.filter(
    (u) => !q || [u.display_name, u.email, u.provider].some((s) => (s ?? '').toLowerCase().includes(q)),
  );
  const countOf = (role: string) => users.filter((u) => (u.role ?? 'USER') === role).length;

  return (
    <div className="adm-page">
      <PageHead
        title="帳號"
        latin="Accounts"
        meta={isPending ? '載入中' : `站長 ${countOf('OWNER')} · 管理員 ${countOf('ADMIN')} · 讀者 ${countOf('USER')}`}
        actions={
          <button type="button" className="adm-btn" onClick={() => void invalidateUsers()} disabled={isPending}>
            重新整理
          </button>
        }
      />

      <section className="adm-stack" aria-label="帳號清單">
        <div className="adm-toolbar">
          <span className="adm-meta">登入過的人都在這裡；管理員能進後台，但不能改別人的角色</span>
          <label className="adm-prompt">
            <span className="adm-prompt-mark" aria-hidden="true">
              &gt;
            </span>
            <span className="sr-only">搜尋帳號</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="名字、Email、登入方式"
            />
          </label>
        </div>

        {isPending ? (
          <AdminLoading />
        ) : shown.length === 0 ? (
          <p className="adm-empty">{q ? '找不到符合的帳號。' : '還沒有人登入過。'}</p>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">名字</th>
                  <th scope="col">Email</th>
                  <th scope="col">登入方式</th>
                  <th scope="col">角色</th>
                  <th scope="col">加入</th>
                  {isOwner && (
                    <th scope="col">
                      <span className="sr-only">改角色</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {shown.map((u) => {
                  const isSelf =
                    currentUser !== null && (String(currentUser.id) === String(u.id) || currentUser.email === u.email);
                  const editable = isOwner && !isSelf && u.role !== 'OWNER';
                  return (
                    <tr key={u.id}>
                      <td className="adm-cell-title">
                        <span className="adm-user">
                          {u.avatar_url ? (
                            <img className="adm-avatar" src={u.avatar_url} alt="" />
                          ) : (
                            <span className="adm-avatar adm-avatar-empty" aria-hidden="true" />
                          )}
                          <span className="adm-cell-name">
                            {u.display_name ?? '—'}
                            {isSelf && <span className="adm-meta"> · 你</span>}
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="adm-meta">{u.email ?? '—'}</span>
                      </td>
                      <td>
                        <span className="adm-cell-text">
                          {lookupOr(PROVIDER_LABEL, u.provider ?? '', u.provider ?? '—')}
                        </span>
                      </td>
                      <td>
                        <span className="adm-status" data-status={u.role === 'USER' ? undefined : 'published'}>
                          {roleLabel(u.role)}
                        </span>
                      </td>
                      <td>
                        <span className="adm-meta">{formatWhen(u.created_at, 'yyyy.MM.dd') || '—'}</span>
                      </td>
                      {isOwner && (
                        <td>
                          {editable ? (
                            <label className="adm-prompt adm-prompt-compact">
                              <span className="sr-only">{u.display_name ?? '這位'}的角色</span>
                              <select
                                value={u.role ?? 'USER'}
                                onChange={(e) => {
                                  if (e.target.value !== u.role) setChange({ user: u, role: e.target.value });
                                }}
                              >
                                <option value="USER">讀者</option>
                                <option value="ADMIN">管理員</option>
                              </select>
                            </label>
                          ) : (
                            <span className="adm-meta">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AlertDialog
        open={change !== null}
        onOpenChange={(open) => {
          if (!open) setChange(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>更改角色？</AlertDialogTitle>
            <AlertDialogDescription>
              把 {change?.user.display_name} 從{roleLabel(change?.user.role ?? null)}改成
              {roleLabel(change?.role ?? null)}。{change?.role === 'ADMIN' ? '管理員進得了後台，能改文章與留言。' : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRoleChange()}>確認更改</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
