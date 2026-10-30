import type { I18n } from './pageDraft';
import { defaultLocale } from '@/lib/locales';
import { at } from '@/i18n/admin-i18n';
import { isStale, markSynced, staleCounts } from '@/lib/i18nSync';
import { editLocales, localeLabel } from './pageLabels';

// 後台「頁面」各分頁共用的畫面零件：語系切換、多語輸入框、列尾的上移下移刪除、儲存列（邏輯在 pageDraft.ts）。
// 每一頁的編輯器只管自己的欄位長什麼樣子。

/**
 * 編輯哪個語系：會翻譯的欄位跟著它切換。
 * 給了 `content`（整份頁面內容）就在每個語系旁邊標出有幾句可能過期（原文改過、譯文還沒跟上，lib/i18nSync）
 */
export function LangBar({
  lang,
  onChange,
  content,
}: {
  lang: string;
  onChange: (lang: string) => void;
  content?: unknown;
}) {
  const locales = editLocales();
  const stale =
    content === undefined
      ? {}
      : staleCounts(
          content,
          locales.map((l) => l.key),
          defaultLocale(),
        );
  // 語系是小格子、上面的分頁是圓點：上下兩層長得不一樣，一眼分得出哪一排管哪件事
  return (
    <fieldset className="pg-langs">
      <legend className="sr-only">{at('pages.whichLocale')}</legend>
      <div className="adm-seg">
        {locales.map((l) => (
          <button
            key={l.key}
            type="button"
            className="adm-seg-item"
            aria-pressed={lang === l.key}
            onClick={() => onChange(l.key)}
          >
            {l.label}
            {(stale[l.key] ?? 0) > 0 && (
              <span className="pg-stale-count">{at('pages.staleCount', { count: stale[l.key] })}</span>
            )}
          </button>
        ))}
      </div>
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
  const base = defaultLocale();
  const props = {
    'aria-label': `${label}（${lang}）`,
    value: value?.[lang] ?? '',
    placeholder: lang === base ? label : (value?.[base] ?? ''),
    // 寫譯文的同時記下「對著哪一版原文寫的」；改原文不動它，別的語系自然就對不上了
    onChange: (e: { target: { value: string } }) =>
      onChange(markSynced({ ...value, [lang]: e.target.value }, lang, base)),
  };
  const field = multiline ? <textarea rows={2} {...props} /> : <input {...props} />;
  if (!isStale(value, lang, base)) return field;
  return (
    <>
      {field}
      <span className="pg-stale">
        {at('pages.stale', { lang: localeLabel(base) })}
        <button type="button" className="adm-icon-btn" onClick={() => onChange(markSynced({ ...value }, lang, base))}>
          {at('pages.markSynced')}
        </button>
      </span>
    </>
  );
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
