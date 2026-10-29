import { useEffect, useState } from 'react';
import { THEMES, currentTheme, onTheme, setTheme, type Theme } from '@/lib/theme';
import './ThemePreviewSwitch.css';

const NAMES: Record<Theme, string> = { saturn: '土星', neptune: '海王星', blackhole: '黑洞', betelgeuse: '參宿四' };

/**
 * 只在 dev 出現的主題切換（lib/theme）：頁面開著直接換，首頁的主星收成一點再長成新的。
 * 要看開場就重新整理。正式的入口（站長設定、讀者切換）是另一條線，接上之後這顆就拿掉
 */
export default function ThemePreviewSwitch() {
  const [now, setNow] = useState<Theme>(currentTheme);
  useEffect(() => onTheme(setNow), []);
  return (
    <fieldset className="theme-preview-switch" aria-label="主題預覽">
      {THEMES.map((theme) => (
        <button key={theme} type="button" aria-pressed={theme === now} onClick={() => setTheme(theme)}>
          {NAMES[theme]}
        </button>
      ))}
    </fieldset>
  );
}
