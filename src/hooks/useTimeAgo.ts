import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { relativeTime, type RelativeTimeOptions } from '@/lib/relativeTime';
import { dotDate } from '@/lib/serverDate';

interface TimeAgoOptions extends RelativeTimeOptions {
  /** 超過門檻改顯示日期時的格式；沒給就是全站的寫法 2026.10.21（lib/serverDate 的 dotDate）。 */
  dateFormat?: Intl.DateTimeFormatOptions;
}

/**
 * 「剛剛／N 分鐘前／N 小時前／N 天前／日期」，文案跟著目前語系。
 * 分類規則在 lib/relativeTime（含 SQLite 無時區字串當成 UTC 的處理）。
 *
 * ⚠ 結果取決於「現在」，server 與 client render 的時間不同：顯示它的元素要加
 * `suppressHydrationWarning`。
 */
export function useTimeAgo() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'zh-TW';
  return useCallback(
    (dateStr: string, { dateFormat, ...opts }: TimeAgoOptions = {}): string => {
      const r = relativeTime(dateStr, new Date(), opts);
      switch (r.kind) {
        case 'justNow':
          return t('common.justNow');
        case 'minutes':
          return t('common.minutesAgo', { count: r.count });
        case 'hours':
          return t('common.hoursAgo', { count: r.count });
        case 'days':
          return t('common.daysAgo', { count: r.count });
        case 'absolute':
          return dateFormat ? r.date.toLocaleDateString(lang, dateFormat) : dotDate(r.date);
      }
    },
    [t, lang],
  );
}
