import { useState, type MouseEvent } from 'react';
import { defaultLocale } from '@/lib/locales';
import type { SetupBay, SetupContent, SetupPart } from '@koimsurai/api-types';

import { setupContentQueryOptions } from '@/data/pageContent';
import { authHeaders } from '@/lib/authToken';
import { at, useAdminT } from '@/i18n/admin-i18n';
import { SHEETS, sheetById } from '@/components/about/setupSheetRegistry';
import { AdminSelect } from './AdminFields';
import AdminLoading from './AdminLoading';
import { SectionHead } from './AdminPage';
import { move, replaceAt, usePageDraft } from './pageDraft';
import { I18nInput, LangBar, RowActions, SaveBar } from './pageEditorKit';

// 設備頁：太空梭貨艙的四格與遠處的第五站。每一格選一張圖紙（內建的、custom/setup/ 的圖紙包），
// 或上傳自己的圖、在圖上點一下放部件。沒開的那一格照樣畫在畫面上，只是點不開。

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

/** 文章 id：逗號隔開 */
const idsOf = (s: string) =>
  s
    .split(/[,，\s]+/)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

const clamp = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 10) / 10;

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

function BayEditor({ bay, lang, onChange }: { bay: SetupBay; lang: string; onChange: (bay: SetupBay) => void }) {
  const { t } = useAdminT();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
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

  return (
    <>
      <div className="pg-row">
        <label className="adm-field pg-check">
          <input type="checkbox" checked={bay.on ?? false} onChange={(e) => set({ on: e.target.checked })} />
          <span>{t('pageSetup.bayOn')}</span>
        </label>
        <div className="adm-field">
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
        </div>
        <label className="adm-field">
          <span className="adm-caps">{t('pageSetup.eyebrow')}</span>
          <input
            value={bay.eyebrow ?? ''}
            onChange={(e) => set({ eyebrow: e.target.value })}
            placeholder="THE WHITE BUILD"
          />
        </label>
        <div className="adm-field">
          <span className="adm-caps">{t('pageSetup.label')}</span>
          <I18nInput lang={lang} label={t('pageSetup.label')} value={bay.label} onChange={(label) => set({ label })} />
        </div>
        <div className="adm-field pg-wide">
          <span className="adm-caps">{t('pageSetup.lede')}</span>
          <I18nInput lang={lang} label={t('pageSetup.lede')} value={bay.lede} onChange={(lede) => set({ lede })} />
        </div>
      </div>

      <SectionHead id="pg-setup-parts">{t('pageSetup.partsHead')}</SectionHead>
      {sheet ? (
        <>
          <p className="adm-meta">{t('pageSetup.partsHint')}</p>
          {sheet.parts.map((sp, k) => {
            const p = filled(sp.key);
            return (
              <div key={sp.key} className="pg-row pg-row-part">
                <span className="pg-part-no">{String(k + 1).padStart(2, '0')}</span>
                <label className="adm-field">
                  <span className="adm-caps">{t('pageSetup.nameKey', { key: sp.key })}</span>
                  <input value={p?.name ?? ''} onChange={(e) => setFilled(sp.key, { name: e.target.value })} />
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
        </>
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
              <span className="pg-part-no">{String(k + 1).padStart(2, '0')}</span>
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
      {(bay.extra ?? []).map((x, k) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <div key={k} className="pg-row pg-row-part">
          <span className="pg-part-no">·</span>
          <label className="adm-field">
            <span className="adm-caps">{t('pageSetup.name')}</span>
            <input
              value={x.name}
              onChange={(e) => set({ extra: replaceAt(bay.extra ?? [], k, { name: e.target.value }) })}
            />
          </label>
          <label className="adm-field">
            <span className="adm-caps">{t('pageSetup.spec')}</span>
            <input
              value={x.spec ?? ''}
              onChange={(e) => set({ extra: replaceAt(bay.extra ?? [], k, { spec: e.target.value }) })}
            />
          </label>
          <label className="adm-field pg-check">
            <input
              type="checkbox"
              checked={x.not_drawn ?? false}
              onChange={(e) => set({ extra: replaceAt(bay.extra ?? [], k, { not_drawn: e.target.checked }) })}
            />
            <span>{t('pageSetup.notDrawn')}</span>
          </label>
          <RowActions
            index={k}
            length={(bay.extra ?? []).length}
            name={t('pageSetup.extraN', { n: k + 1 })}
            onMove={(by) => set({ extra: move(bay.extra ?? [], k, by) })}
            onRemove={() => set({ extra: (bay.extra ?? []).filter((_, i) => i !== k) })}
          />
        </div>
      ))}
      <button
        type="button"
        className="adm-btn pg-add"
        onClick={() => set({ extra: [...(bay.extra ?? []), { name: '', spec: '', not_drawn: false }] })}
      >
        {t('pageSetup.addExtra')}
      </button>

      <SectionHead id="pg-setup-more">{t('pageSetup.moreHead')}</SectionHead>
      <div className="pg-row">
        <label className="adm-field pg-check pg-wide">
          <input
            type="checkbox"
            checked={bay.telemetry ?? false}
            onChange={(e) => set({ telemetry: e.target.checked })}
          />
          <span>{t('pageSetup.telemetry')}</span>
        </label>
        <div className="adm-field pg-wide">
          <span className="adm-caps">{t('pageSetup.devicesTitle')}</span>
          <I18nInput
            lang={lang}
            label={t('pageSetup.devicesTitleLabel')}
            value={bay.devices_title}
            onChange={(devices_title) => set({ devices_title })}
          />
        </div>
      </div>
      {(bay.devices ?? []).map((d, k) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <div key={k} className="pg-row">
          <label className="adm-field">
            <span className="adm-caps">{t('pageSetup.device')}</span>
            <input
              value={d.name}
              onChange={(e) => set({ devices: replaceAt(bay.devices ?? [], k, { name: e.target.value }) })}
            />
          </label>
          <div className="adm-field">
            <span className="adm-caps">{t('pageSetup.role')}</span>
            <I18nInput
              lang={lang}
              label={t('pageSetup.role')}
              value={d.role}
              onChange={(role) => set({ devices: replaceAt(bay.devices ?? [], k, { role }) })}
            />
          </div>
          <label className="adm-field pg-wide">
            <span className="adm-caps">{t('pageSetup.devicePosts')}</span>
            <input
              defaultValue={(d.posts ?? []).join(', ')}
              onBlur={(e) => set({ devices: replaceAt(bay.devices ?? [], k, { posts: idsOf(e.target.value) }) })}
            />
          </label>
          <RowActions
            index={k}
            length={(bay.devices ?? []).length}
            name={t('pageSetup.deviceN', { n: k + 1 })}
            onMove={(by) => set({ devices: move(bay.devices ?? [], k, by) })}
            onRemove={() => set({ devices: (bay.devices ?? []).filter((_, i) => i !== k) })}
          />
        </div>
      ))}
      <button
        type="button"
        className="adm-btn pg-add"
        onClick={() => set({ devices: [...(bay.devices ?? []), { name: '', role: {}, posts: [] }] })}
      >
        {t('pageSetup.addDevice')}
      </button>
      {(bay.appliances ?? []).map((a, k) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <div key={k} className="pg-row">
          <label className="adm-field">
            <span className="adm-caps">{t('pageSetup.applianceBrand')}</span>
            <input
              value={a.name}
              onChange={(e) => set({ appliances: replaceAt(bay.appliances ?? [], k, { name: e.target.value }) })}
            />
          </label>
          <div className="adm-field">
            <span className="adm-caps">{t('pageSetup.kind')}</span>
            <I18nInput
              lang={lang}
              label={t('pageSetup.kind')}
              value={a.kind}
              onChange={(kind) => set({ appliances: replaceAt(bay.appliances ?? [], k, { kind }) })}
            />
          </div>
          <RowActions
            index={k}
            length={(bay.appliances ?? []).length}
            name={t('pageSetup.applianceN', { n: k + 1 })}
            onMove={(by) => set({ appliances: move(bay.appliances ?? [], k, by) })}
            onRemove={() => set({ appliances: (bay.appliances ?? []).filter((_, i) => i !== k) })}
          />
        </div>
      ))}
      <button
        type="button"
        className="adm-btn pg-add"
        onClick={() => set({ appliances: [...(bay.appliances ?? []), { name: '', kind: {} }] })}
      >
        {t('pageSetup.addAppliance')}
      </button>
      <div className="pg-row">
        <label className="adm-field pg-wide">
          <span className="adm-caps">{t('pageSetup.records')}</span>
          <input
            defaultValue={(bay.records ?? []).join(', ')}
            onBlur={(e) => set({ records: idsOf(e.target.value) })}
          />
        </label>
      </div>
    </>
  );
}

export default function SetupEditor() {
  const { t } = useAdminT();
  const [lang, setLang] = useState<string>(defaultLocale);
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
  const specs = base.specs ?? [];

  return (
    <div className="adm-form pg-editor">
      <LangBar lang={lang} onChange={setLang} content={page.draft} />
      <p className="adm-meta">{t('pageSetup.customHint')}</p>
      <div className="adm-tabs">
        {[0, 1, 2, 3].map((i) => (
          <button key={i} type="button" className="adm-tab" aria-pressed={tab === i} onClick={() => setTab(i)}>
            <span className="adm-tab-dot" aria-hidden="true" />
            {t('pageSetup.bayTab', { n: String(i + 1).padStart(2, '0') })}
            <span className="adm-meta">{bays[i]?.on ? '' : t('pageSetup.off')}</span>
          </button>
        ))}
        <button type="button" className="adm-tab" aria-pressed={tab === 4} onClick={() => setTab(4)}>
          <span className="adm-tab-dot" aria-hidden="true" />
          {t('pageSetup.base')}
          <span className="adm-meta">{base.on ? '' : t('pageSetup.off')}</span>
        </button>
      </div>

      {tab < 4 ? (
        <BayEditor
          key={tab}
          bay={bays[tab] ?? EMPTY_BAY}
          lang={lang}
          onChange={(bay) => page.set({ bays: bays.map((b, i) => (i === tab ? bay : b)) })}
        />
      ) : (
        <>
          <div className="pg-row">
            <label className="adm-field pg-check pg-wide">
              <input
                type="checkbox"
                checked={base.on ?? false}
                onChange={(e) => page.set({ base: { ...base, on: e.target.checked } })}
              />
              <span>{t('pageSetup.baseOn')}</span>
            </label>
            <div className="adm-field">
              <span className="adm-caps">{t('pageSetup.baseName')}</span>
              <I18nInput
                lang={lang}
                label={t('pageSetup.baseNameLabel')}
                value={base.label}
                onChange={(label) => page.set({ base: { ...base, label } })}
              />
            </div>
            <div className="adm-field">
              <span className="adm-caps">{t('pageSetup.lede')}</span>
              <I18nInput
                lang={lang}
                label={t('pageSetup.baseLedeLabel')}
                value={base.lede}
                onChange={(lede) => page.set({ base: { ...base, lede } })}
              />
            </div>
          </div>
          <SectionHead id="pg-setup-specs">{t('pageSetup.specsHead')}</SectionHead>
          {specs.map((sp, k) => (
            // eslint-disable-next-line @eslint-react/no-array-index-key
            <div key={k} className="pg-row pg-row-part">
              <span className="pg-part-no">{String(k + 1).padStart(2, '0')}</span>
              <label className="adm-field">
                <span className="adm-caps">{t('pageSetup.specItem')}</span>
                <input
                  value={sp.label}
                  onChange={(e) =>
                    page.set({ base: { ...base, specs: replaceAt(specs, k, { label: e.target.value }) } })
                  }
                />
              </label>
              <label className="adm-field">
                <span className="adm-caps">{t('pageSetup.spec')}</span>
                <input
                  value={sp.value ?? ''}
                  onChange={(e) =>
                    page.set({ base: { ...base, specs: replaceAt(specs, k, { value: e.target.value }) } })
                  }
                />
              </label>
              <RowActions
                index={k}
                length={specs.length}
                name={t('pageSetup.specN', { n: k + 1 })}
                onMove={(by) => page.set({ base: { ...base, specs: move(specs, k, by) } })}
                onRemove={() => page.set({ base: { ...base, specs: specs.filter((_, i) => i !== k) } })}
              />
            </div>
          ))}
          {specs.length < 7 && (
            <button
              type="button"
              className="adm-btn pg-add"
              onClick={() => page.set({ base: { ...base, specs: [...specs, { label: '', value: '' }] } })}
            >
              {t('pageSetup.addSpec')}
            </button>
          )}
        </>
      )}

      <SaveBar dirty={page.dirty} saving={page.saving} onReset={page.reset} onSave={() => void page.save()} />
    </div>
  );
}
