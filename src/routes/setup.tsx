import { createFileRoute } from '@tanstack/react-router';
import { DEFAULT_LOCALE, LocaleProvider, buildAlternateLinks } from '../start-i18n';
import Setup from '../components/Setup';

// 2d:真實 UI 頁(Setup)遷到 Start —— 預設語言無前綴 /setup。
export const Route = createFileRoute('/setup')({
  head: () => ({ links: buildAlternateLinks('setup', DEFAULT_LOCALE) }),
  component: () => (
    <LocaleProvider locale={DEFAULT_LOCALE}>
      <Setup />
    </LocaleProvider>
  ),
});
