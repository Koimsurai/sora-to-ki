import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookRow } from '@koimsurai/api-types';
import { toast } from 'sonner';

import { adminBooksQueryOptions } from '@/data/adminData';
import { proxiedImage } from '@/lib/api';
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
import AdminLoading, { BusyDot } from './AdminLoading';
import { AdminDateField, AdminSelect } from './AdminFields';
import { PageHead, TabPanel } from './AdminPage';
import { formatWhen } from './adminFormat';

// 書架（2026-10 後台提案的「收」）：一本一列——封面、書名與作者、狀態、評分。
// 新增時可以先搜外部書目（Google Books、OpenLibrary、國圖）帶入，再手動補。

/** `GET /api/books` 的單本，型別由後端 Rust struct 生成（見 backend/SPECTA_PLAN.md）。 */
type Book = BookRow;
/** 外部搜尋的一筆：同樣的欄位，多一個來源（國圖的書目沒有封面與簡介）。 */
type SearchHit = Book & { source?: 'google' | 'openlibrary' | 'ncl' };
type Status = 'to-read' | 'reading' | 'read';

interface BookFormData {
  isbn: string;
  title: string;
  authors: string;
  publisher: string;
  published_date: string;
  description: string;
  cover_url: string;
  page_count: number | string;
  language: string;
  categories: string;
  reading_status: string;
  rating: number | null;
  personal_notes: string;
  /** YYYY-MM-DD；空字串＝沒有（送出時後端會存成 null，所以也能拿來清掉）。 */
  date_started: string;
  date_finished: string;
}

const EMPTY: BookFormData = {
  isbn: '',
  title: '',
  authors: '',
  publisher: '',
  published_date: '',
  description: '',
  cover_url: '',
  page_count: '',
  language: '',
  categories: '',
  reading_status: 'to-read',
  rating: null,
  personal_notes: '',
  date_started: '',
  date_finished: '',
};

const STATUS_LABEL: Record<Status, string> = { 'to-read': '想讀', reading: '在讀', read: '讀完' };
const TABS: { key: Status | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'reading', label: '在讀' },
  { key: 'to-read', label: '想讀' },
  { key: 'read', label: '讀完' },
];

const statusLabel = (s: string | null) => (s ? ((STATUS_LABEL as Record<string, string | undefined>)[s] ?? s) : '');
const today = () => new Date().toLocaleDateString('sv-SE'); // sv-SE 的格式剛好是 YYYY-MM-DD（本地時區）

/** 這本書的一行小字：出版社、頁數、讀的時間 */
function bookMeta(b: Book): string {
  const parts = [b.publisher, b.page_count ? `${b.page_count} 頁` : null];
  if (b.date_finished) parts.push(`${formatWhen(b.date_finished, 'yyyy.MM.dd')} 讀完`);
  else if (b.date_started) parts.push(`${formatWhen(b.date_started, 'yyyy.MM.dd')} 開始`);
  return parts.filter(Boolean).join(' · ');
}

