import { useState, type ReactNode } from 'react';

import { useAdminT } from '@/i18n/admin-i18n';
import { ThemeGlyph } from '@/components/common/ThemeGlyph';
import { SUPPORTED_LOCALES } from '@/lib/locales';
import { THEMES } from '@/lib/theme';
import { LAT_LIMIT, TOGGLE_GROUPS, siteProblems, type Draft } from './siteDraft';
import './SiteFields.css';

// 站台設定的欄位：語系、身分、天體、頁面開關。初次設定的精靈一步放一組（天體不問，開站之後再挑），
// 後台的站台設定頁全部排在一起。
// 只管欄位本身；標題、說明、存檔由用的那一邊決定。

type Patch = (p: Partial<Draft>) => void;

export function SiteField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  // 錯誤放在 label 外面：放裡面的話，欄位的名字（讀屏念的那個）會跟著錯誤訊息一起變
  return (
    <div className="sf-field">
      {/* oxlint-disable-next-line jsx-a11y/label-has-associated-control -- 欄位就包在 label 裡 */}
      <label>
        <span className="sf-label">
          {label}
          {hint && <em> · {hint}</em>}
        </span>
        {children}
      </label>
      {error && (
        <span className="sf-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/** 預設語系（單選）與其他開放的語系（核取） */
export function LocaleFields({ draft, patch }: { draft: Draft; patch: Patch }) {
  const { t } = useAdminT();
  const others = SUPPORTED_LOCALES.filter((l) => l !== draft.default_locale);
  return (
    <>
      <p className="sf-label">{t('site.lang.defaultLabel')}</p>
      <fieldset className="sf-radios" aria-label={t('site.lang.defaultLabel')}>
        {SUPPORTED_LOCALES.map((l) => (
          <label key={l} lang={l}>
            <input
              type="radio"
              name="sf-default-locale"
              checked={draft.default_locale === l}
              onChange={() => patch({ default_locale: l, locales: Array.from(new Set([l, ...draft.locales])) })}
            />
            {t(`layout.languageName.${l}`)}
          </label>
        ))}
      </fieldset>
      <p className="sf-label">{t('site.lang.othersLabel')}</p>
      <div className="sf-checks">
        {others.map((l) => (
          <label key={l} className="sf-check" lang={l}>
            <input
              type="checkbox"
              checked={draft.locales.includes(l)}
              onChange={(e) =>
                patch({ locales: e.target.checked ? [...draft.locales, l] : draft.locales.filter((x) => x !== l) })
              }
            />
            {t(`layout.languageName.${l}`)}
            <code>/{l.toLowerCase()}/</code>
          </label>
        ))}
      </div>
      <p className="sf-warn">
        <b aria-hidden="true">!</b>
        <span>{t('site.lang.warn')}</span>
      </p>
      <p className="sf-hint">{t('site.lang.single')}</p>
    </>
  );
}

/** 預設天體（單選）：讀者沒在頂欄選過時看到的那顆，分享圖也畫它 */
export function ThemeFields({ draft, patch }: { draft: Draft; patch: Patch }) {
  const { t } = useAdminT();
  return (
    <>
      {/* 色名用那顆天體自己的訊號色寫，選中的底線也是：四顆並排就看得出各是什麼顏色 */}
      <fieldset className="sf-radios sf-themes" aria-label={t('site.theme.label')}>
        {THEMES.map((theme) => (
          <label key={theme} data-body={theme}>
            <input type="radio" name="sf-theme" checked={draft.theme === theme} onChange={() => patch({ theme })} />
            <ThemeGlyph theme={theme} />
            <span>{t(`site.theme.name.${theme}`)}</span>
            <em>{t(`site.theme.signal.${theme}`)}</em>
          </label>
        ))}
      </fieldset>
      <p className="sf-hint">{t('site.theme.note')}</p>
      {/* ?theme= 只換開的那一頁、不記下來（lib/theme），站長看完不會把自己的瀏覽器換掉 */}
      <a className="sf-theme-try" href={`/?theme=${draft.theme}`} target="_blank" rel="noopener">
        {t('site.theme.preview', { name: t(`site.theme.name.${draft.theme}`) })} ↗
      </a>
    </>
  );
}

/** 站名、作者、網址（唯讀）、介紹、信箱、GitHub。`touched` 之前不顯示錯誤（還沒按過下一步或儲存） */
export function IdentityFields({
  draft,
  patch,
  url,
  touched,
}: {
  draft: Draft;
  patch: Patch;
  url: string;
  touched: boolean;
}) {
  const { t } = useAdminT();
  const problems = touched ? siteProblems(draft) : [];
  const problem = (field: string) => {
    const p = problems.find((x) => x.field === field);
    return p ? t(`site.identity.errors.${p.key}`, { max: 'max' in p ? p.max : undefined }) : undefined;
  };
  return (
    <>
      <SiteField label={t('site.identity.name')} error={problem('name')}>
        <input className="sf-input" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
      </SiteField>
      <div className="sf-row2">
        <SiteField label={t('site.identity.author')} hint={t('site.identity.authorHint')} error={problem('author')}>
          <input className="sf-input" value={draft.author} onChange={(e) => patch({ author: e.target.value })} />
        </SiteField>
        <SiteField label={t('site.identity.url')} hint="SITE_URL">
          <input className="sf-input sf-input-ro" value={url} readOnly />
        </SiteField>
      </div>
      <SiteField label={t('site.identity.description')} error={problem('description')}>
        <input
          className="sf-input"
          value={draft.description}
          onChange={(e) => patch({ description: e.target.value })}
        />
      </SiteField>
      <div className="sf-row2">
        <SiteField label={t('site.identity.email')} hint={t('site.identity.optional')} error={problem('email')}>
          <input
            className="sf-input"
            type="email"
            value={draft.email}
            placeholder="hello@example.com"
            onChange={(e) => patch({ email: e.target.value })}
          />
        </SiteField>
        <SiteField label={t('site.identity.github')} hint={t('site.identity.optional')} error={problem('github')}>
          <input className="sf-input" value={draft.github} onChange={(e) => patch({ github: e.target.value })} />
        </SiteField>
      </div>
      <LaunchPadField draft={draft} patch={patch} error={problem('launch_pad')} />
    </>
  );
}

/** 小數點後一位（約 10 公里）：後端也是存到這裡，大概的城市就好 */
const roundPad = (v: number) => Math.round(v * 10) / 10;

/**
 * 發射台：站長在哪裡。航行日誌的火箭從這裡升空（地面畫這附近的海岸線），收藏頁地球上的琥珀點也在這裡。
 * 填大概的城市就好；「用目前的位置」問瀏覽器要位置，一樣只留一位小數
 */
function LaunchPadField({ draft, patch, error }: { draft: Draft; patch: Patch; error?: string }) {
  const { t } = useAdminT();
  const [locating, setLocating] = useState(false);
  const [locateFailed, setLocateFailed] = useState(false);
  const pad = draft.launch_pad;
  const set = (next: Partial<Draft['launch_pad']>) => patch({ launch_pad: { ...pad, ...next } });
  const locate = () => {
    setLocating(true);
    setLocateFailed(false);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        set({ lat: roundPad(p.coords.latitude), lon: roundPad(p.coords.longitude) });
      },
      () => {
        setLocating(false);
        setLocateFailed(true);
      },
      { maximumAge: 600_000, timeout: 10_000 },
    );
  };
  // 兩個欄位加一顆按鈕：不能整個包在 SiteField 的 label 裡（label 不能包 label，按鈕也會被當成點欄位）
  return (
    <fieldset className="sf-field sf-pad">
      <legend className="sf-label">
        {t('site.identity.launchPad')}
        <em> · {t('site.identity.launchPadHint')}</em>
      </legend>
      <div className="sf-pad-row">
        <label className="sf-pad-axis">
          <span>{t('site.identity.lat')}</span>
          <input
            className="sf-input"
            type="number"
            step="0.1"
            min={-LAT_LIMIT}
            max={LAT_LIMIT}
            value={Number.isFinite(pad.lat) ? pad.lat : ''}
            onChange={(e) => set({ lat: e.target.valueAsNumber })}
          />
        </label>
        <label className="sf-pad-axis">
          <span>{t('site.identity.lon')}</span>
          <input
            className="sf-input"
            type="number"
            step="0.1"
            min={-180}
            max={180}
            value={Number.isFinite(pad.lon) ? pad.lon : ''}
            onChange={(e) => set({ lon: e.target.valueAsNumber })}
          />
        </label>
        <button type="button" className="sf-pad-locate" onClick={locate} disabled={locating}>
          {locating ? t('site.identity.locating') : t('site.identity.locate')}
        </button>
      </div>
      {locateFailed && <span className="sf-hint">{t('site.identity.locateFailed')}</span>}
      {error && (
        <span className="sf-error" role="alert">
          {error}
        </span>
      )}
    </fieldset>
  );
}

/**
 * 頁面開關。滑過或聚焦的那一頁回報給 `onHot`，旁邊的星圖把它點亮。
 * `notes`：每一組底下多一行「它出現在哪裡」（站台設定頁三組並排、沒有精靈那段說明時用）
 */
export function PageToggles({
  draft,
  patch,
  hot,
  onHot,
  notes = false,
}: {
  draft: Draft;
  patch: Patch;
  hot: string | null;
  onHot: (key: string | null) => void;
  notes?: boolean;
}) {
  const { t } = useAdminT();
  const off = new Set(draft.disabled_pages);
  return (
    <>
      {TOGGLE_GROUPS.map((g) => (
        <div key={g.key} className="sf-group" onMouseLeave={() => onHot(null)}>
          <p className="sf-group-h">{t(`site.pages.${g.key}`)}</p>
          {notes && <p className="sf-group-note">{t(`site.pages.${g.key}Note`)}</p>}
          {g.items.map((s) => (
            <button
              key={s.key}
              type="button"
              role="switch"
              aria-checked={!off.has(s.key)}
              className={`sf-toggle${hot === s.key ? ' is-hot' : ''}`}
              onMouseEnter={() => onHot(s.key)}
              onFocus={() => onHot(s.key)}
              onBlur={() => onHot(null)}
              onClick={() =>
                patch({
                  disabled_pages: off.has(s.key)
                    ? draft.disabled_pages.filter((k) => k !== s.key)
                    : [...draft.disabled_pages, s.key],
                })
              }
            >
              <span className="sf-switch" aria-hidden="true" />
              <span className="sf-toggle-name">{t(`site.pages.name.${s.key}`)}</span>
              <span className="sf-toggle-desc">{t(`site.pages.desc.${s.key}`)}</span>
            </button>
          ))}
          {g.key === 'groupOrbit' && !notes && <p className="sf-hint">{t('site.pages.alwaysOn')}</p>}
        </div>
      ))}
    </>
  );
}
