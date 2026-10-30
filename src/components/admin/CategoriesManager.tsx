import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminCategoryRow } from '@koimsurai/api-types';
import { toast } from 'sonner';

import { adminCategoriesQueryOptions } from '@/data/adminData';
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

// 分類（2026-10 後台提案）：一張表，每個分類後面五顆語系點看譯名填了沒。
// 表單分三段：名稱與網址、簡述與描述（前台文章頁分類的提示框）、各語系的譯名與譯文。

interface CategoryForm {
  name: string;
  slug: string;
  description: string;
  short_description: string;
  // 顯示用譯名（name 仍是資料鍵：文章的 category 與前台篩選都比對它）
  name_en: string;
  name_ja: string;
  name_ko: string;
  name_zh_cn: string;
  description_en: string;
  description_ja: string;
  description_ko: string;
  description_zh_cn: string;
  short_description_en: string;
  short_description_ja: string;
  short_description_ko: string;
  short_description_zh_cn: string;
  name_zh_tw: string;
  description_zh_tw: string;
  short_description_zh_tw: string;
}

/** 表單裡「描述類」譯文欄位的型別（給 keyof 索引用）。 */
type DescKey = Extract<keyof CategoryForm, `description_${string}` | `short_description_${string}`>;

const EMPTY: CategoryForm = {
  name: '',
  slug: '',
  description: '',
  short_description: '',
  name_en: '',
  name_ja: '',
  name_ko: '',
  name_zh_cn: '',
  description_en: '',
  description_ja: '',
  description_ko: '',
  description_zh_cn: '',
  short_description_en: '',
  short_description_ja: '',
  short_description_ko: '',
  short_description_zh_cn: '',
  name_zh_tw: '',
  description_zh_tw: '',
  short_description_zh_tw: '',
};

