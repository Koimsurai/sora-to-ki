// 首頁的字卡與常駐小標註畫進 3D 那張 canvas（HTML-in-Canvas，lib/htmlInCanvas）：StarfieldGpu 與 HomeOrbit 之間的線。
//
//   StarfieldGpu：登記自己的 canvas 與送訊息給 worker 的方法；worker 回報畫得了（WebGPU）才算接上
//   HomeOrbit：接上了就把字卡與標註 portal 進那張 canvas、把元素交給這裡；之後每次 paint 這裡拍下有變的送給 worker。
//             每幀只送「哪一顆亮著」，不再量尺寸、寫樣式
//   worker：每幀把字與衛星在同一張圖裡畫（lib/labelOverlay），算出它們在畫面上的框送回來，這裡交給瀏覽器
//           （updateElementGeometry），點擊與鍵盤焦點才落得到畫出來的位置
//
// 首頁主執行緒最貴的就是每幀改這十幾個元素的樣式（每改一次瀏覽器就要重算它們的樣式）；
// 交給 worker 之後，主執行緒只剩算亮度。字跟衛星同一幀畫，也不會再有「位置傳到主執行緒時已經晚一點」的落差。

/** 一個字卡或標註在畫面上的框：左上角（CSS 像素）。null 是這一幀看不到，點不到 */
export type LabelBox = { x: number; y: number } | null;

export interface LabelGeometry {
  cards: LabelBox[];
  tags: LabelBox[];
}

/** 字卡的一行：在內容框裡的上緣與寬（CSS 像素） */
interface CardLine {
  top: number;
  w: number;
}

/** 送給 worker 的一張快照 */
export interface LabelImage {
  kind: 'card' | 'tag';
  i: number;
  image: ElementImage;
  /** border box 的寬高（CSS 像素） */
  w: number;
  h: number;
  /**
   * 字卡：快照外圍多留的一圈（鍵盤焦點的外框畫在那裡，HomeOrbit.css 的 .horbit-label.is-drawn）。
   * 標註：margin（點擊區比字大一圈）——DOM 版的位置是含 margin 算的，畫的是 border box
   */
  ox: number;
  oy: number;
  /** 字卡的每一行（各自照衛星的位置對齊，見 lib/orbitLabels 的 cardAt） */
  lines?: CardLine[];
}

/** 每幀從主執行緒送過去的：每顆衛星多亮、是不是正在換頁 */
export interface LabelShow {
  glow: number[];
  leaving: boolean;
  /** 減少動態：淡入淡出不跑 */
  still: boolean;
}

interface Host {
  canvas: HTMLCanvasElement;
  post(message: unknown, transfer?: Transferable[]): void;
}

let host: Host | null = null;
let ready = false;
let cards: HTMLElement[] = [];
let tags: HTMLElement[] = [];
let lastShow = '';
const listeners = new Set<() => void>();
const emit = () => {
  for (const fn of listeners) fn();
};

/** StarfieldGpu：建好 worker 時登記，收掉（含 device lost 重建）時給 null */
export function setCanvasHost(next: Host | null) {
  host = next;
  ready = false;
  cards = [];
  tags = [];
  lastShow = '';
  emit();
}

/** StarfieldGpu：worker 回報畫不畫得了（只有 WebGPU 的路徑做了） */
export function setCanvasDrawables(ok: boolean) {
  ready = ok;
  emit();
}

export function subscribeCanvasHost(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 字卡與標註要 portal 進去的那張 canvas；還沒接上（或不支援）是 null */
export function canvasHost(): HTMLCanvasElement | null {
  return ready && host ? host.canvas : null;
}

const px = (v: string) => Number.parseFloat(v) || 0;

function describe(kind: LabelImage['kind'], i: number, el: HTMLElement, image: ElementImage): LabelImage {
  const style = getComputedStyle(el);
  if (kind === 'tag')
    return { kind, i, image, w: el.offsetWidth, h: el.offsetHeight, ox: px(style.marginLeft), oy: px(style.marginTop) };
  const ox = px(style.paddingLeft);
  const oy = px(style.paddingTop);
  return {
    kind,
    i,
    image,
    w: el.offsetWidth,
    h: el.offsetHeight,
    ox,
    oy,
    lines: [...el.children].map((line) =>
      line instanceof HTMLElement ? { top: line.offsetTop - oy, w: line.offsetWidth } : { top: 0, w: 0 },
    ),
  };
}

/** HomeOrbit：字卡與標註已經在 canvas 裡了。每次 paint 拍下有變的那幾個送給 worker；回傳的函式是收掉 */
export function attachLabels(cardEls: HTMLElement[], tagEls: HTMLElement[]): () => void {
  const h = host;
  if (!h || !ready) return () => undefined;
  const { canvas } = h;
  cards = cardEls;
  tags = tagEls;
  const all = [
    ...cardEls.map((el, i) => ({ kind: 'card' as const, i, el })),
    ...tagEls.map((el, i) => ({ kind: 'tag' as const, i, el })),
  ];
  const send = (e?: Event) => {
    const changed = (e as { changedElements?: Element[] } | undefined)?.changedElements;
    const out: LabelImage[] = [];
    let missed = false;
    for (const { kind, i, el } of all) {
      if (changed?.length && !changed.includes(el)) continue;
      let image: ElementImage | undefined;
      try {
        image = canvas.captureElementImage?.(el);
      } catch {
        // 還沒有 paint record（剛放進去那一刻）：下一幀再拍
        missed = true;
      }
      if (image) out.push(describe(kind, i, el, image));
    }
    if (out.length)
      h.post(
        { type: 'labels', labels: out },
        out.map((t) => t.image as unknown as Transferable),
      );
    if (missed) canvas.requestPaint?.();
  };
  canvas.addEventListener('paint', send);
  canvas.requestPaint?.();
  return () => {
    canvas.removeEventListener('paint', send);
    for (const { el } of all) canvas.clearElementGeometry?.(el);
    if (cards === cardEls) cards = [];
    if (tags === tagEls) tags = [];
    lastShow = '';
    h.post({ type: 'labelShow', show: { glow: [], leaving: false, still: false } satisfies LabelShow });
  };
}

/** HomeOrbit：每幀的亮度；淡入淡出與擺位置由 worker 自己做。值沒變不送 */
export function setLabelShow(show: LabelShow) {
  if (!host || !ready) return;
  const key = `${show.glow.join(',')}|${show.leaving ? 1 : 0}${show.still ? 1 : 0}`;
  if (key === lastShow) return;
  lastShow = key;
  host.post({ type: 'labelShow', show });
}

/** StarfieldGpu 轉來 worker 算的框：交給瀏覽器做點擊與輔助技術的位置 */
export function applyLabelGeometry(geometry: LabelGeometry) {
  const canvas = host?.canvas;
  if (!canvas) return;
  const apply = (els: HTMLElement[], boxes: LabelBox[]) => {
    for (const [i, box] of boxes.entries()) {
      const el = els[i] as HTMLElement | undefined;
      if (!el) continue;
      if (box) canvas.updateElementGeometry?.(el, { canvasTransform: { a: 1, b: 0, c: 0, d: 1, e: box.x, f: box.y } });
      else canvas.clearElementGeometry?.(el);
    }
  };
  apply(cards, geometry.cards);
  apply(tags, geometry.tags);
}

/** worker 上傳失敗（快照還沒準備好）：再拍一次 */
export function retryLabels() {
  host?.canvas.requestPaint?.();
}
