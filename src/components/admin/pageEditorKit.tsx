import type { I18n } from './pageDraft';
import { EDIT_LOCALES } from './pageTabs';

// 後台「頁面」各分頁共用的畫面零件：語系切換、多語輸入框、列尾的上移下移刪除、儲存列（邏輯在 pageDraft.ts）。
// 每一頁的編輯器只管自己的欄位長什麼樣子。

/** 編輯哪個語系：會翻譯的欄位跟著它切換 */
export function LangBar({ lang, onChange }: { lang: string; onChange: (lang: string) => void }) {
  return (
    <fieldset className="adm-tabs pg-langs">
      <legend className="sr-only">編輯哪個語系</legend>
      {EDIT_LOCALES.map((l) => (
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
      <span className="adm-meta">{lang === 'zh-TW' ? '繁中一定要填' : '留空就顯示繁中'}</span>
    </fieldset>
  );
}

/** 一個會翻譯的輸入框：寫進目前的語系；非預設語系的提示字是繁中原文 */
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
    placeholder: lang === 'zh-TW' ? label : (value?.['zh-TW'] ?? ''),
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
        aria-label={`${name}往上`}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="adm-icon-btn"
        aria-label={`${name}往下`}
        disabled={index === length - 1}
        onClick={() => onMove(1)}
      >
        ↓
      </button>
      <button type="button" className="adm-icon-btn adm-icon-btn-flare" aria-label={`刪除${name}`} onClick={onRemove}>
        刪除
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
      <span className="adm-meta">{dirty ? '還沒存' : '跟前台一樣'}</span>
      <button type="button" className="adm-btn" disabled={!dirty || saving} onClick={onReset}>
        還原
      </button>
      <button type="button" className="adm-btn adm-btn-primary" disabled={!dirty || saving} onClick={onSave}>
        {saving ? '儲存中' : '儲存'}
      </button>
    </div>
  );
}
