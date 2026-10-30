import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminPhoto } from '@koimsurai/api-types';
import { toast } from 'sonner';

import { adminPhotosQueryOptions } from '@/data/adminData';
import { authHeaders, jsonAuthHeaders } from '@/lib/authToken';
import { frameOf } from '@/components/gallery/frames';
import { at, useAdminT } from '@/i18n/admin-i18n';
import { apiErrorText } from '@/lib/apiError';
import AdminLoading, { BusyDot } from './AdminLoading';
import { PageHead, TabPanel } from './AdminPage';
import { formatWhen } from './adminFormat';
import './PhotosManager.css';

// 照片（2026-10 後台提案的「收」）：左邊是照片牆，右邊是選中那一張——改標題、介紹、標籤，
// 標成精選（前台地面站排在最上面）或藏起來（前台不顯示）。
// 照片本身在 NAS 同步產生的 manifest 裡；這裡改的東西存在後端的 photo_meta 表、讀的時候疊上去，
// 所以重新同步不會把改過的標題蓋回檔名。

type Filter = 'all' | 'featured' | 'untitled' | 'hidden';

/** 標題還是檔名的，就是還沒取過名字 */
const untitled = (p: AdminPhoto) => p.title === p.original_title;

const FILTERS: { key: Filter; test: (p: AdminPhoto) => boolean }[] = [
  { key: 'all', test: () => true },
  { key: 'featured', test: (p) => p.featured },
  { key: 'untitled', test: untitled },
  { key: 'hidden', test: (p) => p.hidden },
];

const splitTags = (s: string) =>
  s
    .split(/[,，、]/)
    .map((t) => t.trim())
    .filter(Boolean);

