import { useEffect, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';

import './AdminScrollbars.css';

// 後台的捲軸（後台提案的「07 · 捲軸」）：原生捲軸整個收掉（見 AdminScrollbars.css），這裡畫一條浮在
// 內容上、不佔寬度的：1px 軌道、3px 的短條；一捲就出現、停下 1 秒後淡掉；游標靠近邊緣時短條加寬，
// 拖得動，點軌道會跳過去。
//
// 一個元件管全後台。不是每個容器各包一層 ScrollArea，是因為舊頁面的捲動容器散在十幾個元件與
// shadcn 的對話框裡，逐一包要改一堆 DOM，漏一個就冒出原生捲軸。改成在 document 上用捕獲階段聽
// scroll（scroll 不冒泡，但捕獲拿得到）：誰在捲就畫誰的。
//
// 元素本身照樣是原生捲動——滾輪、觸控板、鍵盤、捲動還原都沒動到；這條只是畫出來的指示與把手，
// 所以整層 aria-hidden。Monaco 有自己畫的捲軸，它底下的東西不管。

type Axis = 'x' | 'y';
type Phase = 'idle' | 'shown' | 'hover' | 'drag';

interface Bar {
  axis: Axis;
  /** 軌道沿捲動方向的起點與長度（視窗座標） */
  start: number;
  length: number;
  /** 軌道貼著的那條邊：y 軸是容器右緣、x 軸是下緣（已內縮） */
  edge: number;
  thumbStart: number;
  thumbLength: number;
}

interface View {
  bars: Bar[];
  phase: Phase;
}

/** 軌道離容器邊緣多遠 */
const INSET = 6;
/** 軌道可以點、可以抓的寬度（線本身只有 1px） */
const HIT = 12;
/** 游標離邊緣多近算「靠近」 */
const NEAR = 14;
const HIDE_AFTER = 1000;
const MIN_THUMB = 24;

const rootScroller = () => document.scrollingElement as HTMLElement | null;

function overflowAllows(el: HTMLElement, axis: Axis): boolean {
  if (el === rootScroller()) return true;
  const v = getComputedStyle(el)[axis === 'y' ? 'overflowY' : 'overflowX'];
  return v === 'auto' || v === 'scroll' || v === 'overlay';
}

function scrollRange(el: HTMLElement, axis: Axis): number {
  return axis === 'y' ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
}

const scrolls = (el: HTMLElement, axis: Axis) => scrollRange(el, axis) > 1 && overflowAllows(el, axis);

function rectOf(el: HTMLElement): DOMRect {
  if (el !== rootScroller()) return el.getBoundingClientRect();
  const doc = document.documentElement;
  return new DOMRect(0, 0, doc.clientWidth, doc.clientHeight);
}

function measure(el: HTMLElement): Bar[] {
  const r = rectOf(el);
  const bars: Bar[] = [];
  for (const axis of ['y', 'x'] as const) {
    if (!scrolls(el, axis)) continue;
    const view = axis === 'y' ? el.clientHeight : el.clientWidth;
    const range = scrollRange(el, axis);
    const pos = axis === 'y' ? el.scrollTop : el.scrollLeft;
    const start = (axis === 'y' ? r.top : r.left) + INSET;
    const length = (axis === 'y' ? r.height : r.width) - INSET * 2;
    if (length < MIN_THUMB * 2) continue;
    const thumbLength = Math.max(MIN_THUMB, (length * view) / (view + range));
    bars.push({
      axis,
      start,
      length,
      edge: (axis === 'y' ? r.right : r.bottom) - INSET,
      thumbStart: start + ((length - thumbLength) * pos) / range,
      thumbLength,
    });
  }
  return bars;
}

/** 游標底下最近的那個會捲的容器；都不會捲就看整頁 */
function scrollerAt(node: Element | null): HTMLElement | null {
  if (node?.closest('.monaco-editor')) return null;
  for (let el = node; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    if (el instanceof HTMLElement && (scrolls(el, 'y') || scrolls(el, 'x'))) return el;
  }
  const root = rootScroller();
  return root && (scrolls(root, 'y') || scrolls(root, 'x')) ? root : null;
}

function nearEdge(el: HTMLElement, x: number, y: number): boolean {
  const r = rectOf(el);
  const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  return inside && ((scrolls(el, 'y') && r.right - x <= NEAR) || (scrolls(el, 'x') && r.bottom - y <= NEAR));
}

/** 捲軸的狀態機。放在 React 外面：捲動與游標事件一秒幾十次，只有要重畫時才 setState */
class ScrollbarController {
  private target: HTMLElement | null = null;
  private phase: Phase = 'idle';
  private hideTimer = 0;
  private frame = 0;
  private moveFrame = 0;
  private lastMove: PointerEvent | null = null;
  private drag: { axis: Axis; from: number; scroll: number; ratio: number } | null = null;

  constructor(private readonly render: Dispatch<SetStateAction<View>>) {}

  attach() {
    document.documentElement.classList.add('admin-scroll');
    document.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
    document.addEventListener('pointermove', this.onMove, { passive: true });
    window.addEventListener('resize', this.onResize);
  }

  detach() {
    document.documentElement.classList.remove('admin-scroll');
    document.removeEventListener('scroll', this.onScroll, { capture: true });
    document.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('resize', this.onResize);
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.moveFrame);
    clearTimeout(this.hideTimer);
  }

  private paint = () => {
    this.frame = 0;
    const el = this.target;
    this.render({ bars: el?.isConnected ? measure(el) : [], phase: this.phase });
  };

  private request() {
    if (!this.frame) this.frame = requestAnimationFrame(this.paint);
  }

  private setPhase(phase: Phase) {
    this.phase = phase;
    this.request();
  }

  private hideLater() {
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      if (this.phase === 'shown') this.setPhase('idle');
    }, HIDE_AFTER);
  }

  private onScroll = (e: Event) => {
    const t = e.target;
    const el = t === document ? rootScroller() : t instanceof HTMLElement ? t : null;
    if (!el || el.closest('.monaco-editor')) return;
    this.target = el;
    if (this.phase === 'idle') this.phase = 'shown';
    this.request();
    if (this.phase === 'shown') this.hideLater();
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return; // 觸控沒有「滑過」，捲的時候自然會出現
    this.lastMove = e;
    if (!this.moveFrame) this.moveFrame = requestAnimationFrame(this.checkHover);
  };

  private checkHover = () => {
    this.moveFrame = 0;
    const e = this.lastMove;
    if (!e || this.drag) return;
    const node = e.target instanceof Element ? e.target : null;
    if (node?.closest('.adm-sb')) {
      clearTimeout(this.hideTimer);
      if (this.phase !== 'hover') this.setPhase('hover');
      return;
    }
    const el = scrollerAt(node);
    if (el && nearEdge(el, e.clientX, e.clientY)) {
      clearTimeout(this.hideTimer);
      this.target = el;
      this.setPhase('hover');
    } else if (this.phase === 'hover') {
      this.setPhase('shown');
      this.hideLater();
    }
  };

  private onResize = () => {
    if (this.phase !== 'idle') this.request();
  };

  /** 點軌道：短條的中心跳到點的那裡 */
  jump(e: ReactPointerEvent<HTMLElement>, bar: Bar) {
    const el = this.target;
    if (!el || e.button !== 0) return;
    e.preventDefault();
    const at = (bar.axis === 'y' ? e.clientY : e.clientX) - bar.start - bar.thumbLength / 2;
    const ratio = Math.min(1, Math.max(0, at / (bar.length - bar.thumbLength)));
    const pos = ratio * scrollRange(el, bar.axis);
    el.scrollTo(bar.axis === 'y' ? { top: pos } : { left: pos });
  }

  startDrag(e: ReactPointerEvent<HTMLElement>, bar: Bar) {
    const el = this.target;
    if (!el || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation(); // 不要再被軌道當成「點軌道」
    this.drag = {
      axis: bar.axis,
      from: bar.axis === 'y' ? e.clientY : e.clientX,
      scroll: bar.axis === 'y' ? el.scrollTop : el.scrollLeft,
      ratio: scrollRange(el, bar.axis) / Math.max(1, bar.length - bar.thumbLength),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    clearTimeout(this.hideTimer);
    this.setPhase('drag');
  }

  moveDrag(e: ReactPointerEvent<HTMLElement>) {
    const d = this.drag;
    const el = this.target;
    if (!d || !el) return;
    const pos = d.scroll + ((d.axis === 'y' ? e.clientY : e.clientX) - d.from) * d.ratio;
    if (d.axis === 'y') el.scrollTop = pos;
    else el.scrollLeft = pos;
  }

  endDrag(e: ReactPointerEvent<HTMLElement>) {
    if (!this.drag) return;
    this.drag = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    this.setPhase('shown');
    this.hideLater();
  }
}

export default function AdminScrollbars() {
  const [view, setView] = useState<View>({ bars: [], phase: 'idle' });
  const [ctl] = useState(() => new ScrollbarController(setView));

  useEffect(() => {
    ctl.attach();
    return () => ctl.detach();
  }, [ctl]);

  return createPortal(
    <div className="adm-sb-layer" data-phase={view.phase} aria-hidden="true">
      {view.bars.map((bar) => (
        <div
          key={bar.axis}
          className="adm-sb"
          data-axis={bar.axis}
          style={
            bar.axis === 'y'
              ? { left: bar.edge - HIT, top: bar.start, height: bar.length }
              : { top: bar.edge - HIT, left: bar.start, width: bar.length }
          }
          onPointerDown={(e) => ctl.jump(e, bar)}
        >
          <div
            className="adm-sb-thumb"
            style={
              bar.axis === 'y'
                ? { top: bar.thumbStart - bar.start, height: bar.thumbLength }
                : { left: bar.thumbStart - bar.start, width: bar.thumbLength }
            }
            onPointerDown={(e) => ctl.startDrag(e, bar)}
            onPointerMove={(e) => ctl.moveDrag(e)}
            onPointerUp={(e) => ctl.endDrag(e)}
            onPointerCancel={(e) => ctl.endDrag(e)}
          />
        </div>
      ))}
    </div>,
    document.body,
  );
}
