// 頂欄的天體選單（layout/SiteNav 站名旁那個小圖示，NavMenus 的 sky 那一頁）：換主題（lib/theme）。
// 每一個天體是一個 16px 的小圖示（common/ThemeGlyph）。
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { ThemeGlyph } from '@/components/common/ThemeGlyph';
import { THEMES, requestTheme, type Theme } from '@/lib/theme';

/**
 * 下拉面板裡的那一頁（開在左邊，靠著站名旁的按鈕）：左邊四列，正下方就是按鈕，選中的那一列前面一顆訊號色的點；
 * 右邊是滑過（或鍵盤移到）的那一顆的故事。沒滑過時是現在這顆
 */
export function SkyPage() {
  const { t } = useTranslation();
  const now = useTheme();
  const [looking, setLooking] = useState<Theme | null>(null);
  const shown = looking ?? now;
  return (
    <>
      {/* onMouseLeave 只是讓右邊的故事回到現在這顆，純視覺；每一列本身都是按鈕、都在焦點序列裡 */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <ol className="snav-page-list" onMouseLeave={() => setLooking(null)}>
        {THEMES.map((theme) => (
          <li key={theme} className={theme === now ? 'is-live' : undefined}>
            <button
              type="button"
              aria-pressed={theme === now}
              aria-describedby={shown === theme ? 'snav-sky-story' : undefined}
              onMouseEnter={() => setLooking(theme)}
              onFocus={() => setLooking(theme)}
              onClick={() => requestTheme(theme)}
            >
              <span className="snav-row-stamp">
                <ThemeGlyph theme={theme} />
              </span>
              <span className="snav-row-title">{t(`siteNav.skyNames.${theme}`)}</span>
              <span className="snav-row-note">{t(`siteNav.skyNotes.${theme}`)}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="snav-page-lead">
        {/* 說明一行一段（譯文裡用換行分段） */}
        <div id="snav-sky-story" className="snav-sky-story" key={shown}>
          {t(`siteNav.skyStories.${shown}`)
            .split('\n')
            .map((line) => (
              <p key={line}>{line}</p>
            ))}
        </div>
      </div>
    </>
  );
}

/** 手機選單裡的一排：四個圖示加名字，下面是現在這顆的故事（手機沒有滑過，點了就換，所以只講現在這顆） */
export function SkyRow() {
  const { t } = useTranslation();
  const now = useTheme();
  return (
    <div className="snav-menu-sky">
      <fieldset>
        <legend className="sr-only">{t('siteNav.sky')}</legend>
        {THEMES.map((theme) => (
          <button
            key={theme}
            type="button"
            className={theme === now ? 'is-on' : undefined}
            aria-pressed={theme === now}
            aria-describedby={theme === now ? 'snav-menu-sky-story' : undefined}
            onClick={() => requestTheme(theme)}
          >
            <ThemeGlyph theme={theme} />
            {t(`siteNav.skyNames.${theme}`)}
          </button>
        ))}
      </fieldset>
      <div id="snav-menu-sky-story" className="snav-sky-story" key={now}>
        {t(`siteNav.skyStories.${now}`)
          .split('\n')
          .map((line) => (
            <p key={line}>{line}</p>
          ))}
      </div>
    </div>
  );
}
