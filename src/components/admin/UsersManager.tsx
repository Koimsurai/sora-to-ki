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
import { at, useAdminT } from '@/i18n/admin-i18n';
import { apiErrorText } from '@/lib/apiError';
import { jsonAuthHeaders } from '@/lib/authToken';
import { lookup, lookupOr } from '../../lib/tableLookup';
import AdminLoading from './AdminLoading';
import { AdminSelect } from './AdminFields';
import { PageHead } from './AdminPage';
import { formatWhen } from './adminFormat';

// 帳號（2026-10 後台提案的「站」，只有站長看得到）：用 OAuth 登入過的人，一人一列。
// 站長可以把讀者升成管理員、或降回讀者；站長自己與另一位站長不能在這裡改。

// 型別來源＝Rust struct（specta 生成）；原手寫 interface 已與 API 漂移（avatar vs avatar_url、id 型別）
type AdminUser = AdminUserRow;

/** 後端的角色值 → users.role 底下的 key */
const ROLE_KEY: Record<string, string> = { OWNER: 'owner', ADMIN: 'admin', USER: 'reader' };
const PROVIDER_LABEL: Record<string, string> = { google: 'Google', github: 'GitHub' };

const roleLabel = (role: string | null) => {
  const key = lookup(ROLE_KEY, role ?? 'USER');
  return key ? at(`users.role.${key}`) : (role ?? at('users.role.reader'));
};

export default function UsersManager() {
  const { t } = useAdminT();
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
        toast.success(t('users.roleChanged', { name: target.display_name ?? '', role: roleLabel(role) }));
        void invalidateUsers();
      } else {
        const data: unknown = await res.json().catch(() => ({}));
        toast.error(apiErrorText(data, at, 'errors', t('users.roleChangeFailed')));
      }
    } catch {
      toast.error(t('users.roleChangeFailed'));
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
    <div className="adm-page adm-page-narrow">
      <PageHead
        title={t('nav.users')}
        latin="Accounts"
        meta={
          isPending
            ? t('common.loading')
            : t('users.meta', { owner: countOf('OWNER'), admin: countOf('ADMIN'), reader: countOf('USER') })
        }
        actions={
          <button type="button" className="adm-btn" onClick={() => void invalidateUsers()} disabled={isPending}>
            {t('users.refresh')}
          </button>
        }
      />

      <section className="adm-stack" aria-label={t('users.listLabel')}>
        <div className="adm-toolbar">
          <span className="adm-meta">{t('users.hint')}</span>
          <label className="adm-prompt">
            <span className="adm-prompt-mark" aria-hidden="true">
              &gt;
            </span>
            <span className="sr-only">{t('users.searchLabel')}</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('users.searchPlaceholder')}
            />
          </label>
        </div>

        {isPending ? (
          <AdminLoading />
        ) : shown.length === 0 ? (
          <p className="adm-empty">{q ? t('users.noMatch') : t('users.empty')}</p>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">{t('users.col.name')}</th>
                  <th scope="col">{t('users.col.email')}</th>
                  <th scope="col">{t('users.col.provider')}</th>
                  <th scope="col">{t('users.col.role')}</th>
                  <th scope="col">{t('users.col.joined')}</th>
                  {isOwner && (
                    <th scope="col">
                      <span className="sr-only">{t('users.col.changeRole')}</span>
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
                            {isSelf && <span className="adm-meta"> · {t('users.you')}</span>}
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
                            <div className="adm-prompt adm-prompt-compact">
                              <AdminSelect
                                label={t('users.roleSelectLabel', { name: u.display_name ?? t('users.someone') })}
                                value={u.role ?? 'USER'}
                                onChange={(role) => {
                                  if (role !== u.role) setChange({ user: u, role });
                                }}
                                options={[
                                  { value: 'USER', label: t('users.role.reader') },
                                  { value: 'ADMIN', label: t('users.role.admin') },
                                ]}
                              />
                            </div>
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
            <AlertDialogTitle>{t('users.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(change?.role === 'ADMIN' ? 'users.confirmDescAdmin' : 'users.confirmDesc', {
                name: change?.user.display_name ?? '',
                from: roleLabel(change?.user.role ?? null),
                to: roleLabel(change?.role ?? null),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('users.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRoleChange()}>{t('users.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
