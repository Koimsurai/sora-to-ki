import { useTranslation } from 'react-i18next';
import { LocaleLink } from '../locale-link';

// 2c 驗證用的第二頁:證明 LocaleLink 在各 locale 下產生帶前綴的 href。
export function AboutDemo() {
  const { i18n } = useTranslation();
  return (
    <main style={{ fontFamily: 'sans-serif', maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1>About — locale-link demo</h1>
      <p>
        lang = <strong data-testid="lang">{i18n.language}</strong>
      </p>
      <LocaleLink to="/" className="to-home">
        ← home
      </LocaleLink>
    </main>
  );
}
