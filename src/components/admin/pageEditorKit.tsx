import type { I18n } from './pageDraft';
import { defaultLocale } from '@/lib/locales';
import { at } from '@/i18n/admin-i18n';
import { editLocales, localeLabel } from './pageTabs';

// 後台「頁面」各分頁共用的畫面零件：語系切換、多語輸入框、列尾的上移下移刪除、儲存列（邏輯在 pageDraft.ts）。
// 每一頁的編輯器只管自己的欄位長什麼樣子。

/** 編輯哪個語系：會翻譯的欄位跟著它切換 */
export function LangBar({ lang, onChange }: { lang: string; onChange: (lang: string) => void }) {
  return (
    <fieldset className="adm-tabs pg-langs">
      <legend className="sr-only">{at('pages.whichLocale')}</legend>
      {editLocales().map((l) => (
        <button
          key={l.key}
          type="button"
          className="adm-tab"
          aria-pressed={lang === l.key}
          onClick={() => onChange(l.key)}
        >
          <span className="adm-tab-dot" aria-hidden="true" />
          {l.label}
        </button>
      ))}
      <span className="adm-meta">
        {lang === defaultLocale()
          ? at('pages.required', { lang: localeLabel(lang) })
          : at('pages.fallsBack', { lang: localeLabel(defaultLocale()) })}
      </span>
    </fieldset>
  );
}

/** 一個會翻譯的輸入框：寫進目前的語系；非預設語系的提示字是預設語系的原文 */
export function I18nInput({
  value,
  onChange,
  label,
  lang,
  multiline = false,
}: {
  value: I18n | undefined;
  onChange: (next: I18n) => void;
  label: string;
  lang: string;
  multiline?: boolean;
}) {
  const props = {
    'aria-label': `${label}（${lang}）`,
    value: value?.[lang] ?? '',
    placeholder: lang === defaultLocale() ? label : (value?.[defaultLocale()] ?? ''),
    onChange: (e: { target: { value: string } }) => onChange({ ...value, [lang]: e.target.value }),
  };
  return multiline ? <textarea rows={2} {...props} /> : <input {...props} />;
}

/** 列尾：上移、下移、刪除 */
export function RowActions({
  index,
  length,
  name,
  onMove,
  onRemove,
}: {
  index: number;
  length: number;
  name: string;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="adm-row-actions">
      <button
        type="button"
        className="adm-icon-btn"
        aria-label={at('pages.moveUp', { name })}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="adm-icon-btn"
        aria-label={at('pages.moveDown', { name })}
        disabled={index === length - 1}
        onClick={() => onMove(1)}
      >
        ↓
      </button>
      <button
        type="button"
        className="adm-icon-btn adm-icon-btn-flare"
        aria-label={at('pages.remove', { name })}
        onClick={onRemove}
      >
        {at('common.delete')}
      </button>
    </div>
  );
}

/** 最底下黏著的一列：有沒有改、還原、儲存 */
export function SaveBar({
  dirty,
  saving,
  onReset,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <div className="adm-form-actions pg-save">
      <span className="adm-meta">{dirty ? at('pages.unsaved') : at('pages.inSync')}</span>
      <button type="button" className="adm-btn" disabled={!dirty || saving} onClick={onReset}>
        {at('common.revert')}
      </button>
      <button type="button" className="adm-btn adm-btn-primary" disabled={!dirty || saving} onClick={onSave}>
        {saving ? at('common.saving') : at('common.save')}
      </button>
    </div>
  );
}
