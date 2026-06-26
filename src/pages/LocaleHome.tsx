import { useTranslation } from 'react-i18next';
import { LocaleLink } from '../locale-link';

// P2 slice 2 證明用:同一個元件,語言由外層 LocaleProvider(來自 URL)決定。
export function LocaleHome() {
  const { t, i18n } = useTranslation();
  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1>Koimsurai — locale routing proof</h1>
      <p>
        <LocaleLink to="/about" className="to-about">
          About →
        </LocaleLink>
      </p>
      <p>
        i18n.language = <strong data-testid="lang">{i18n.language}</strong>
      </p>
      <p>
        t(&apos;common.loading&apos;) = <strong data-testid="loading">{t('common.loading')}</strong>
      </p>
    </main>
  );
}
