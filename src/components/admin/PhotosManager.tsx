import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminPhoto } from '@koimsurai/api-types';
import { toast } from 'sonner';

import { adminPhotosQueryOptions } from '@/data/adminData';
import { authHeaders, jsonAuthHeaders } from '@/lib/authToken';
import { frameOf } from '@/components/gallery/frames';
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

const FILTERS: { key: Filter; label: string; test: (p: AdminPhoto) => boolean }[] = [
  { key: 'all', label: '全部', test: () => true },
  { key: 'featured', label: '精選', test: (p) => p.featured },
  { key: 'untitled', label: '缺標題', test: untitled },
  { key: 'hidden', label: '藏起來的', test: (p) => p.hidden },
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
  const out = (await res.json().catch(() => ({}))) as AdminPhoto & { error?: string };
  if (!res.ok) throw new Error(out.error ?? `${res.status}`);
  return out;
}

export default function PhotosManager() {
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
      toast.success(`同步好了：新增 ${out.processed ?? 0}、略過 ${out.skipped ?? 0}`);
      refresh();
    } catch (e) {
      toast.error(`同步失敗：${e instanceof Error ? e.message : ''}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="adm-page">
      <PageHead
        title="照片"
        latin="Ground station"
        meta={
          isPending
            ? '載入中'
            : `${photos.length} 張${data?.generatedAt ? ` · 上次同步 ${formatWhen(data.generatedAt, 'yyyy.MM.dd HH:mm')}` : ''}`
        }
        actions={
          <button type="button" className="adm-btn" disabled={syncing} onClick={() => void sync()}>
            {syncing ? (
              <>
                <BusyDot />
                同步中
              </>
            ) : (
              '從 NAS 同步'
            )}
          </button>
        }
      />

      <section className="adm-stack" aria-label="照片">
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
                {f.label}
                <span className="adm-meta">{isPending ? '' : photos.filter(f.test).length}</span>
              </button>
            ))}
          </div>
        </div>

        <TabPanel tab={filter}>
          {isPending ? (
            <AdminLoading label="讀照片" />
          ) : shown.length === 0 ? (
            <p className="adm-empty">
              {photos.length === 0 ? '還沒有照片。按「從 NAS 同步」把照片拉進來。' : '這裡沒有照片。'}
            </p>
          ) : (
            <div className="adm-photos">
              <ul className="adm-photo-wall" aria-label="照片牆">
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
                      aria-label={`${p.title}${p.featured ? '（精選）' : ''}${p.hidden ? '（藏起來的）' : ''}`}
                      data-hidden={p.hidden || undefined}
                      onClick={() => setSelectedId(p.id)}
                    >
                      <img src={p.thumbnailUrl} alt="" loading="lazy" decoding="async" />
                      {p.featured && <span className="adm-photo-star" aria-hidden="true" />}
                      {untitled(p) && (
                        <span className="adm-photo-tag" aria-hidden="true">
                          未命名
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
      toast.error(`沒有存到：${e instanceof Error ? e.message : ''}`);
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
    <aside className="adm-photo-side" aria-label="這張照片">
      <img className="adm-photo-preview" src={photo.urls.regular} alt={photo.title} />

      <form
        className="adm-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save({ title, description, tags: splitTags(tags), tags_en: splitTags(tagsEn) }, '存好了');
        }}
      >
        <label className="adm-field">
          <span className="adm-caps">標題</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={photo.original_title} />
        </label>
        <p className="adm-form-note">原本的檔名是 {photo.original_title}；清空就改回它。</p>
        <label className="adm-field">
          <span className="adm-caps">介紹 · 選填</span>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="adm-field">
          <span className="adm-caps">標籤 · 用頓號或逗號分開</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        <label className="adm-field">
          <span className="adm-caps">英文標籤</span>
          <input value={tagsEn} onChange={(e) => setTagsEn(e.target.value)} />
        </label>
        <div className="adm-form-actions">
          <button type="submit" className="adm-btn adm-btn-primary" disabled={!dirty || saving}>
            {saving ? '存檔中' : '儲存'}
          </button>
        </div>
      </form>

      <dl className="adm-photo-exif">
        <dt>鏡頭</dt>
        <dd>{frame.lens ?? '—'}</dd>
        <dt>曝光</dt>
        <dd>{frame.exposure || '—'}</dd>
        <dt>拍攝</dt>
        <dd>{frame.date || '—'}</dd>
        <dt>尺寸</dt>
        <dd>
          {photo.width} × {photo.height}
        </dd>
        <dt>位置</dt>
        <dd>{photo.gps ? '有 GPS' : '沒有'}</dd>
      </dl>

      <div className="adm-photo-toggles">
        <label className="adm-check">
          <input
            type="checkbox"
            checked={flags.featured}
            disabled={saving}
            onChange={(e) =>
              void toggle({ ...flags, featured: e.target.checked }, e.target.checked ? '標成精選了' : '拿掉精選了')
            }
          />
          <span>精選</span>
          <span className="adm-meta">前台排在最上面</span>
        </label>
        <label className="adm-check">
          <input
            type="checkbox"
            checked={!flags.hidden}
            disabled={saving}
            onChange={(e) =>
              void toggle({ ...flags, hidden: !e.target.checked }, e.target.checked ? '前台看得到了' : '藏起來了')
            }
          />
          <span>前台顯示</span>
          <span className="adm-meta">關掉就只有這裡看得到</span>
        </label>
      </div>
    </aside>
  );
}
