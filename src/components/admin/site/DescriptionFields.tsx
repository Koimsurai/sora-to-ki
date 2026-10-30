import { useEffect, useState } from 'react';

import { useAdminT } from '@/i18n/admin-i18n';
import { loadLocale } from '@/i18n/start-i18n';
import { type Locale } from '@/lib/locales';
import { builtinDescription } from '@/seo/pageSeo';
import { localeLabel } from '../pageLabels';
import { DESCRIBABLE, type Draft } from './siteDraft';

// 介紹文字：各頁在搜尋結果裡的描述，和「關於」選單開頭那一句。站長沒寫的格子用前台字串檔裡的通用句子，
// 那句通用句子就是框裡的提示字，看得到「不寫的話長這樣」。一次編一個語系。

interface Props {
  draft: Draft;
  patch: (p: Partial<Draft>) => void;
  /** 站上有開的語系，第一個是預設語系 */
  locales: readonly string[];
  /** 關掉的頁面不列（讀者看不到，寫了也沒用） */
  disabled: readonly string[];
}

export default function DescriptionFields({ draft, patch, locales, disabled }: Props) {
  const { t } = useAdminT();
  const [lang, setLang] = useState(locales[0] ?? 'zh-TW');
  // 提示字要那個語系的前台字串：切到哪個語系就先載哪個
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void loadLocale(lang as Locale).then(() => alive && setLoaded(lang));
    return () => {
      alive = false;
    };
  }, [lang]);

  const set = (page: string, text: string) =>
    patch({
      page_descriptions: {
        ...draft.page_descriptions,
        [page]: { ...draft.page_descriptions[page], [lang]: text },
      },
    });

  return (
    <>
      <fieldset className="adm-tabs sfs-desc-langs">
        <legend className="sr-only">{t('pages.whichLocale')}</legend>
        {locales.map((l) => (
          <button key={l} type="button" className="adm-tab" aria-pressed={lang === l} onClick={() => setLang(l)}>
            <span className="adm-tab-dot" aria-hidden="true" />
            {localeLabel(l)}
          </button>
        ))}
      </fieldset>
      <div className="sfs-desc">
        {DESCRIBABLE.filter((k) => !disabled.includes(k)).map((page) => (
          // oxlint-disable-next-line jsx-a11y/label-has-associated-control -- 欄位就包在 label 裡
          <label key={page} className="adm-field sfs-desc-row">
            <span className="adm-caps">{t(`site.descriptions.${page}`)}</span>
            <textarea
              rows={2}
              lang={lang}
              value={(draft.page_descriptions as Partial<Draft['page_descriptions']>)[page]?.[lang] ?? ''}
              placeholder={loaded === lang ? builtinDescription(page, lang as Locale) : ''}
              onChange={(e) => set(page, e.target.value)}
            />
          </label>
        ))}
      </div>
    </>
  );
}