export default function BooksManager() {
  const queryClient = useQueryClient();
  const { data: books = [], isPending } = useQuery(adminBooksQueryOptions);
  const invalidateBooks = () => queryClient.invalidateQueries({ queryKey: adminBooksQueryOptions.queryKey });
  const [editing, setEditing] = useState<Book | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<BookFormData>(EMPTY);
  const [externalQuery, setExternalQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Status | 'all'>('all');

  const set = (patch: Partial<BookFormData>) => setForm((f) => ({ ...f, ...patch }));
  const countOf = (key: Status | 'all') =>
    key === 'all' ? books.length : books.filter((b) => b.reading_status === key).length;
  const q = search.trim().toLowerCase();
  const shown = books
    .filter((b) => tab === 'all' || b.reading_status === tab)
    .filter((b) => !q || [b.title, b.authors ?? '', b.isbn ?? ''].some((s) => s.toLowerCase().includes(q)));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setResults([]);
    setExternalQuery('');
    setDialogOpen(true);
  };

  const openEdit = (book: Book) => {
    setEditing(book);
    setForm({
      isbn: book.isbn ?? '',
      title: book.title || '',
      authors: book.authors ?? '',
      publisher: book.publisher ?? '',
      published_date: book.published_date ?? '',
      description: book.description ?? '',
      cover_url: book.cover_url ?? '',
      page_count: book.page_count ?? '',
      language: book.language ?? '',
      categories: book.categories ?? '',
      reading_status: book.reading_status ?? 'to-read',
      rating: book.rating ?? null,
      personal_notes: book.personal_notes ?? '',
      date_started: book.date_started?.slice(0, 10) ?? '',
      date_finished: book.date_finished?.slice(0, 10) ?? '',
    });
    setDialogOpen(true);
  };

  // 搜外部書目（後端依序問 Google Books、OpenLibrary、國圖）
  const searchExternal = async () => {
    if (!externalQuery.trim()) {
      toast.error('請輸入 ISBN 或書名');
      return;
    }
    setIsSearching(true);
    try {
      const response = await fetch(`/api/books/search/external?query=${encodeURIComponent(externalQuery)}`);
      const data = (await response.json()) as { message?: string; books?: SearchHit[]; warnings?: string[] };
      if (data.message === 'success' && data.books) {
        setResults(data.books);
        // 來源壞掉（例如 Google Books 額度用完）時要講出來，不然看起來就像「這本書不存在」
        for (const w of data.warnings ?? []) toast.warning(w, { duration: 10000 });
        if (data.books.length === 0) {
          toast.info(data.warnings?.length ? '備用來源（OpenLibrary）也沒有這本' : '找不到這本書');
        }
      } else {
        toast.error('搜尋失敗');
      }
    } catch (error) {
      console.error('搜尋書籍失敗:', error);
      toast.error('搜尋失敗，請稍後再試');
    } finally {
      setIsSearching(false);
    }
  };

  const pick = (book: Book) => {
    setForm({
      ...EMPTY,
      isbn: book.isbn ?? '',
      title: book.title || '',
      authors: book.authors ?? '',
      publisher: book.publisher ?? '',
      published_date: book.published_date ?? '',
      description: book.description ?? '',
      cover_url: book.cover_url ?? '',
      page_count: book.page_count ?? '',
      language: book.language ?? '',
      categories: book.categories ?? '',
    });
    setResults([]);
    setExternalQuery('');
    toast.success('已帶入書目');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(editing ? `/api/books/${editing.id}` : '/api/books', {
        method: editing ? 'PUT' : 'POST',
        headers: jsonAuthHeaders(),
        body: JSON.stringify(form),
      });
      if (response.ok) {
        toast.success(editing ? '已更新' : '已放上書架');
        setDialogOpen(false);
        void invalidateBooks();
      } else {
        toast.error('操作失敗');
      }
    } catch (error) {
      console.error('保存書籍失敗:', error);
      toast.error('保存失敗');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const response = await fetch(`/api/books/${deleteId}`, { method: 'DELETE', headers: authHeaders() });
      if (response.ok) {
        toast.success('已從書架拿掉');
        void invalidateBooks();
      } else {
        toast.error('刪除失敗');
      }
    } catch (error) {
      console.error('刪除書籍失敗:', error);
      toast.error('刪除失敗');
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="adm-page adm-page-narrow">
      <PageHead
        title="書架"
        latin="Shelf"
        meta={isPending ? '載入中' : `${books.length} 本 · 在讀 ${countOf('reading')}`}
        actions={
          <button type="button" className="adm-btn adm-btn-primary" onClick={openCreate}>
            加一本書
          </button>
        }
      />

      <section className="adm-stack" aria-label="書單">
        <div className="adm-toolbar">
          <div className="adm-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className="adm-tab"
                aria-pressed={tab === t.key}
                onClick={() => setTab(t.key)}
              >
                <span className="adm-tab-dot" aria-hidden="true" />
                {t.label}
                <span className="adm-meta">{isPending ? '' : countOf(t.key)}</span>
              </button>
            ))}
          </div>
          <label className="adm-prompt">
            <span className="adm-prompt-mark" aria-hidden="true">
              &gt;
            </span>
            <span className="sr-only">搜尋書架</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="書名、作者、ISBN"
            />
          </label>
        </div>

        <TabPanel tab={tab}>
          {isPending ? (
            <AdminLoading />
          ) : shown.length === 0 ? (
            <p className="adm-empty">{books.length === 0 ? '書架還是空的。' : '沒有符合的書。'}</p>
          ) : (
            <ul className="adm-list">
              {shown.map((book) => (
                <li key={book.id} className="adm-row adm-book">
                  {book.cover_url ? (
                    <img className="adm-cover" src={proxiedImage(book.cover_url)} alt="" loading="lazy" />
                  ) : (
                    <span className="adm-cover adm-cover-empty" aria-hidden="true" />
                  )}
                  <span className="adm-row-main">
                    <span className="adm-row-title">{book.title}</span>
                    {book.authors && <span className="adm-row-sub">{book.authors}</span>}
                    <span className="adm-meta">{bookMeta(book)}</span>
                  </span>
                  <span
                    className="adm-status"
                    data-status={book.reading_status === 'reading' ? 'published' : undefined}
                  >
                    {statusLabel(book.reading_status)}
                  </span>
                  <span className="adm-meta adm-book-rating">{book.rating ? `★ ${book.rating}` : '—'}</span>
                  <span className="adm-row-actions">
                    <button
                      type="button"
                      className="adm-icon-btn"
                      aria-label={`編輯《${book.title}》`}
                      onClick={() => openEdit(book)}
                    >
                      編輯
                    </button>
                    <button
                      type="button"
                      className="adm-icon-btn adm-icon-btn-flare"
                      aria-label={`刪除《${book.title}》`}
                      onClick={() => setDeleteId(book.id)}
                    >
                      刪除
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TabPanel>
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? '編輯這本書' : '加一本書'}</DialogTitle>
            <DialogDescription>
              {editing
                ? '改完按「更新」。'
                : '先用 ISBN 或書名搜外部書目帶入，再補自己的狀態、評分與筆記；也可以全部手打。'}
            </DialogDescription>
          </DialogHeader>

          <form className="adm-form" onSubmit={(e) => void handleSubmit(e)}>
            {!editing && (
              <div className="adm-stack">
                <div className="adm-inline-form">
                  <label className="adm-prompt adm-grow">
                    <span className="adm-prompt-mark" aria-hidden="true">
                      &gt;
                    </span>
                    <span className="sr-only">搜尋外部書目</span>
                    <input
                      value={externalQuery}
                      onChange={(e) => setExternalQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void searchExternal();
                        }
                      }}
                      placeholder="ISBN 或書名（Google Books、OpenLibrary、國圖）"
                    />
                  </label>
                  <button
                    type="button"
                    className="adm-btn"
                    disabled={isSearching || !externalQuery.trim()}
                    onClick={() => void searchExternal()}
                  >
                    {isSearching && <BusyDot />}
                    {isSearching ? '搜尋中' : '搜尋'}
                  </button>
                </div>
                {results.length > 0 && (
                  <ul className="adm-list adm-hits" aria-label="搜尋結果">
                    {results.map((hit) => (
                      // OpenLibrary 的結果可能沒有 ISBN；來源＋ISBN＋書名才夠分辨
                      <li key={`${hit.source ?? ''}-${hit.isbn ?? ''}-${hit.title}`}>
                        <button type="button" className="adm-row adm-hit" onClick={() => pick(hit)}>
                          {hit.cover_url ? (
                            <img className="adm-cover" src={proxiedImage(hit.cover_url)} alt="" />
                          ) : (
                            <span className="adm-cover adm-cover-empty" aria-hidden="true" />
                          )}
                          <span className="adm-row-main">
                            <span className="adm-row-title">{hit.title}</span>
                            <span className="adm-meta">
                              {[
                                hit.source === 'ncl' ? '國圖（沒有封面與簡介）' : null,
                                hit.authors,
                                hit.isbn && `ISBN ${hit.isbn}`,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <label className="adm-field">
              <span className="adm-caps">書名</span>
              <input value={form.title} onChange={(e) => set({ title: e.target.value })} required />
            </label>
            <div className="adm-form-grid">
              <label className="adm-field">
                <span className="adm-caps">作者</span>
                <input value={form.authors} onChange={(e) => set({ authors: e.target.value })} />
              </label>
              <label className="adm-field">
                <span className="adm-caps">出版社</span>
                <input value={form.publisher} onChange={(e) => set({ publisher: e.target.value })} />
              </label>
              <label className="adm-field">
                <span className="adm-caps">ISBN</span>
                <input value={form.isbn} onChange={(e) => set({ isbn: e.target.value })} />
              </label>
              <div className="adm-field">
                <span className="adm-caps" aria-hidden="true">
                  出版日期
                </span>
                <AdminDateField
                  label="出版日期"
                  value={form.published_date}
                  onChange={(v) => set({ published_date: v })}
                />
              </div>
              <label className="adm-field">
                <span className="adm-caps">頁數</span>
                <input type="number" value={form.page_count} onChange={(e) => set({ page_count: e.target.value })} />
              </label>
              <label className="adm-field">
                <span className="adm-caps">語言</span>
                <input value={form.language} onChange={(e) => set({ language: e.target.value })} placeholder="zh-TW" />
              </label>
            </div>
            <label className="adm-field">
              <span className="adm-caps">分類</span>
              <input value={form.categories} onChange={(e) => set({ categories: e.target.value })} />
            </label>
            <div className="adm-book-cover-field">
              <label className="adm-field adm-grow">
                <span className="adm-caps">封面網址</span>
                <input value={form.cover_url} onChange={(e) => set({ cover_url: e.target.value })} />
              </label>
              {form.cover_url && (
                <img className="adm-cover adm-cover-large" src={proxiedImage(form.cover_url)} alt="封面預覽" />
              )}
            </div>
            <label className="adm-field">
              <span className="adm-caps">簡介</span>
              <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} />
            </label>

            <div className="adm-form-section">
              <span className="adm-caps">我讀這本</span>
              <div className="adm-form-grid">
                <div className="adm-field">
                  <span className="adm-caps" aria-hidden="true">
                    狀態
                  </span>
                  <AdminSelect
                    label="狀態"
                    value={form.reading_status}
                    onChange={(status) => {
                      // 切到「在讀／讀完」時順手補今天的日期（只補空的，已經填過的不動）
                      set({
                        reading_status: status,
                        date_started: status !== 'to-read' && !form.date_started ? today() : form.date_started,
                        date_finished: status === 'read' && !form.date_finished ? today() : form.date_finished,
                      });
                    }}
                    options={[
                      { value: 'to-read', label: '想讀' },
                      { value: 'reading', label: '在讀' },
                      { value: 'read', label: '讀完' },
                    ]}
                  />
                </div>
                <label className="adm-field">
                  <span className="adm-caps">評分 · 0–5</span>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    value={form.rating ?? ''}
                    onChange={(e) => set({ rating: e.target.value ? parseFloat(e.target.value) : null })}
                  />
                </label>
                <div className="adm-field">
                  <span className="adm-caps" aria-hidden="true">
                    開始讀
                  </span>
                  <AdminDateField label="開始讀" value={form.date_started} onChange={(v) => set({ date_started: v })} />
                </div>
                <div className="adm-field">
                  <span className="adm-caps" aria-hidden="true">
                    讀完
                  </span>
                  <AdminDateField label="讀完" value={form.date_finished} onChange={(v) => set({ date_finished: v })} />
                </div>
              </div>
              <label className="adm-field">
                <span className="adm-caps">筆記</span>
                <textarea value={form.personal_notes} onChange={(e) => set({ personal_notes: e.target.value })} />
              </label>
            </div>

            <div className="adm-form-actions">
              <button type="button" className="adm-btn" onClick={() => setDialogOpen(false)}>
                取消
              </button>
              <button type="submit" className="adm-btn adm-btn-primary">
                {editing ? '更新' : '放上書架'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定要把這本書拿掉嗎？</AlertDialogTitle>
            <AlertDialogDescription>連同評分與筆記一起刪掉，拿不回來。</AlertDialogDescription>
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
