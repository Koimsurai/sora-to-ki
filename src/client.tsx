import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { StartClient } from '@tanstack/react-start/client';
import { loadLocale, localeFromPathname } from '@/i18n/start-i18n';
import { defaultLocale, setLocaleConfig } from '@/lib/locales';

// 跟框架預設的接手入口一樣，只多一件事：先載好這一頁語系的字串再接手。
// 伺服器畫的是那個語系的字，接手時字串還沒到的話，畫面會先變成 key、再報 hydration 不一致（i18n/start-i18n 的 loadLocale）
// 語系設定（預設語系、有開的語系）伺服器寫在 <html> 上：先套用，才判斷得出這一頁是哪個語系
const root = document.documentElement;
setLocaleConfig(root.dataset.defaultLocale, root.dataset.locales?.split(',').filter(Boolean));
void Promise.all([loadLocale(localeFromPathname(window.location.pathname)), loadLocale(defaultLocale())]).then(() => {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    );
  });
});
