// 文章頁的兩個小控制（照提案 v14）：
//   語言  頁首日期旁邊一排字「繁 简 EN 日 한」，現在的那一個底下一個琥珀小點；還沒翻的淡一點，點了跳提示
//   字體  目錄底下一行字「字體　思源宋體」，點開往上長出四個字體名（各用自己的字體寫），選了就收
// 沒有下拉選單、沒有浮動圓鈕。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './ArticleControls.css';

const LANGS = [
  { code: 'zh-TW', short: '繁', label: '繁體中文' },
  { code: 'zh-CN', short: '简', label: '简体中文' },
  { code: 'en', short: 'EN', label: 'English' },
  { code: 'ja', short: '日', label: '日本語' },
  { code: 'ko', short: '한', label: '한국어' },
];

export function LangLine({
  current,
  from,
  source,
  available,
  onSelect,
  onUnavailable,
}: {
  current: string;
  /** 剛從哪個語系切過來（blog/useRetune 的交接）：琥珀點從那裡滑過來 */
  from?: string;
  source: string;
  available: string[];
  onSelect: (code: string) => void;
  onUnavailable: (label: string) => void;
}) {
  const { t } = useTranslation();
  const boxRef = useRef<HTMLSpanElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const fromRef = useRef(from);

  // 琥珀點跟著現在的語言；換頁剛切過來的，先放在舊語言底下再滑過去
  useLayoutEffect(() => {
    const box = boxRef.current;
    const dot = dotRef.current;
    if (!box || !dot) return;
    const xOf = (code: string) => {
      const b = box.querySelector<HTMLElement>(`button[lang="${code}"]`);
      return b ? b.offsetLeft + b.offsetWidth / 2 : null;
    };
    const place = () => {
      const x = xOf(current);
      if (x !== null) dot.style.left = `${x}px`;
    };
    const start = fromRef.current ? xOf(fromRef.current) : null;
    fromRef.current = undefined;
    if (start !== null) {
      dot.style.transition = 'none';
      dot.style.left = `${start}px`;
      dot.getBoundingClientRect();
      dot.style.transition = '';
    }
    place();
    // 字體載入後字寬會變
    const ro = new ResizeObserver(place);
    ro.observe(box);
    return () => ro.disconnect();
  }, [current]);

  return (
    <span className="ac-lang" ref={boxRef}>
      <span className="ac-lang-dot" ref={dotRef} aria-hidden="true" />
      {LANGS.map((o) => {
        const on = o.code === current;
        const ok = available.includes(o.code);
        return (
          <button
            key={o.code}
            type="button"
            lang={o.code}
            className={ok ? undefined : 'is-na'}
            aria-current={on ? 'true' : undefined}
            aria-label={o.label}
            title={o.code === source ? `${o.label} · ${t('blog.originalText')}` : o.label}
            onClick={() => {
              if (!ok) onUnavailable(o.label);
              else if (!on) onSelect(o.code);
            }}
          >
            {o.short}
          </button>
        );
      })}
    </span>
  );
}

const FONT_OPTIONS = [
  { id: 'misans', name: 'MiSans' },
  { id: 'lxgw', name: '霞鶩文楷' },
  { id: 'noto-serif', name: '思源宋體' },
  { id: 'source-han', name: '思源黑體' },
];

export function FontLine({
  current,
  onChange,
  className,
}: {
  current: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const name = FONT_OPTIONS.find((f) => f.id === current)?.name ?? current;

  // 點外面或按 Esc 收起來
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!(e.target instanceof Node && boxRef.current?.contains(e.target))) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className={['ac-font', className].filter(Boolean).join(' ')} ref={boxRef}>
      {open && (
        <ul className="ac-font-list">
          {FONT_OPTIONS.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                aria-pressed={f.id === current}
                // 每個選項用自己的字體寫：直接指向 index.css 的那份定義，不另存一份字體棧
                style={{ fontFamily: `var(--blog-font-${f.id})` }}
                onClick={() => {
                  onChange(f.id);
                  setOpen(false);
                }}
              >
                {f.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="ac-font-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t('blog.font')}　{name}
      </button>
    </div>
  );
}
