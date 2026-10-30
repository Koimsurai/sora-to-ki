import { useState, type MouseEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SetupBay, SetupContent, SetupPart } from '@koimsurai/api-types';

import { recentPostsFullQueryOptions } from '@/data/blogList';
import { setupContentQueryOptions } from '@/data/pageContent';
import { authHeaders } from '@/lib/authToken';
import { defaultLocale } from '@/lib/locales';
import { at, useAdminT } from '@/i18n/admin-i18n';
import { SHEETS, sheetById } from '@/components/about/setupSheetRegistry';
import { artSrc, BASE_CALLS, type Pt } from '@/components/about/setupSheets';
import { AdminSelect } from './AdminFields';
import AdminLoading from './AdminLoading';
import { SectionHead } from './AdminPage';
import PostLinkModal from './PostLinkModal';
import { move, replaceAt, usePageDraft, usePageLang, type I18n } from './pageDraft';
import { I18nInput, LangBar, RowActions, SaveBar } from './pageEditorKit';

// 設備頁：太空梭貨艙的四格與遠處的第五站（衛星）。每一格選一張圖紙（內建的、custom/setup/ 的圖紙包），
// 或上傳自己的圖、在圖上點一下放部件。沒開的那一格照樣畫在畫面上，只是點不開。
//
// 後台的名字跟前台一致：分頁寫這一艙的大標（「01 主力機」），欄位照它在前台出現的位置命名，
// 部件旁邊放同一張圖紙、編號跟前台一樣（隱藏的部件不佔號），滑到哪一列圖上就亮哪一個。

const UPLOAD = '__upload__';
const EMPTY_BAY: SetupBay = {
  on: false,
  sheet: '',
  image: null,
  eyebrow: '',
  label: {},
  lede: {},
  parts: [],
  extra: [],
  telemetry: false,
  devices_title: {},
  devices: [],
  appliances: [],
  records: [],
};

/** 四格一定在（不足的補空），第五站一定在 */
function normalizeSetup(raw: SetupContent): SetupContent {
  const bays = raw.bays ?? [];
  return {
    bays: [0, 1, 2, 3].map((i) => ({ ...EMPTY_BAY, ...bays[i] })),
    base: { on: false, label: {}, lede: {}, specs: [], ...raw.base },
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

const clamp = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 10) / 10;

/** 分頁上的名字：這一艙的大標（編輯中的語系，沒寫就用預設語系那份）；都沒寫是 undefined */
function nameOf(label: I18n | undefined, lang: string): string | undefined {
  for (const l of [lang, defaultLocale()]) {
    const v = label?.[l]?.trim();
    if (v) return v;
  }
  return undefined;
}

/** 上傳一張圖：回傳網址與高寬比 */
async function upload(file: File): Promise<{ url: string; ratio: number }> {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await fetch('/api/admin/upload', { method: 'POST', headers: authHeaders(), body: form });
  if (!res.ok)
    throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? at('pageSetup.uploadFailed'));
  const { url } = (await res.json()) as { url: string };
  const ratio = await new Promise<number>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalHeight / img.naturalWidth);
    img.onerror = () => reject(new Error(at('pageSetup.imageUnreadable')));
    img.src = url;
  });
  return { url, ratio };
}

interface Call {
  /** 對到哪一列（列上輸入框的 id 用它） */
  id: string;
  at: Pt;
  b: Pt;
  /** 圓圈裡的數字（跟前台一樣：隱藏的不佔號） */
  n: number;
}

/**
 * 圖紙縮圖：底稿加上引線與編號圈，跟前台打開這一艙時同一個位置。
 * `hot` 那一個亮起來；點編號圈跳到那一列的輸入框
 */
