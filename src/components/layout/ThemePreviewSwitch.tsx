import { THEMES, currentTheme, type Theme } from '@/lib/theme';
import './ThemePreviewSwitch.css';

const NAMES: Record<Theme, string> = { saturn: '土星', neptune: '海王星' };

/**
 * 只在 dev 出現的主題切換（lib/theme）：換主題後重新載入，連開場一起重播，方便比對。
 * 正式的入口（站長設定、讀者切換）是另一條線，接上之後這顆就拿掉
 */
export default function ThemePreviewSwitch() {
  const now = currentTheme();
  const pick = (theme: Theme) => {
    try {
      localStorage.setItem('koim-theme', theme);
      // 開場一個分頁只完整演一次（lib/bootRing），清掉才會重播
      sessionStorage.removeItem('koim-boot');
    } catch {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('theme');
    window.location.replace(url);
  };
  return (
    <fieldset className="theme-preview-switch" aria-label="主題預覽">
      {THEMES.map((theme) => (
        <button key={theme} type="button" aria-pressed={theme === now} onClick={() => pick(theme)}>
          {NAMES[theme]}
        </button>
      ))}
    </fieldset>
  );
}
