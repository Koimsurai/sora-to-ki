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
import { at, useAdminT } from '@/i18n/admin-i18n';
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

const STATUSES: Status[] = ['to-read', 'reading', 'read'];
const TABS: (Status | 'all')[] = ['all', 'reading', 'to-read', 'read'];

const isStatus = (s: string): s is Status => (STATUSES as string[]).includes(s);
const statusLabel = (s: string | null) => (s ? (isStatus(s) ? at(`books.status.${s}`) : s) : '');
const today = () => new Date().toLocaleDateString('sv-SE'); // sv-SE 的格式剛好是 YYYY-MM-DD（本地時區）

/** 這本書的一行小字：出版社、頁數、讀的時間 */
function bookMeta(b: Book): string {
  const parts = [b.publisher, b.page_count ? at('books.pages', { count: b.page_count }) : null];
  if (b.date_finished) parts.push(at('books.finishedOn', { date: formatWhen(b.date_finished, 'yyyy.MM.dd') }));
  else if (b.date_started) parts.push(at('books.startedOn', { date: formatWhen(b.date_started, 'yyyy.MM.dd') }));
  return parts.filter(Boolean).join(' · ');
}

export default function BooksManager() {
  const { t } = useAdminT();
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
      toast.error(t('books.toast.needQuery'));
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
          toast.info(data.warnings?.length ? t('books.toast.fallbackEmpty') : t('books.toast.notFound'));
        }
      } else {
        toast.error(t('books.toast.searchFailed'));
      }
    } catch (error) {
      console.error('搜尋書籍失敗:', error); // i18n-ignore：開發者看的 console，不是介面文字
      toast.error(t('books.toast.searchFailedRetry'));
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
    toast.success(t('books.toast.picked'));
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
        toast.success(editing ? t('books.toast.updated') : t('books.toast.added'));
        setDialogOpen(false);
        void invalidateBooks();
      } else {
        toast.error(t('books.toast.actionFailed'));
      }
    } catch (error) {
      console.error('保存書籍失敗:', error); // i18n-ignore：開發者看的 console，不是介面文字
      toast.error(t('books.toast.saveFailed'));
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const response = await fetch(`/api/books/${deleteId}`, { method: 'DELETE', headers: authHeaders() });
      if (response.ok) {
        toast.success(t('books.toast.removed'));
        void invalidateBooks();
      } else {
        toast.error(t('books.toast.deleteFailed'));
      }
    } catch (error) {
      console.error('刪除書籍失敗:', error); // i18n-ignore：開發者看的 console，不是介面文字
      toast.error(t('books.toast.deleteFailed'));
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="adm-page adm-page-narrow">
      <PageHead
        title={t('nav.books')}
        latin="Shelf"
        meta={isPending ? t('common.loading') : t('books.meta', { count: books.length, reading: countOf('reading') })}
        actions={
          <button type="button" className="adm-btn adm-btn-primary" onClick={openCreate}>
            {t('books.add')}
          </button>
        }
      />

      <section className="adm-stack" aria-label={t('books.listLabel')}>
        <div className="adm-toolbar">
          <div className="adm-tabs">
            {TABS.map((key) => (
              <button
                key={key}
                type="button"
                className="adm-tab"
                aria-pressed={tab === key}
                onClick={() => setTab(key)}
              >
                <span className="adm-tab-dot" aria-hidden="true" />
                {key === 'all' ? t('books.tabAll') : t(`books.status.${key}`)}
                <span className="adm-meta">{isPending ? '' : countOf(key)}</span>
              </button>
            ))}
          </div>
          <label className="adm-prompt">
            <span className="adm-prompt-mark" aria-hidden="true">
              &gt;
            </span>
            <span className="sr-only">{t('books.searchShelf')}</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('books.searchPlaceholder')}
            />
          </label>
        </div>

        <TabPanel tab={tab}>
          {isPending ? (
            <AdminLoading />
          ) : shown.length === 0 ? (
            <p className="adm-empty">{books.length === 0 ? t('books.emptyShelf') : t('books.noMatch')}</p>
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
                      aria-label={t('books.editAria', { title: book.title })}
                      onClick={() => openEdit(book)}
                    >
                      {t('books.edit')}
                    </button>
                    <button
                      type="button"
                      className="adm-icon-btn adm-icon-btn-flare"
                      aria-label={t('books.deleteAria', { title: book.title })}
                      onClick={() => setDeleteId(book.id)}
                    >
                      {t('common.delete')}
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
            <DialogTitle>{editing ? t('books.dialog.editTitle') : t('books.add')}</DialogTitle>
            <DialogDescription>{editing ? t('books.dialog.editDesc') : t('books.dialog.addDesc')}</DialogDescription>
          </DialogHeader>

          <form className="adm-form" onSubmit={(e) => void handleSubmit(e)}>
            {!editing && (
              <div className="adm-stack">
                <div className="adm-inline-form">
                  <label className="adm-prompt adm-grow">
                    <span className="adm-prompt-mark" aria-hidden="true">
                      &gt;
                    </span>
                    <span className="sr-only">{t('books.external.label')}</span>
                    <input
                      value={externalQuery}
                      onChange={(e) => setExternalQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void searchExternal();
                        }
                      }}
                      placeholder={t('books.external.placeholder')}
                    />
                  </label>
                  <button
                    type="button"
                    className="adm-btn"
                    disabled={isSearching || !externalQuery.trim()}
                    onClick={() => void searchExternal()}
                  >
                    {isSearching && <BusyDot />}
                    {isSearching ? t('books.external.searching') : t('books.external.search')}
                  </button>
                </div>
                {results.length > 0 && (
                  <ul className="adm-list adm-hits" aria-label={t('books.external.results')}>
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
                                hit.source === 'ncl' ? t('books.external.ncl') : null,
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
              <span className="adm-caps">{t('books.field.title')}</span>
              <input value={form.title} onChange={(e) => set({ title: e.target.value })} required />
            </label>
            <div className="adm-form-grid">
              <label className="adm-field">
                <span className="adm-caps">{t('books.field.authors')}</span>
                <input value={form.authors} onChange={(e) => set({ authors: e.target.value })} />
              </label>
              <label className="adm-field">
                <span className="adm-caps">{t('books.field.publisher')}</span>
                <input value={form.publisher} onChange={(e) => set({ publisher: e.target.value })} />
              </label>
              <label className="adm-field">
                <span className="adm-caps">ISBN</span>
                <input value={form.isbn} onChange={(e) => set({ isbn: e.target.value })} />
              </label>
              <div className="adm-field">
                <span className="adm-caps" aria-hidden="true">
                  {t('books.field.publishedDate')}
                </span>
                <AdminDateField
                  label={t('books.field.publishedDate')}
                  value={form.published_date}
                  onChange={(v) => set({ published_date: v })}
                />
              </div>
              <label className="adm-field">
                <span className="adm-caps">{t('books.field.pageCount')}</span>
                <input type="number" value={form.page_count} onChange={(e) => set({ page_count: e.target.value })} />
              </label>
              <label className="adm-field">
                <span className="adm-caps">{t('books.field.language')}</span>
                <input value={form.language} onChange={(e) => set({ language: e.target.value })} placeholder="zh-TW" />
              </label>
            </div>
            <label className="adm-field">
              <span className="adm-caps">{t('books.field.categories')}</span>
              <input value={form.categories} onChange={(e) => set({ categories: e.target.value })} />
            </label>
            <div className="adm-book-cover-field">
              <label className="adm-field adm-grow">
                <span className="adm-caps">{t('books.field.coverUrl')}</span>
                <input value={form.cover_url} onChange={(e) => set({ cover_url: e.target.value })} />
              </label>
              {form.cover_url && (
                <img
                  className="adm-cover adm-cover-large"
                  src={proxiedImage(form.cover_url)}
                  alt={t('books.field.coverPreview')}
                />
              )}
            </div>
            <label className="adm-field">
              <span className="adm-caps">{t('books.field.description')}</span>
              <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} />
            </label>

            <div className="adm-form-section">
              <span className="adm-caps">{t('books.field.myReading')}</span>
              <div className="adm-form-grid">
                <div className="adm-field">
                  <span className="adm-caps" aria-hidden="true">
                    {t('books.field.status')}
                  </span>
                  <AdminSelect
                    label={t('books.field.status')}
                    value={form.reading_status}
                    onChange={(status) => {
                      // 切到「在讀／讀完」時順手補今天的日期（只補空的，已經填過的不動）
                      set({
                        reading_status: status,
                        date_started: status !== 'to-read' && !form.date_started ? today() : form.date_started,
                        date_finished: status === 'read' && !form.date_finished ? today() : form.date_finished,
                      });
                    }}
                    options={STATUSES.map((s) => ({ value: s, label: t(`books.status.${s}`) }))}
                  />
                </div>
                <label className="adm-field">
                  <span className="adm-caps">{t('books.field.rating')}</span>
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
                    {t('books.field.started')}
                  </span>
                  <AdminDateField
                    label={t('books.field.started')}
                    value={form.date_started}
                    onChange={(v) => set({ date_started: v })}
                  />
                </div>
                <div className="adm-field">
                  <span className="adm-caps" aria-hidden="true">
                    {t('books.field.finished')}
                  </span>
                  <AdminDateField
                    label={t('books.field.finished')}
                    value={form.date_finished}
                    onChange={(v) => set({ date_finished: v })}
                  />
                </div>
              </div>
              <label className="adm-field">
                <span className="adm-caps">{t('books.field.notes')}</span>
                <textarea value={form.personal_notes} onChange={(e) => set({ personal_notes: e.target.value })} />
              </label>
            </div>

            <div className="adm-form-actions">
              <button type="button" className="adm-btn" onClick={() => setDialogOpen(false)}>
                {t('books.cancel')}
              </button>
              <button type="submit" className="adm-btn adm-btn-primary">
                {editing ? t('books.update') : t('books.putOnShelf')}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('books.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('books.confirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('books.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} variant="destructive">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
