// 自訂右鍵選單（全站）。按住 Shift 右鍵 → 讓瀏覽器原生選單出來（不攔截）。
// 右鍵在連結上 → 多出「開新分頁 / 複製連結」；隨處都有「隨機文章 / 回到頂部」。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import './ContextMenu.css';

interface MenuState {
  x: number;
  y: number;
  href: string | null;
}

export default function ContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { t } = useTranslation();

  // 右鍵：Shift 放行原生；否則攔截、記錄座標與（若有）連結
  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      if (e.shiftKey) return;
      e.preventDefault();
      const el = e.target instanceof Element ? e.target.closest('a[href]') : null;
      setMenu({ x: e.clientX, y: e.clientY, href: el?.getAttribute('href') ?? null });
    };
    document.addEventListener('contextmenu', onContext);
    return () => document.removeEventListener('contextmenu', onContext);
  }, []);

  // 開著時：點外面 / Esc / 捲動 → 關
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onDown = (e: PointerEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  // 夾到視窗內（量測後校正位置）
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const pad = 8;
    const left = Math.min(menu.x, window.innerWidth - r.width - pad);
    const top = Math.min(menu.y, window.innerHeight - r.height - pad);
    // 量測選單尺寸後才能夾進視窗 → 這裡的 setState 是必要的（layout effect、paint 前）
    // eslint-disable-next-line @eslint-react/set-state-in-effect
    setPos({ left: Math.max(pad, left), top: Math.max(pad, top) });
  }, [menu]);

  const run = useCallback((fn: () => void) => {
    fn();
    setMenu(null);
  }, []);

  const goRandom = useCallback(() => {
    void (async () => {
      try {
        const res = await fetch('/api/posts?limit=100');
        const data: unknown = await res.json();
        const list = Array.isArray(data) ? data : (data as { posts?: unknown[] }).posts;
        const ids = (Array.isArray(list) ? list : [])
          .map((p) => (p as { id?: number }).id)
          .filter((v): v is number => typeof v === 'number');
        if (!ids.length) return;
        const id = ids[Math.floor(Math.random() * ids.length)];
        void navigate({ to: '/blog/$id', params: { id: String(id) } });
      } catch {
        /* 靜默失敗 */
      }
    })();
  }, [navigate]);

  if (!menu) return null;
  const { href } = menu;

  return (
    <div
      ref={ref}
      className="ctx-menu"
      role="menu"
      // role="menu" 是互動角色，必須能被聚焦（interactive-supports-focus）。
      // -1：不進 Tab 序列，但選單開啟時可以用程式把焦點送進來。
      tabIndex={-1}
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 上一頁、下一頁、重新整理：一行等寬的箭頭，像瀏覽器那三顆但不畫成按鈕 */}
      <div className="ctx-nav">
        <button
          type="button"
          className="ctx-nav-btn"
          title={t('contextMenu.back')}
          aria-label={t('contextMenu.back')}
          onClick={() => run(() => history.back())}
        >
          ←
        </button>
        <button
          type="button"
          className="ctx-nav-btn"
          title={t('contextMenu.forward')}
          aria-label={t('contextMenu.forward')}
          onClick={() => run(() => history.forward())}
        >
          →
        </button>
        <button
          type="button"
          className="ctx-nav-btn"
          title={t('contextMenu.reload')}
          aria-label={t('contextMenu.reload')}
          onClick={() => run(() => location.reload())}
        >
          ↻
        </button>
      </div>
      {href ? (
        <>
          <button
            type="button"
            role="menuitem"
            className="ctx-item"
            onClick={() => run(() => window.open(href, '_blank', 'noopener,noreferrer'))}
          >
            <i className="ctx-dot" aria-hidden="true" />
            {t('contextMenu.openNewTab')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="ctx-item"
            onClick={() => run(() => void navigator.clipboard.writeText(new URL(href, location.href).href))}
          >
            <i className="ctx-dot" aria-hidden="true" />
            {t('contextMenu.copyLink')}
          </button>
          <div className="ctx-divider" />
        </>
      ) : null}
      <button type="button" role="menuitem" className="ctx-item" onClick={() => run(goRandom)}>
        <i className="ctx-dot" aria-hidden="true" />
        {t('contextMenu.random')}
      </button>
      <button
        type="button"
        role="menuitem"
        className="ctx-item"
        onClick={() => run(() => window.scrollTo({ top: 0, behavior: 'smooth' }))}
      >
        <i className="ctx-dot" aria-hidden="true" />
        {t('contextMenu.top')}
      </button>
      <div className="ctx-hint">{t('contextMenu.hint')}</div>
    </div>
  );
}
