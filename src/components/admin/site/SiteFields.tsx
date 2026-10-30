import type { ReactNode } from 'react';

import { useAdminT } from '@/i18n/admin-i18n';
import { SUPPORTED_LOCALES } from '@/lib/locales';
import { TOGGLE_GROUPS, siteProblems, type Draft } from './siteDraft';
import './SiteFields.css';

// 站台設定的三組欄位：語系、身分、頁面開關。初次設定的精靈一步放一組，後台的站台設定頁三組排在一起。
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
    </>
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
