import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminTagRow } from '@koimsurai/api-types';
import { toast } from 'sonner';

import { adminTagsQueryOptions } from '@/data/adminData';
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
import { authHeaders, jsonAuthHeaders } from '@/lib/authToken';
import { useAdminT } from '@/i18n/admin-i18n';
import AdminLoading from './AdminLoading';
import { NameDots, PageHead } from './AdminPage';
import { localeNameFields } from './adminFormat';

// 標籤（2026-10 後台提案）：一張表，照用量排；每個標籤後面五顆語系點，看各語系的譯名填了沒。
// 舊表單的「URL 別名」「顏色」兩欄後端根本不存（create_tag 只寫名稱與譯名、列表也不回傳），拿掉了。

interface TagForm {
  name: string;
  // 顯示用譯名（name 仍是資料鍵：文章的標籤關聯與前台篩選都比對它）
  name_en: string;
  name_ja: string;
  name_ko: string;
  name_zh_cn: string;
  name_zh_tw: string;
}

const EMPTY: TagForm = { name: '', name_en: '', name_ja: '', name_ko: '', name_zh_cn: '', name_zh_tw: '' };

export default function TagsManager() {
  const { t } = useAdminT();
  const queryClient = useQueryClient();
  const { data: tags = [], isPending } = useQuery(adminTagsQueryOptions);
  const invalidateTags = () => queryClient.invalidateQueries({ queryKey: adminTagsQueryOptions.queryKey });
  const [editing, setEditing] = useState<AdminTagRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<TagForm>(EMPTY);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const shown = tags
    .filter(
      (tg) =>
        !q ||
        [tg.name, tg.name_en, tg.name_ja, tg.name_ko, tg.name_zh_cn, tg.name_zh_tw].some((s) =>
          s?.toLowerCase().includes(q),
        ),
    )
    .sort((a, b) => b.post_count - a.post_count);
  const unused = tags.filter((tg) => tg.post_count === 0).length;

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setDialogOpen(true);
  };

  const openEdit = (tag: AdminTagRow) => {
    setEditing(tag);
    setForm({
      name: tag.name,
      name_en: tag.name_en ?? '',
      name_ja: tag.name_ja ?? '',
      name_ko: tag.name_ko ?? '',
      name_zh_cn: tag.name_zh_cn ?? '',
      name_zh_tw: tag.name_zh_tw ?? '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const response = await fetch(editing ? `/api/admin/tags/${editing.id}` : '/api/admin/tags', {
        method: editing ? 'PUT' : 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify(form),
      });
      if (response.ok) {
        toast.success(editing ? t('taxonomy.tags.updated') : t('taxonomy.tags.created'));
        setDialogOpen(false);
        void invalidateTags();
      } else {
        toast.error(t('taxonomy.actionFailed'));
      }
    } catch (error) {
      console.error('保存標籤失敗:', error); // i18n-ignore：開發者看的 console，不是介面文字
      toast.error(t('taxonomy.saveFailed'));
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const response = await fetch(`/api/admin/tags/${deleteId}`, { method: 'DELETE', headers: authHeaders() });
      if (response.ok) {
        toast.success(t('taxonomy.tags.deleted'));
        void invalidateTags();
      } else {
        toast.error(t('taxonomy.deleteFailed'));
      }
    } catch (error) {
      console.error('刪除標籤失敗:', error); // i18n-ignore：開發者看的 console，不是介面文字
      toast.error(t('taxonomy.deleteFailed'));
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="adm-page adm-page-narrow">
      <PageHead
        title={t('nav.tags')}
        latin="Tags"
        meta={isPending ? t('common.loading') : t('taxonomy.tags.meta', { count: tags.length, unused })}
        actions={
          <button type="button" className="adm-btn adm-btn-primary" onClick={openCreate}>
            {t('taxonomy.tags.add')}
          </button>
        }
      />

      <section className="adm-stack" aria-label={t('taxonomy.tags.listLabel')}>
        <div className="adm-toolbar">
          <span className="adm-meta">{t('taxonomy.tags.hint')}</span>
          <label className="adm-prompt">
            <span className="adm-prompt-mark" aria-hidden="true">
              &gt;
            </span>
            <span className="sr-only">{t('taxonomy.tags.search')}</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('taxonomy.tags.searchPlaceholder')}
            />
          </label>
        </div>

        {isPending ? (
          <AdminLoading />
        ) : shown.length === 0 ? (
          <p className="adm-empty">{tags.length === 0 ? t('taxonomy.tags.empty') : t('taxonomy.tags.noMatch')}</p>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">{t('taxonomy.col.name')}</th>
                  <th scope="col">{t('taxonomy.col.translations')}</th>
                  <th scope="col">{t('taxonomy.col.posts')}</th>
                  <th scope="col">
                    <span className="sr-only">{t('taxonomy.col.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((tag) => (
                  <tr key={tag.id}>
                    <td className="adm-cell-title">
                      <span className="adm-cell-name">{tag.name}</span>
                    </td>
                    <td>
                      <NameDots row={tag} />
                    </td>
                    <td>
                      <span className="adm-meta">{tag.post_count}</span>
                    </td>
                    <td>
                      <div className="adm-row-actions">
                        <button
                          type="button"
                          className="adm-icon-btn"
                          aria-label={t('taxonomy.editAria', { name: tag.name })}
                          onClick={() => openEdit(tag)}
                        >
                          {t('taxonomy.edit')}
                        </button>
                        <button
                          type="button"
                          className="adm-icon-btn adm-icon-btn-flare"
                          aria-label={t('taxonomy.deleteAria', { name: tag.name })}
                          onClick={() => setDeleteId(tag.id)}
                        >
                          {t('common.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t('taxonomy.tags.edit') : t('taxonomy.tags.add')}</DialogTitle>
            <DialogDescription>{t('taxonomy.tags.dialogDesc')}</DialogDescription>
          </DialogHeader>
          <form className="adm-form" onSubmit={(e) => void handleSubmit(e)}>
            <label className="adm-field">
              <span className="adm-caps">{t('taxonomy.tags.name')}</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <div className="adm-form-section">
              <span className="adm-caps">{t('taxonomy.localeNames')}</span>
              <div className="adm-form-grid">
                {localeNameFields().map(({ key, label }) => (
                  <label key={key} className="adm-field">
                    <span className="adm-caps">{label}</span>
                    <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
                  </label>
                ))}
              </div>
            </div>
            <div className="adm-form-actions">
              <button type="button" className="adm-btn" onClick={() => setDialogOpen(false)}>
                {t('taxonomy.cancel')}
              </button>
              <button type="submit" className="adm-btn adm-btn-primary">
                {editing ? t('taxonomy.update') : t('taxonomy.create')}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('taxonomy.tags.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('taxonomy.tags.confirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('taxonomy.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} variant="destructive">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
