import { setAdminLang, useAdminT } from '@/i18n/admin-i18n';
import { SUPPORTED_LOCALES } from '@/lib/locales';
import './AdminLangSwitch.css';

// 後台語言的切換：側欄底下一排、初次設定的右上角各一份，換了兩邊都記住（i18n/admin-i18n）。

export default function AdminLangSwitch() {
  const { t, i18n } = useAdminT();
  return (
    <fieldset className="adm-lang" aria-label={t('layout.language')}>
      {SUPPORTED_LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          className="adm-lang-option"
          aria-pressed={i18n.language === l}
          lang={l}
          title={t(`layout.languageName.${l}`)}
          onClick={() => void setAdminLang(l)}
        >
          {t(`layout.languageShort.${l}`)}
        </button>
      ))}
    </fieldset>
  );
}
