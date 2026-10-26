import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import './AdminTooltips.css';

// 後台的提示框：取代 `title` 屬性那個瀏覽器畫的黃白小框（系統字、圓角、出現得很慢）。
//
// 跟 AdminScrollbars 同一個做法——一個元件管全後台，不逐一改寫各處的 title：
// 游標移進一個帶 title 的元素時，把字搬到 data-tip、拿掉 title（瀏覽器就不會再畫自己的），
// 停一下之後在元素底下畫一個夜色的框。React 之後重設 title（字跟著狀態變的那種）也沒關係：
// 下次移進來會再搬一次。
//
// 拿掉 title 會讓只有圖示的按鈕失去名字，所以那種會補上 aria-label，報讀器照樣念得出來。

const SHOW_AFTER = 400;
/** 提示框離元素多遠 */
const GAP = 8;
/** 離視窗邊緣至少多遠 */
const MARGIN = 8;

interface Tip {
  text: string;
  /** 元素的位置（視窗座標）；框的實際位置等量到自己的寬高再算 */
  rect: DOMRect;
}

/** 從游標底下往上找第一個帶提示字的元素，順手把 title 搬走 */
function takeTip(target: EventTarget | null): { el: HTMLElement; text: string } | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>('[title], [data-tip]');
  // 對話框 portal 到 body，不在 .admin-layout 裡；後台開著時 body 掛著 admin-mode
  if (!el || !document.body.classList.contains('admin-mode')) return null;
  const title = el.getAttribute('title');
  if (title !== null) {
    el.removeAttribute('title');
    if (title) el.dataset.tip = title;
    else delete el.dataset.tip;
    // 只有圖示的按鈕：title 原本就是它的名字
    if (title && !el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby') && !el.textContent.trim()) {
      el.setAttribute('aria-label', title);
    }
  }
  const text = el.dataset.tip;
  return text ? { el, text } : null;
}

export default function AdminTooltips() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let timer = 0;
    let current: HTMLElement | null = null;

    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setTip(null);
    };

    const onOver = (e: PointerEvent) => {
      const found = takeTip(e.target);
      if (!found) return;
      if (found.el === current) return;
      hide();
      current = found.el;
      timer = window.setTimeout(() => {
        if (current !== found.el || !found.el.isConnected) return;
        setTip({ text: found.el.dataset.tip ?? found.text, rect: found.el.getBoundingClientRect() });
      }, SHOW_AFTER);
    };

    const onOut = (e: PointerEvent) => {
      if (!current) return;
      // 移到同一個元素裡的子元素不算離開
      if (e.relatedTarget instanceof Node && current.contains(e.relatedTarget)) return;
      hide();
    };

    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('pointerout', onOut, true);
    // 點下去、捲動、按鍵：提示都該讓開
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('keydown', hide, true);
    return () => {
      hide();
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('pointerout', onOut, true);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('scroll', hide, true);
      document.removeEventListener('keydown', hide, true);
    };
  }, []);

  if (!tip) return null;
  // key 跟著目標換：換一個元素就重量一次自己的大小與位置
  return createPortal(<TipBox key={`${tip.text}@${tip.rect.left},${tip.rect.top}`} tip={tip} />, document.body);
}

/** 先畫在元素正下方，量到自己的大小之後夾回視窗裡；下面放不下就放到上面 */
function TipBox({ tip }: { tip: Tip }) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  return (
    <div
      role="tooltip"
      className="adm-tip"
      data-ready={pos ? true : undefined}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
      ref={(node) => {
        if (!node || pos) return;
        const { width, height } = node.getBoundingClientRect();
        const r = tip.rect;
        const below = r.bottom + GAP;
        const top = below + height + MARGIN > window.innerHeight ? r.top - GAP - height : below;
        const left = Math.min(Math.max(MARGIN, r.left + r.width / 2 - width / 2), window.innerWidth - width - MARGIN);
        setPos({ left, top: Math.max(MARGIN, top) });
      }}
    >
      {tip.text}
    </div>
  );
}