function SheetPreview({
  artUrl,
  ratio,
  calls,
  hot,
  label,
}: {
  artUrl: string;
  ratio: number;
  calls: Call[];
  hot: string | null;
  label: string;
}) {
  const { t } = useAdminT();
  return (
    <figure className="pg-sheet" aria-label={label} data-hot={hot ? '' : undefined}>
      <div className="pg-placer-art" style={{ aspectRatio: `1 / ${ratio}` }}>
        <img src={artUrl} alt="" draggable={false} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {calls.map((c) => (
            <line key={c.id} x1={c.at[0]} y1={c.at[1]} x2={c.b[0]} y2={c.b[1]} data-hot={hot === c.id || undefined} />
          ))}
        </svg>
        {calls.map((c) => (
          <span key={c.id}>
            <i
              className="pg-placer-at"
              style={{ left: `${c.at[0]}%`, top: `${c.at[1]}%` }}
              data-hot={hot === c.id || undefined}
            />
            <button
              type="button"
              className="pg-placer-b"
              style={{ left: `${c.b[0]}%`, top: `${c.b[1]}%` }}
              data-hot={hot === c.id || undefined}
              aria-label={t('pageSetup.partJump', { n: c.n })}
              onClick={() => document.getElementById(c.id)?.focus()}
            >
              {c.n}
            </button>
          </span>
        ))}
      </div>
    </figure>
  );
}

/** 列表那一欄：滑過或聚焦哪一列，旁邊的圖就亮哪一個 */
const hotProps = (id: string, setHot: (id: string | null) => void) => ({
  onMouseEnter: () => setHot(id),
  onMouseLeave: () => setHot(null),
  onFocus: () => setHot(id),
  onBlur: () => setHot(null),
});