export default function CategoriesManager() {
  const { t } = useAdminT();
  const queryClient = useQueryClient();
  const { data: categories = [], isPending } = useQuery(adminCategoriesQueryOptions);
  const invalidateCategories = () => queryClient.invalidateQueries({ queryKey: adminCategoriesQueryOptions.queryKey });
  const [editing, setEditing] = useState<AdminCategoryRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CategoryForm>(EMPTY);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  const shown = categories.filter((c) => !q || c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q));

  const set = (patch: Partial<CategoryForm>) => setForm((f) => ({ ...f, ...patch }));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setDialogOpen(true);
  };

  const openEdit = (c: AdminCategoryRow) => {
    setEditing(c);
    setForm({
      name: c.name,
      slug: c.slug,
      description: c.description ?? '',
      short_description: c.short_description ?? '',
      name_en: c.name_en ?? '',
      name_ja: c.name_ja ?? '',
      name_ko: c.name_ko ?? '',
      name_zh_cn: c.name_zh_cn ?? '',
      description_en: c.description_en ?? '',
      description_ja: c.description_ja ?? '',
      description_ko: c.description_ko ?? '',
      description_zh_cn: c.description_zh_cn ?? '',
      short_description_en: c.short_description_en ?? '',
      short_description_ja: c.short_description_ja ?? '',
      short_description_ko: c.short_description_ko ?? '',
      short_description_zh_cn: c.short_description_zh_cn ?? '',
      name_zh_tw: c.name_zh_tw ?? '',
      description_zh_tw: c.description_zh_tw ?? '',
      short_description_zh_tw: c.short_description_zh_tw ?? '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const response = await fetch(editing ? `/api/admin/categories/${editing.id}` : '/api/admin/categories', {
        method: editing ? 'PUT' : 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify(form),
      });
      if (response.ok) {
        toast.success(editing ? t('taxonomy.categories.updated') : t('taxonomy.categories.created'));
        setDialogOpen(false);
        void invalidateCategories();
      } else {
        toast.error(t('taxonomy.actionFailed'));
      }
    } catch (error) {
      console.error('保存分類失敗:', error); // i18n-ignore：開發者看的 console，不是介面文字
      toast.error(t('taxonomy.saveFailed'));
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const response = await fetch(`/api/admin/categories/${deleteId}`, { method: 'DELETE', headers: authHeaders() });
      if (response.ok) {
        toast.success(t('taxonomy.categories.deleted'));
        void invalidateCategories();
      } else {
        toast.error(t('taxonomy.deleteFailed'));
      }
    } catch (error) {
      console.error('刪除分類失敗:', error); // i18n-ignore：開發者看的 console，不是介面文字
      toast.error(t('taxonomy.deleteFailed'));
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="adm-page adm-page-narrow">
      <PageHead
        title={t('nav.categories')}
        latin="Categories"
        meta={isPending ? t('common.loading') : t('taxonomy.categories.meta', { count: categories.length })}
        actions={
          <button type="button" className="adm-btn adm-btn-primary" onClick={openCreate}>
            {t('taxonomy.categories.add')}
          </button>
        }
      />

      <section className="adm-stack" aria-label={t('taxonomy.categories.listLabel')}>
        <div className="adm-toolbar">
          <span className="adm-meta">{t('taxonomy.categories.hint')}</span>
          <label className="adm-prompt">
            <span className="adm-prompt-mark" aria-hidden="true">
              &gt;
            </span>
            <span className="sr-only">{t('taxonomy.categories.search')}</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('taxonomy.categories.searchPlaceholder')}
            />
          </label>
        </div>

        {isPending ? (
          <AdminLoading />
        ) : shown.length === 0 ? (
          <p className="adm-empty">
            {categories.length === 0 ? t('taxonomy.categories.empty') : t('taxonomy.categories.noMatch')}
          </p>
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
                {shown.map((c) => (
                  <tr key={c.id}>
                    <td className="adm-cell-title">
                      <span className="adm-cell-name">{c.name}</span>
                      <span className="adm-meta adm-tags">
                        /{c.slug}
                        {c.short_description ? ` · ${c.short_description}` : ''}
                      </span>
                    </td>
                    <td>
                      <NameDots row={c} />
                    </td>
                    <td>
                      <span className="adm-meta">{c.post_count}</span>
                    </td>
                    <td>
                      <div className="adm-row-actions">
                        <button
                          type="button"
                          className="adm-icon-btn"
                          aria-label={t('taxonomy.editAria', { name: c.name })}
                          onClick={() => openEdit(c)}
                        >
                          {t('taxonomy.edit')}
                        </button>
                        <button
                          type="button"
                          className="adm-icon-btn adm-icon-btn-flare"
                          aria-label={t('taxonomy.deleteAria', { name: c.name })}
                          onClick={() => setDeleteId(c.id)}
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
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? t('taxonomy.categories.edit') : t('taxonomy.categories.add')}</DialogTitle>
            <DialogDescription>{t('taxonomy.categories.dialogDesc')}</DialogDescription>
          </DialogHeader>
          <form className="adm-form" onSubmit={(e) => void handleSubmit(e)}>
            <div className="adm-form-grid">
              <label className="adm-field">
                <span className="adm-caps">{t('taxonomy.categories.name')}</span>
                <input value={form.name} onChange={(e) => set({ name: e.target.value })} required />
              </label>
              <label className="adm-field">
                <span className="adm-caps">{t('taxonomy.categories.slug')}</span>
                <input value={form.slug} onChange={(e) => set({ slug: e.target.value })} placeholder="tech-notes" />
              </label>
            </div>
            <label className="adm-field">
              <span className="adm-caps">{t('taxonomy.categories.short')}</span>
              <input value={form.short_description} onChange={(e) => set({ short_description: e.target.value })} />
            </label>
            <label className="adm-field">
              <span className="adm-caps">{t('taxonomy.categories.description')}</span>
              <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} />
            </label>

            <div className="adm-form-section">
              <span className="adm-caps">{t('taxonomy.localeNames')}</span>
              <div className="adm-form-grid">
                {localeNameFields().map(({ key, label }) => (
                  <label key={key} className="adm-field">
                    <span className="adm-caps">{label}</span>
                    <input value={form[key]} onChange={(e) => set({ [key]: e.target.value })} />
                  </label>
                ))}
              </div>
            </div>

            <div className="adm-form-section">
              <span className="adm-caps">{t('taxonomy.categories.localeDescs')}</span>
              {localeNameFields().map(({ key, label }) => {
                const shortKey = key.replace('name_', 'short_description_') as DescKey;
                const descKey = key.replace('name_', 'description_') as DescKey;
                return (
                  <div key={key} className="adm-form-grid">
                    <label className="adm-field">
                      <span className="adm-caps">{t('taxonomy.categories.localeShort', { label })}</span>
                      <input value={form[shortKey]} onChange={(e) => set({ [shortKey]: e.target.value })} />
                    </label>
                    <label className="adm-field">
                      <span className="adm-caps">{t('taxonomy.categories.localeDesc', { label })}</span>
                      <input value={form[descKey]} onChange={(e) => set({ [descKey]: e.target.value })} />
                    </label>
                  </div>
                );
              })}
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
            <AlertDialogTitle>{t('taxonomy.categories.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('taxonomy.categories.confirmBody')}</AlertDialogDescription>
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