async function patchPhoto(id: string, body: Record<string, unknown>): Promise<AdminPhoto> {
  const res = await fetch(`/api/admin/gallery/photos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: jsonAuthHeaders(),
    body: JSON.stringify(body),
  });
  const out: unknown = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorText(out, at, 'errors', `${res.status}`));
  return out as AdminPhoto;
}

export default function PhotosManager() {
  const { t } = useAdminT();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(adminPhotosQueryOptions);
  const photos = data?.photos ?? [];
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const shown = photos.filter(FILTERS.find((f) => f.key === filter)?.test ?? (() => true));
  const selected = photos.find((p) => p.id === selectedId) ?? shown.at(0);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'photos'] });
    // 前台照片頁與編輯器的選圖讀的是公開清單，一起過期
    void queryClient.invalidateQueries({ queryKey: ['gallery'] });
    void queryClient.invalidateQueries({ queryKey: ['photos'] });
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/gallery/sync', { method: 'POST', headers: authHeaders() });
      const out = (await res.json().catch(() => ({}))) as { error?: string; processed?: number; skipped?: number };
      if (!res.ok) throw new Error(out.error ?? `${res.status}`);
      toast.success(t('photos.syncDone', { processed: out.processed ?? 0, skipped: out.skipped ?? 0 }));
      refresh();
    } catch (e) {
      toast.error(t('photos.syncFailed', { error: e instanceof Error ? e.message : '' }));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="adm-page">
      <PageHead
        title={t('nav.photos')}
        latin="Ground station"
        meta={
          isPending
            ? t('common.loading')
            : `${t('photos.count', { count: photos.length })}${data?.generatedAt ? ` · ${t('photos.lastSync', { date: formatWhen(data.generatedAt, 'yyyy.MM.dd HH:mm') })}` : ''}`
        }
        actions={
          <button type="button" className="adm-btn" disabled={syncing} onClick={() => void sync()}>
            {syncing ? (
              <>
                <BusyDot />
                {t('photos.syncing')}
              </>
            ) : (
              t('photos.syncFromNas')
            )}
          </button>
        }
      />

      <section className="adm-stack" aria-label={t('nav.photos')}>
        <div className="adm-toolbar">
          <div className="adm-tabs">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className="adm-tab"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
              >
                <span className="adm-tab-dot" aria-hidden="true" />
                {t(`photos.filter.${f.key}`)}
                <span className="adm-meta">{isPending ? '' : photos.filter(f.test).length}</span>
              </button>
            ))}
          </div>
        </div>

        <TabPanel tab={filter}>
          {isPending ? (
            <AdminLoading label={t('photos.loadingPhotos')} />
          ) : shown.length === 0 ? (
            <p className="adm-empty">{photos.length === 0 ? t('photos.emptyAll') : t('photos.emptyFilter')}</p>
          ) : (
            <div className="adm-photos">
              <ul className="adm-photo-wall" aria-label={t('photos.wall')}>
                {shown.map((p) => (
                  <li
                    key={p.id}
                    // 寬度照長寬比分（橫的寬、直的窄），一列自己撐滿
                    style={{ flexGrow: p.aspectRatio * 100, flexBasis: `${p.aspectRatio * 120}px` }}
                  >
                    <button
                      type="button"
                      className="adm-photo"
                      aria-pressed={selected?.id === p.id}
                      aria-label={`${p.title}${p.featured ? t('photos.featuredMark') : ''}${p.hidden ? t('photos.hiddenMark') : ''}`}
                      data-hidden={p.hidden || undefined}
                      onClick={() => setSelectedId(p.id)}
                    >
                      <img src={p.thumbnailUrl} alt="" loading="lazy" decoding="async" />
                      {p.featured && <span className="adm-photo-star" aria-hidden="true" />}
                      {untitled(p) && (
                        <span className="adm-photo-tag" aria-hidden="true">
                          {t('photos.untitledTag')}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>

              {selected && <PhotoEditor key={selected.id} photo={selected} onSaved={refresh} />}
            </div>
          )}
        </TabPanel>
      </section>
    </div>
  );
}

/** 右邊那一張：換一張照片時整個重來（key），草稿不會串到下一張 */
function PhotoEditor({ photo, onSaved }: { photo: AdminPhoto; onSaved: () => void }) {
  const { t } = useAdminT();
  // manifest 的 description／tags 在型別上是選用的（舊資料可能沒有那個 key）
  const initial = {
    description: photo.description ?? '',
    tags: (photo.tags ?? []).join('、'),
    tagsEn: (photo.tagsEn ?? []).join(', '),
  };
  const [title, setTitle] = useState(photo.title);
  const [description, setDescription] = useState(initial.description);
  const [tags, setTags] = useState(initial.tags);
  const [tagsEn, setTagsEn] = useState(initial.tagsEn);
  const [saving, setSaving] = useState(false);
  const frame = frameOf(photo);
  const dirty =
    title !== photo.title || description !== initial.description || tags !== initial.tags || tagsEn !== initial.tagsEn;

  // 兩個開關按下去就先變（不等伺服器回來），存不進去再改回去
  const [flags, setFlags] = useState({ featured: photo.featured, hidden: photo.hidden });

  const save = async (body: Record<string, unknown>, done: string): Promise<boolean> => {
    setSaving(true);
    try {
      await patchPhoto(photo.id, body);
      toast.success(done);
      onSaved();
      return true;
    } catch (e) {
      toast.error(t('photos.saveFailed', { error: e instanceof Error ? e.message : '' }));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (next: typeof flags, done: string) => {
    const prev = flags;
    setFlags(next);
    if (!(await save(next, done))) setFlags(prev);
  };

  return (
    <aside className="adm-photo-side" aria-label={t('photos.thisPhoto')}>
      <img className="adm-photo-preview" src={photo.urls.regular} alt={photo.title} />

      <form
        className="adm-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save({ title, description, tags: splitTags(tags), tags_en: splitTags(tagsEn) }, t('photos.saved'));
        }}
      >
        <label className="adm-field">
          <span className="adm-caps">{t('photos.field.title')}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={photo.original_title} />
        </label>
        <p className="adm-form-note">{t('photos.field.originalName', { name: photo.original_title })}</p>
        <label className="adm-field">
          <span className="adm-caps">{t('photos.field.description')}</span>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="adm-field">
          <span className="adm-caps">{t('photos.field.tags')}</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        <label className="adm-field">
          <span className="adm-caps">{t('photos.field.tagsEn')}</span>
          <input value={tagsEn} onChange={(e) => setTagsEn(e.target.value)} />
        </label>
        <div className="adm-form-actions">
          <button type="submit" className="adm-btn adm-btn-primary" disabled={!dirty || saving}>
            {saving ? t('photos.savingFile') : t('common.save')}
          </button>
        </div>
      </form>

      <dl className="adm-photo-exif">
        <dt>{t('photos.exif.lens')}</dt>
        <dd>{frame.lens ?? '—'}</dd>
        <dt>{t('photos.exif.exposure')}</dt>
        <dd>{frame.exposure || '—'}</dd>
        <dt>{t('photos.exif.taken')}</dt>
        <dd>{frame.date || '—'}</dd>
        <dt>{t('photos.exif.size')}</dt>
        <dd>
          {photo.width} × {photo.height}
        </dd>
        <dt>{t('photos.exif.location')}</dt>
        <dd>{photo.gps ? t('photos.exif.hasGps') : t('photos.exif.noGps')}</dd>
      </dl>

      <div className="adm-photo-toggles">
        <label className="adm-check">
          <input
            type="checkbox"
            checked={flags.featured}
            disabled={saving}
            onChange={(e) =>
              void toggle(
                { ...flags, featured: e.target.checked },
                e.target.checked ? t('photos.featuredOn') : t('photos.featuredOff'),
              )
            }
          />
          <span>{t('photos.featured')}</span>
          <span className="adm-meta">{t('photos.featuredNote')}</span>
        </label>
        <label className="adm-check">
          <input
            type="checkbox"
            checked={!flags.hidden}
            disabled={saving}
            onChange={(e) =>
              void toggle(
                { ...flags, hidden: !e.target.checked },
                e.target.checked ? t('photos.shownOn') : t('photos.hiddenOn'),
              )
            }
          />
          <span>{t('photos.showOnSite')}</span>
          <span className="adm-meta">{t('photos.showNote')}</span>
        </label>
      </div>
    </aside>
  );
}
