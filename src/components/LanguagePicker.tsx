import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FaGlobe, FaCheck } from 'react-icons/fa';
import { SUPPORTED_LOCALES, LOCALE_LABELS } from '../start-i18n';
import './LanguagePicker.css';

/* ──────────────────────────────────────────────────────────────
   語言切換器 — footer 用，Innei 風 popup
   - trigger: 🌐 + 當前語系 label
   - popup: 5 個 locale，當前打勾
   - 切完寫 localStorage（i18next-browser-languagedetector 自動處理 koim_locale）
   - changeLanguage 觸發 i18n + <html lang> 同步 → CSS :lang() 套字體
─────────────────────────────────────────────────────────────── */

function LanguagePicker() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 點外面關掉 + Esc 關掉
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const current = i18n.resolvedLanguage ?? i18n.language ?? 'zh-TW';

  const select = (code: string) => {
    void i18n.changeLanguage(code);
    setOpen(false);
  };

  return (
    <div className="lang-picker" ref={ref}>
      <button
        type="button"
        className="lang-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <FaGlobe className="lang-picker-icon" />
        <span>{LOCALE_LABELS[current] || current}</span>
      </button>

      {open && (
        <ul className="lang-picker-popup" role="listbox">
          {SUPPORTED_LOCALES.map((code) => (
            <li key={code}>
              <button
                type="button"
                className={`lang-picker-item${code === current ? ' is-current' : ''}`}
                onClick={() => select(code)}
                role="option"
                aria-selected={code === current}
              >
                <span lang={code}>{LOCALE_LABELS[code]}</span>
                {code === current && <FaCheck className="lang-picker-check" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LanguagePicker;