/** 挑文章：已選的排成標籤片（文章標題），點「挑一篇文章」從清單裡搜 */
function PostPicks({ ids, onChange }: { ids: number[]; onChange: (ids: number[]) => void }) {
  const { t } = useAdminT();
  const [open, setOpen] = useState(false);
  // 跟挑選框同一份清單（開過一次就在快取裡）
  const { data: posts = [] } = useQuery({ ...recentPostsFullQueryOptions(300), enabled: ids.length > 0 || open });
  const titleOf = (id: number) => posts.find((p) => Number(p.id) === id)?.title;
  return (
    <div className="pg-posts">
      {ids.length > 0 && (
        <ul className="adm-chips">
          {ids.map((id) => {
            const title = titleOf(id) ?? t('pageSetup.postMissing', { id });
            return (
              <li key={id} className="adm-chip">
                {title}
                <button
                  type="button"
                  className="adm-chip-x"
                  aria-label={t('pageSetup.removePost', { title })}
                  onClick={() => onChange(ids.filter((x) => x !== id))}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="adm-btn pg-add" onClick={() => setOpen(true)}>
        {t('pageSetup.pickPost')}
      </button>
      <PostLinkModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onSelect={(p) => {
          const id = Number(p.id);
          if (!ids.includes(id)) onChange([...ids, id]);
          setOpen(false);
        }}
      />
    </div>
  );
}

/** 上傳的圖上放部件：點圖新增一個部件（落點），或替選中的那個部件放落點／編號圈 */
function Placer({ bay, onChange }: { bay: SetupBay; onChange: (parts: SetupPart[]) => void }) {
  const { t } = useAdminT();
  const [arm, setArm] = useState<{ k: number; what: 'at' | 'b' } | null>(null);
  const parts = bay.parts ?? [];
  const image = bay.image;
  if (!image) return null;

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const p: [number, number] = [
      clamp(((e.clientX - r.left) / r.width) * 100),
      clamp(((e.clientY - r.top) / r.height) * 100),
    ];
    if (arm) {
      onChange(replaceAt(parts, arm.k, { [arm.what]: p }));
      setArm(null);
      return;
    }
    // 新增：編號圈先放在落點左上一點，之後可以再挪
    const b: [number, number] = [clamp(p[0] - 8), clamp(p[1] - 8)];
    onChange([...parts, { key: `p${Date.now().toString(36)}`, name: '', spec: '', hidden: false, at: p, b }]);
  };

  return (
    <div className="pg-placer">
      <button
        type="button"
        className="pg-placer-art"
        style={{ aspectRatio: `1 / ${image.ratio}` }}
        onClick={onClick}
        aria-label={
          arm
            ? t(arm.what === 'at' ? 'pageSetup.placeArmAt' : 'pageSetup.placeArmB', { n: arm.k + 1 })
            : t('pageSetup.placeNew')
        }
      >
        <img src={image.url} alt="" draggable={false} />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {parts.map((p, k) =>
            p.at && p.b && !p.hidden ? (
              // eslint-disable-next-line @eslint-react/no-array-index-key
              <line key={k} x1={p.at[0]} y1={p.at[1]} x2={p.b[0]} y2={p.b[1]} />
            ) : null,
          )}
        </svg>
        {parts.map((p, k) =>
          p.at && p.b && !p.hidden ? (
            // eslint-disable-next-line @eslint-react/no-array-index-key
            <span key={k}>
              <i className="pg-placer-at" style={{ left: `${p.at[0]}%`, top: `${p.at[1]}%` }} />
              <i className="pg-placer-b" style={{ left: `${p.b[0]}%`, top: `${p.b[1]}%` }}>
                {k + 1}
              </i>
            </span>
          ) : null,
        )}
      </button>
      <p className="adm-meta">
        {arm
          ? t(arm.what === 'at' ? 'pageSetup.hintArmAt' : 'pageSetup.hintArmB', { n: arm.k + 1 })
          : t('pageSetup.hintNew')}
      </p>
      <div className="pg-placer-arm">
        {parts.map((_, k) => (
          // eslint-disable-next-line @eslint-react/no-array-index-key
          <span key={k} className="adm-meta">
            {k + 1}
            <button type="button" className="adm-icon-btn" onClick={() => setArm({ k, what: 'at' })}>
              {t('pageSetup.moveAt')}
            </button>
            <button type="button" className="adm-icon-btn" onClick={() => setArm({ k, what: 'b' })}>
              {t('pageSetup.moveB')}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

/** 一個勾選框，底下一行說明它在前台是什麼樣子 */
function Check({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="adm-field pg-wide">
      <label className="pg-check">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
      {hint && <p className="adm-meta">{hint}</p>}
    </div>
  );
}

function BayEditor({
  no,
  bay,
  lang,
  onChange,
}: {
  no: number;
  bay: SetupBay;
  lang: string;
  onChange: (bay: SetupBay) => void;
}) {
  const { t } = useAdminT();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [hot, setHot] = useState<string | null>(null);
  const set = (patch: Partial<SetupBay>) => onChange({ ...bay, ...patch });
  const parts = bay.parts ?? [];
  const sheet = bay.sheet ? sheetById(bay.sheet) : undefined;
  const choice = (bay.sheet ?? '') === '' ? (bay.image ? UPLOAD : '') : (bay.sheet ?? '');

  /** 圖紙上的第 k 個部件，站長填的那份（用 key 對） */
  const filled = (key: string) => parts.find((p) => p.key === key);
  const setFilled = (key: string, patch: Partial<SetupPart>) => {
    const has = parts.some((p) => p.key === key);
    set({
      parts: has
        ? parts.map((p) => (p.key === key ? { ...p, ...patch } : p))
        : [...parts, { key, name: '', spec: '', hidden: false, ...patch }],
    });
  };
  // 前台的編號：隱藏的部件不佔號，後面的往前補
  let shown = 0;
  const numbered = (sheet?.parts ?? []).map((sp) => ({
    sp,
    id: `pg-part-${no}-${sp.key}`,
    n: filled(sp.key)?.hidden ? 0 : ++shown,
  }));
  const extra = bay.extra ?? [];
  const devices = bay.devices ?? [];
  const appliances = bay.appliances ?? [];

  return (
    <>
      <SectionHead id="pg-setup-bay">{t('pageSetup.bayHead')}</SectionHead>
      <div className="pg-row">
        <Check
          checked={bay.on ?? false}
          onChange={(on) => set({ on })}
          label={t('pageSetup.bayOn')}
          hint={t('pageSetup.bayOnHint')}
        />
        <div className="adm-field">
          <span className="adm-caps">{t('pageSetup.label')}</span>
          <I18nInput lang={lang} label={t('pageSetup.label')} value={bay.label} onChange={(label) => set({ label })} />
          <span className="adm-meta">{t('pageSetup.labelHint')}</span>
        </div>
        <label className="adm-field">
          <span className="adm-caps">{t('pageSetup.eyebrow')}</span>
          <input
            value={bay.eyebrow ?? ''}
            onChange={(e) => set({ eyebrow: e.target.value })}
            placeholder="THE WHITE BUILD"
          />
          <span className="adm-meta">{t('pageSetup.eyebrowHint', { no: pad2(no) })}</span>
        </label>
        <div className="adm-field pg-wide">
          <span className="adm-caps">{t('pageSetup.lede')}</span>
          <I18nInput lang={lang} label={t('pageSetup.lede')} value={bay.lede} onChange={(lede) => set({ lede })} />
        </div>
        <div className="adm-field pg-wide">
          <span className="adm-caps">{t('pageSetup.sheet')}</span>
          <AdminSelect
            label={t('pageSetup.sheet')}
            value={choice}
            options={[
              ...SHEETS.map((s) => ({
                value: s.id,
                label: s.builtin ? t('pageSetup.builtin', { name: s.name }) : s.name,
              })),
              { value: UPLOAD, label: t('pageSetup.uploadOwn') },
            ]}
            onChange={(v) => set(v === UPLOAD ? { sheet: '' } : { sheet: v })}
          />
          <span className="adm-meta">{t('pageSetup.sheetHint')}</span>
        </div>
      </div>

      <SectionHead id="pg-setup-parts">{t('pageSetup.partsHead')}</SectionHead>
      {sheet ? (
        <div className="pg-split">
          <SheetPreview
            artUrl={sheet.artUrl}
            ratio={sheet.ratio}
            calls={numbered.filter((x) => x.n > 0).map((x) => ({ id: x.id, at: x.sp.at, b: x.sp.b, n: x.n }))}
            hot={hot}
            label={t('pageSetup.previewLabel', { name: sheet.name })}
          />
          <div className="pg-split-list">
            <p className="adm-meta">{t('pageSetup.partsHint')}</p>
            {numbered.map(({ sp, id, n }) => {
              const p = filled(sp.key);
              return (
                <div
                  key={sp.key}
                  className="pg-row pg-row-part"
                  data-hot={hot === id || undefined}
                  data-hidden={n === 0 || undefined}
                  {...hotProps(id, setHot)}
                >
                  <span className="pg-part-no">{n > 0 ? n : '–'}</span>
                  <label className="adm-field">
                    <span className="adm-caps">{t('pageSetup.name')}</span>
                    <input
                      id={id}
                      value={p?.name ?? ''}
                      placeholder={sp.key}
                      onChange={(e) => setFilled(sp.key, { name: e.target.value })}
                    />
                  </label>
                  <label className="adm-field">
                    <span className="adm-caps">{t('pageSetup.spec')}</span>
                    <input value={p?.spec ?? ''} onChange={(e) => setFilled(sp.key, { spec: e.target.value })} />
                  </label>
                  <label className="adm-field pg-check">
                    <input
                      type="checkbox"
                      checked={p?.hidden ?? false}
                      onChange={(e) => setFilled(sp.key, { hidden: e.target.checked })}
                    />
                    <span>{t('pageSetup.hidden')}</span>
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="pg-row">
            <label className="adm-field pg-wide">
              <span className="adm-caps">{t('pageSetup.uploadField')}</span>
              <input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  setError('');
                  upload(file)
                    .then((image) => set({ sheet: '', image }))
                    .catch((err: unknown) => setError(err instanceof Error ? err.message : t('pageSetup.uploadFailed')))
                    .finally(() => setUploading(false));
                }}
              />
            </label>
            {error && <p className="adm-meta pg-error">{error}</p>}
          </div>
          <Placer bay={bay} onChange={(next) => set({ parts: next })} />
          {parts.map((p, k) => (
            // eslint-disable-next-line @eslint-react/no-array-index-key
            <div key={k} className="pg-row pg-row-part">
              <span className="pg-part-no">{k + 1}</span>
              <label className="adm-field">
                <span className="adm-caps">{t('pageSetup.name')}</span>
                <input
                  value={p.name ?? ''}
                  onChange={(e) => set({ parts: replaceAt(parts, k, { name: e.target.value }) })}
                />
              </label>
              <label className="adm-field">
                <span className="adm-caps">{t('pageSetup.spec')}</span>
                <input
                  value={p.spec ?? ''}
                  onChange={(e) => set({ parts: replaceAt(parts, k, { spec: e.target.value }) })}
                />
              </label>
              <RowActions
                index={k}
                length={parts.length}
                name={t('pageSetup.partN', { n: k + 1 })}
                onMove={(by) => set({ parts: move(parts, k, by) })}
                onRemove={() => set({ parts: parts.filter((_, i) => i !== k) })}
              />
            </div>
          ))}
        </>
      )}

      <SectionHead id="pg-setup-extra">{t('pageSetup.extraHead')}</SectionHead>
      <p className="adm-meta">{t('pageSetup.extraHint')}</p>
      {extra.map((x, k) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <div key={k} className="pg-row pg-row-part">
          <span className="pg-part-no">·</span>
          <label className="adm-field">
            <span className="adm-caps">{t('pageSetup.name')}</span>
            <input value={x.name} onChange={(e) => set({ extra: replaceAt(extra, k, { name: e.target.value }) })} />
          </label>
          <label className="adm-field">
            <span className="adm-caps">{t('pageSetup.spec')}</span>
            <input
              value={x.spec ?? ''}
              onChange={(e) => set({ extra: replaceAt(extra, k, { spec: e.target.value }) })}
            />
          </label>
          <label className="adm-field pg-check">
            <input
              type="checkbox"
              checked={x.not_drawn ?? false}
              onChange={(e) => set({ extra: replaceAt(extra, k, { not_drawn: e.target.checked }) })}
            />
            <span>{t('pageSetup.notDrawn')}</span>
          </label>
          <RowActions
            index={k}
            length={extra.length}
            name={t('pageSetup.extraN', { n: k + 1 })}
            onMove={(by) => set({ extra: move(extra, k, by) })}
            onRemove={() => set({ extra: extra.filter((_, i) => i !== k) })}
          />
        </div>
      ))}
      <button
        type="button"
        className="adm-btn pg-add"
        onClick={() => set({ extra: [...extra, { name: '', spec: '', not_drawn: false }] })}
      >
        {t('pageSetup.addExtra')}
      </button>

      <SectionHead id="pg-setup-telemetry">{t('pageSetup.telemetryHead')}</SectionHead>
      <div className="pg-row">
        <Check
          checked={bay.telemetry ?? false}
          onChange={(telemetry) => set({ telemetry })}
          label={t('pageSetup.telemetry')}
          hint={t('pageSetup.telemetryHint')}
        />
      </div>

      <SectionHead id="pg-setup-devices">{t('pageSetup.devicesHead')}</SectionHead>
      <p className="adm-meta">{t('pageSetup.devicesHint')}</p>
      <div className="pg-row">
        <div className="adm-field pg-wide">
          <span className="adm-caps">{t('pageSetup.devicesTitle')}</span>
          <I18nInput
            lang={lang}
            label={t('pageSetup.devicesTitle')}
            value={bay.devices_title}
            onChange={(devices_title) => set({ devices_title })}
          />
        </div>
      </div>
      {devices.map((d, k) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <div key={k} className="pg-row">
          <label className="adm-field">
            <span className="adm-caps">{t('pageSetup.device')}</span>
            <input value={d.name} onChange={(e) => set({ devices: replaceAt(devices, k, { name: e.target.value }) })} />
          </label>
          <div className="adm-field">
            <span className="adm-caps">{t('pageSetup.role')}</span>
            <I18nInput
              lang={lang}
              label={t('pageSetup.role')}
              value={d.role}
              onChange={(role) => set({ devices: replaceAt(devices, k, { role }) })}
            />
          </div>
          <div className="adm-field pg-wide">
            <span className="adm-caps">{t('pageSetup.devicePosts')}</span>
            <PostPicks ids={d.posts ?? []} onChange={(posts) => set({ devices: replaceAt(devices, k, { posts }) })} />
          </div>
          <RowActions
            index={k}
            length={devices.length}
            name={t('pageSetup.deviceN', { n: k + 1 })}
            onMove={(by) => set({ devices: move(devices, k, by) })}
            onRemove={() => set({ devices: devices.filter((_, i) => i !== k) })}
          />
        </div>
      ))}
      <button
        type="button"
        className="adm-btn pg-add"
        onClick={() => set({ devices: [...devices, { name: '', role: {}, posts: [] }] })}
      >
        {t('pageSetup.addDevice')}
      </button>

      <SectionHead id="pg-setup-appliances">{t('pageSetup.appliancesHead')}</SectionHead>
      <p className="adm-meta">{t('pageSetup.appliancesHint')}</p>
      {appliances.map((a, k) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <div key={k} className="pg-row">
          <label className="adm-field">
            <span className="adm-caps">{t('pageSetup.applianceBrand')}</span>
            <input
              value={a.name}
              onChange={(e) => set({ appliances: replaceAt(appliances, k, { name: e.target.value }) })}
            />
          </label>
          <div className="adm-field">
            <span className="adm-caps">{t('pageSetup.kind')}</span>
            <I18nInput
              lang={lang}
              label={t('pageSetup.kind')}
              value={a.kind}
              onChange={(kind) => set({ appliances: replaceAt(appliances, k, { kind }) })}
            />
          </div>
          <RowActions
            index={k}
            length={appliances.length}
            name={t('pageSetup.applianceN', { n: k + 1 })}
            onMove={(by) => set({ appliances: move(appliances, k, by) })}
            onRemove={() => set({ appliances: appliances.filter((_, i) => i !== k) })}
          />
        </div>
      ))}
      <button
        type="button"
        className="adm-btn pg-add"
        onClick={() => set({ appliances: [...appliances, { name: '', kind: {} }] })}
      >
        {t('pageSetup.addAppliance')}
      </button>

      <SectionHead id="pg-setup-records">{t('pageSetup.recordsHead')}</SectionHead>
      <p className="adm-meta">{t('pageSetup.recordsHint')}</p>
      <PostPicks ids={bay.records ?? []} onChange={(records) => set({ records })} />
    </>
  );
}

/** 第五站：遠處軌道上的舊衛星。規格條照順序對到衛星線稿上的編號圈 */
function BaseEditor({
  base,
  lang,
  onChange,
}: {
  base: NonNullable<SetupContent['base']>;
  lang: string;
  onChange: (base: NonNullable<SetupContent['base']>) => void;
}) {
  const { t } = useAdminT();
  const [hot, setHot] = useState<string | null>(null);
  const specs = base.specs ?? [];
  const set = (patch: Partial<NonNullable<SetupContent['base']>>) => onChange({ ...base, ...patch });
  const calls: Call[] = specs.slice(0, BASE_CALLS.length).map((_, k) => {
    const [ax, ay, bx, by] = BASE_CALLS[k];
    return { id: `pg-spec-${k}`, at: [ax, ay], b: [bx, by], n: k + 1 };
  });

  return (
    <>
      <SectionHead id="pg-setup-base">{t('pageSetup.baseHead')}</SectionHead>
      <div className="pg-row">
        <Check
          checked={base.on ?? false}
          onChange={(on) => set({ on })}
          label={t('pageSetup.baseOn')}
          hint={t('pageSetup.baseOnHint')}
        />
        <div className="adm-field">
          <span className="adm-caps">{t('pageSetup.label')}</span>
          <I18nInput
            lang={lang}
            label={t('pageSetup.baseNameLabel')}
            value={base.label}
            onChange={(label) => set({ label })}
          />
          <span className="adm-meta">{t('pageSetup.baseLabelHint')}</span>
        </div>
        <div className="adm-field pg-wide">
          <span className="adm-caps">{t('pageSetup.lede')}</span>
          <I18nInput
            lang={lang}
            label={t('pageSetup.baseLedeLabel')}
            value={base.lede}
            onChange={(lede) => set({ lede })}
          />
        </div>
      </div>

      <SectionHead id="pg-setup-specs">{t('pageSetup.specsHead')}</SectionHead>
      <div className="pg-split">
        <SheetPreview
          artUrl={artSrc('bay-satellite')}
          ratio={1}
          calls={calls}
          hot={hot}
          label={t('pageSetup.basePreviewLabel')}
        />
        <div className="pg-split-list">
          <p className="adm-meta">{t('pageSetup.specsHint', { max: BASE_CALLS.length })}</p>
          {specs.map((sp, k) => {
            const id = `pg-spec-${k}`;
            return (
              // eslint-disable-next-line @eslint-react/no-array-index-key
              <div key={k} className="pg-row pg-row-part" data-hot={hot === id || undefined} {...hotProps(id, setHot)}>
                <span className="pg-part-no">{k + 1}</span>
                <label className="adm-field">
                  <span className="adm-caps">{t('pageSetup.specItem')}</span>
                  <input
                    id={id}
                    value={sp.label}
                    onChange={(e) => set({ specs: replaceAt(specs, k, { label: e.target.value }) })}
                  />
                </label>
                <label className="adm-field">
                  <span className="adm-caps">{t('pageSetup.spec')}</span>
                  <input
                    value={sp.value ?? ''}
                    onChange={(e) => set({ specs: replaceAt(specs, k, { value: e.target.value }) })}
                  />
                </label>
                <RowActions
                  index={k}
                  length={specs.length}
                  name={t('pageSetup.specN', { n: k + 1 })}
                  onMove={(by) => set({ specs: move(specs, k, by) })}
                  onRemove={() => set({ specs: specs.filter((_, i) => i !== k) })}
                />
              </div>
            );
          })}
          {specs.length < BASE_CALLS.length && (
            <button
              type="button"
              className="adm-btn pg-add"
              onClick={() => set({ specs: [...specs, { label: '', value: '' }] })}
            >
              {t('pageSetup.addSpec')}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export default function SetupEditor() {
  const { t } = useAdminT();
  const [lang, setLang] = usePageLang();
  const [tab, setTab] = useState(0);
  const page = usePageDraft(
    setupContentQueryOptions,
    '/api/admin/pages/setup',
    (raw) => normalizeSetup(raw as SetupContent),
    t('pageSetup.saved'),
  );
  // 四格與第五站補齊（舊資料或還沒填過）
  const draft = page.draft ? normalizeSetup(page.draft) : undefined;
  if (page.isPending || !draft) return <AdminLoading />;
  const bays = draft.bays ?? [];
  const base = draft.base ?? { on: false, label: {}, lede: {}, specs: [] };

  // 跟前台太空梭上的標籤一樣：四艙是 01～04，衛星是 00
  const tabs = [
    ...bays.map((b, i) => ({
      no: pad2(i + 1),
      name: nameOf(b.label, lang) ?? t('pageSetup.bayTab', { n: i + 1 }),
      on: b.on ?? false,
    })),
    { no: '00', name: nameOf(base.label, lang) ?? t('pageSetup.base'), on: base.on ?? false },
  ];

  return (
    <div className="adm-form pg-editor">
      <LangBar lang={lang} onChange={setLang} content={page.draft} />
      <fieldset className="pg-bays">
        <legend className="sr-only">{t('pageSetup.whichBay')}</legend>
        {tabs.map((b, i) => (
          <button key={b.no} type="button" className="pg-bay" aria-pressed={tab === i} onClick={() => setTab(i)}>
            <span className="pg-bay-no">{b.no}</span>
            <span className="pg-bay-name">{b.name}</span>
            {!b.on && <span className="pg-bay-off">{t('pageSetup.off')}</span>}
          </button>
        ))}
      </fieldset>

      {tab < 4 ? (
        <BayEditor
          key={tab}
          no={tab + 1}
          bay={bays[tab] ?? EMPTY_BAY}
          lang={lang}
          onChange={(bay) => page.set({ bays: bays.map((b, i) => (i === tab ? bay : b)) })}
        />
      ) : (
        <BaseEditor base={base} lang={lang} onChange={(next) => page.set({ base: next })} />
      )}

      <SaveBar dirty={page.dirty} saving={page.saving} onReset={page.reset} onSave={() => void page.save()} />
    </div>
  );
}
