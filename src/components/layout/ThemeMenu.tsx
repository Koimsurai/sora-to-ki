// 頂欄的天體選單（layout/SiteNav 最右邊那個小圖示，NavMenus 的 sky 那一頁）：換主題（lib/theme）。
// 每一個天體是一個 16px 的小圖示，用站上的髮絲線畫，跟首頁主星同一個長相的縮寫：
//   土星：圓加一道斜環　海王星：圓加一道很淡的細環　黑洞：實心的暗圓加光子環　參宿四：圓外一圈點線（拋出去的物質）
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/hooks/useTheme';
import { THEMES, setTheme, type Theme } from '@/lib/theme';

export function ThemeGlyph({ theme }: { theme: Theme }) {
  return (
    <svg className={`sky-glyph sky-glyph-${theme}`} viewBox="-8 -8 16 16" width="16" height="16" aria-hidden="true">
      {theme === 'saturn' && (
        <>
          <circle r="3.6" />
          <ellipse rx="7.4" ry="2.5" transform="rotate(-14)" />
        </>
      )}
      {theme === 'neptune' && (
        <>
          <circle r="4.2" />
          <ellipse className="is-faint" rx="7.2" ry="2.3" transform="rotate(-14)" />
        </>
      )}
      {theme === 'blackhole' && (
        <>
          <circle className="is-solid" r="3.6" />
          <circle r="4.8" />
          <ellipse className="is-faint" rx="7.4" ry="1.8" transform="rotate(-8)" />
        </>
      )}
      {theme === 'betelgeuse' && (
        <>
          <circle r="4" />
          <circle className="is-dotted" r="6.8" />
        </>
      )}
    </svg>
  );
}

/** 下拉面板裡的那一頁：左邊一句說明，右邊四列，選中的那一列前面一顆訊號色的點 */
export function SkyPage() {
  const { t } = useTranslation();
  const now = useTheme();
  return (
    <>
      <div className="snav-page-lead">
        <p>{t('siteNav.skyLead')}</p>
      </div>
      <ol className="snav-page-list">
        {THEMES.map((theme) => (
          <li key={theme} className={theme === now ? 'is-live' : undefined}>
            <button type="button" aria-pressed={theme === now} onClick={() => setTheme(theme)}>
              <span className="snav-row-stamp">
                <ThemeGlyph theme={theme} />
              </span>
              <span className="snav-row-title">{t(`siteNav.skyNames.${theme}`)}</span>
              <span className="snav-row-note">{t(`siteNav.skyNotes.${theme}`)}</span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

/** 手機選單裡的一排：四個圖示加名字 */
export function SkyRow() {
  const { t } = useTranslation();
  const now = useTheme();
  return (
    <fieldset className="snav-menu-sky">
      <legend className="sr-only">{t('siteNav.sky')}</legend>
      {THEMES.map((theme) => (
        <button
          key={theme}
          type="button"
          className={theme === now ? 'is-on' : undefined}
          aria-pressed={theme === now}
          onClick={() => setTheme(theme)}
        >
          <ThemeGlyph theme={theme} />
          {t(`siteNav.skyNames.${theme}`)}
        </button>
      ))}
    </fieldset>
  );
}
