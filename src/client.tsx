import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { StartClient } from '@tanstack/react-start/client';
import { loadLocale, localeFromPathname } from '@/i18n/start-i18n';

// 跟框架預設的接手入口一樣，只多一件事：先載好這一頁語系的字串再接手。
// 伺服器畫的是那個語系的字，接手時字串還沒到的話，畫面會先變成 key、再報 hydration 不一致（i18n/start-i18n 的 loadLocale）
void loadLocale(localeFromPathname(window.location.pathname)).then(() => {
  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <StartClient />
      </StrictMode>,
    );
  });
});
