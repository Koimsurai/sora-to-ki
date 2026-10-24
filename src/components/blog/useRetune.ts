// 文章頁切語系：「重新收訊」。
//
// 換語系是換一條路由，整頁會重掛、捲動會被丟回頂端。這裡在舊語系那頁記下讀者在哪一章、
// 讀到那一章的幾成（各語系的章節結構一樣，標題文字不同），新語系那頁接手：
//   1. 直接放到同一章同一個比例的位置
//   2. 一條細線從畫面頂端往下掃，掃過的地方新語系的字才出現——只掃看得到的那一屏
// 目錄（OrbitToc）看到交接就直接畫滿、不重長；語言那一排的琥珀點從舊語系滑過來（ArticleControls）。
import { useEffect } from 'react';

interface Retune {
  postId: number;
  /** 切之前在哪個語系（琥珀點從那裡滑過來） */
  from: string;
  /** 讀到第幾個標題底下；-1 = 還在第一個標題之前 */
  heading: number;
  /** 視線還在內文之前（標題、摘要那一帶）：那一帶各語系差不多高，直接沿用原本的捲動位置 */
  above: boolean;
  scrollY: number;
  /** 在那一段讀到幾成（0–1） */
  frac: number;
  at: number;
}

/** 讀者的視線落在畫面的哪裡：跟目錄判斷「現在在哪一章」用同一條線 */
const LINE = 0.3;
/** 掃一屏的時間 */
const SCAN_MS = 600;
/** 交接只在換頁那一下有效：放太久的（例如切了語系卻沒換成）不要拿來用 */
const TTL_MS = 5000;

let pending: Retune | null = null;

const docTop = (el: Element) => el.getBoundingClientRect().top + window.scrollY;

/** 某一段的上下界：第 i 個標題到下一個標題（-1 是內文開頭到第一個標題，最後一段到內文結尾） */
function sectionOf(content: HTMLElement, heads: (HTMLElement | null)[], i: number): [number, number] {
  const start = docTop(content);
  const end = start + content.offsetHeight;
  const top = i < 0 ? start : heads[i] ? docTop(heads[i]) : start;
  const next = heads.slice(i + 1).find((h) => h !== null);
  return [top, next ? docTop(next) : end];
}

/** 舊語系那頁：切之前記下讀者在哪 */
export function setRetune(postId: number, from: string, content: HTMLElement | null, headingIds: string[]) {
  if (!content) return;
  const heads = headingIds.map((id) => document.getElementById(id));
  const line = window.scrollY + window.innerHeight * LINE;
  let heading = -1;
  heads.forEach((h, i) => {
    if (h && docTop(h) <= line) heading = i;
  });
  const [top, bottom] = sectionOf(content, heads, heading);
  const frac = Math.min(1, Math.max(0, (line - top) / Math.max(1, bottom - top)));
  const above = line < docTop(content);
  pending = { postId, from, heading, frac, above, scrollY: window.scrollY, at: performance.now() };
}

/** 這一頁是不是切語系換過來的（不消耗交接） */
export function peekRetune(postId: number): Retune | null {
  if (!pending || pending.postId !== postId || performance.now() - pending.at > TTL_MS) return null;
  return pending;
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** 新語系那頁：放回原位，再從畫面頂端往下掃一次 */
export function useRetune(
  postId: number,
  col: React.RefObject<HTMLElement | null>,
  content: React.RefObject<HTMLElement | null>,
  /** 跟 BlogPost 的 headings 同一份（useMemo 過、內文不變就不變），effect 才不會中途重跑 */
  headings: readonly { id: string }[],
) {
  useEffect(() => {
    const r = peekRetune(postId);
    const box = col.current;
    const body = content.current;
    if (!r || !box || !body) return;
    // 交接在掃完才清掉：開發模式的 StrictMode 會把 effect 先拆掉再跑一次，太早清第二次就接不到
    const done = () => {
      if (pending === r) pending = null;
    };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let line: HTMLDivElement | null = null;

    // 1. 放回原位
    const heads = headings.map((h) => document.getElementById(h.id));
    const [top, bottom] = sectionOf(body, heads, Math.min(r.heading, heads.length - 1));
    const y = r.above ? r.scrollY : top + r.frac * (bottom - top) - window.innerHeight * LINE;
    window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });

    // 2. 掃：遮罩的邊界跟著那條線往下，線以下的字先藏著
    if (!reduce) {
      const rect = box.getBoundingClientRect();
      line = document.createElement('div');
      line.className = 'ar-retune-line';
      line.style.left = `${rect.left}px`;
      line.style.width = `${rect.width}px`;
      document.body.append(line);
      box.classList.add('is-retuning');
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / SCAN_MS);
        const lineY = easeInOut(k) * window.innerHeight;
        // 遮罩在 .ar-col 自己的座標裡：畫面上的位置換成欄位裡的位置
        box.style.setProperty('--scan', `${lineY - box.getBoundingClientRect().top}px`);
        if (line) line.style.transform = `translateY(${lineY}px)`;
        if (k < 1) raf = requestAnimationFrame(step);
        else {
          finish();
          done();
        }
      };
      raf = requestAnimationFrame(step);
    } else {
      raf = requestAnimationFrame(done);
    }

    function finish() {
      box?.classList.remove('is-retuning');
      box?.style.removeProperty('--scan');
      line?.remove();
      line = null;
    }
    return () => {
      cancelAnimationFrame(raf);
      finish();
    };
  }, [postId, col, content, headings]);
}
