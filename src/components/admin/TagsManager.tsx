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
      (t) =>
        !q ||
        [t.name, t.name_en, t.name_ja, t.name_ko, t.name_zh_cn, t.name_zh_tw].some((s) => s?.toLowerCase().includes(q)),
    )
    .sort((a, b) => b.post_count - a.post_count);
  const unused = tags.filter((t) => t.post_count === 0).length;

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
        toast.success(editing ? '標籤已更新' : '標籤已建立');
        setDialogOpen(false);
        void invalidateTags();
      } else {
        toast.error('操作失敗');
      }
    } catch (error) {
      console.error('保存標籤失敗:', error);
      toast.error('保存失敗');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const response = await fetch(`/api/admin/tags/${deleteId}`, { method: 'DELETE', headers: authHeaders() });
      if (response.ok) {
        toast.success('標籤已刪除');
        void invalidateTags();
      } else {
        toast.error('刪除失敗');
      }
    } catch (error) {
      console.error('刪除標籤失敗:', error);
      toast.error('刪除失敗');
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="adm-page adm-page-narrow">
      <PageHead
        title="標籤"
        latin="Tags"
        meta={isPending ? '載入中' : `${tags.length} 個 · 沒用到的 ${unused}`}
        actions={
          <button type="button" className="adm-btn adm-btn-primary" onClick={openCreate}>
            新增標籤
          </button>
        }
      />

      <section className="adm-stack" aria-label="標籤清單">
        <div className="adm-toolbar">
          <span className="adm-meta">照用到的篇數排</span>
          <label className="adm-prompt">
            <span className="adm-prompt-mark" aria-hidden="true">
              &gt;
            </span>
            <span className="sr-only">搜尋標籤</span>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="名稱或譯名" />
          </label>
        </div>

        {isPending ? (
          <AdminLoading />
        ) : shown.length === 0 ? (
          <p className="adm-empty">{tags.length === 0 ? '還沒有標籤。' : '沒有符合的標籤。'}</p>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">名稱</th>
                  <th scope="col">譯名</th>
                  <th scope="col">篇數</th>
                  <th scope="col">
                    <span className="sr-only">動作</span>
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
                          aria-label={`編輯 ${tag.name}`}
                          onClick={() => openEdit(tag)}
                        >
                          編輯
                        </button>
                        <button
                          type="button"
                          className="adm-icon-btn adm-icon-btn-flare"
                          aria-label={`刪除 ${tag.name}`}
                          onClick={() => setDeleteId(tag.id)}
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
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? '編輯標籤' : '新增標籤'}</DialogTitle>
            <DialogDescription>
              「標籤名稱」是資料鍵：文章的標籤關聯與前台篩選都比對它。譯名只影響各語系頁面上的顯示，留空就顯示原名。
            </DialogDescription>
          </DialogHeader>
          <form className="adm-form" onSubmit={(e) => void handleSubmit(e)}>
            <label className="adm-field">
              <span className="adm-caps">標籤名稱</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <div className="adm-form-section">
              <span className="adm-caps">各語系的譯名 · 選填</span>
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
                取消
              </button>
              <button type="submit" className="adm-btn adm-btn-primary">
                {editing ? '更新' : '建立'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定要刪除這個標籤嗎？</AlertDialogTitle>
            <AlertDialogDescription>刪掉就拿不回來；已經標上它的文章不受影響。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} variant="destructive">
              刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
