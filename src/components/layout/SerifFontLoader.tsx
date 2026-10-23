// 按頁裁字的瀏覽器端：收集畫面上用思源宋體的字，跟伺服器要還沒載過的那些（編碼見 lib/serifSubset）。
//
// 一開始掃整頁一次，之後只看新加進來或改過的節點（換頁、延遲載入的區塊、留言），所以換頁時只補
// 新出現的字。只收字型堆疊裡有 SERIF_FAMILY 的元素，等寬字、Instrument Serif 那些不算。
// 字重分兩桶：粗於 550 的進 600，其餘進 400。
//
// 訪客電腦裡已經裝了思源宋體就什麼都不下載：堆疊裡下一個就是本機的 "Noto Serif TC"。
// 簡中、日文、韓文頁不裁，這套字型的字形是繁中的，那幾個語系走各自的本機字型。
import { useEffect } from 'react';
import {
  MAX_CODEPOINTS,
  SERIF_FAMILY,
  isSerifCodepoint,
  subsetUrl,
  unicodeRangeOf,
  type SerifWeight,
} from '@/lib/serifSubset';

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'svg', 'CANVAS']);
const loaded: Record<SerifWeight, Set<number>> = { 400: new Set(), 600: new Set() };
const styleOf = new WeakMap<Element, SerifWeight | null>();

/** 這個元素的字用哪個字重的思源宋體；不用思源宋體回 null */
function weightOf(el: Element): SerifWeight | null {
  const known = styleOf.get(el);
  if (known !== undefined) return known;
  const cs = getComputedStyle(el);
  const w: SerifWeight | null = cs.fontFamily.includes(SERIF_FAMILY) ? (Number(cs.fontWeight) > 550 ? 600 : 400) : null;
  styleOf.set(el, w);
  return w;
}

function collect(root: Node, into: Record<SerifWeight, Set<number>>) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (
    let n = walker.currentNode.nodeType === Node.TEXT_NODE ? walker.currentNode : walker.nextNode();
    n;
    n = walker.nextNode()
  ) {
    const el = n.parentElement;
    if (!el || SKIP.has(el.tagName) || el.closest('pre, code, svg, textarea')) continue;
    const w = weightOf(el);
    if (w === null) continue;
    for (const ch of n.nodeValue ?? '') {
      const cp = ch.codePointAt(0) ?? 0;
      if (isSerifCodepoint(cp) && !loaded[w].has(cp)) into[w].add(cp);
    }
  }
}

function load(want: Record<SerifWeight, Set<number>>) {
  for (const w of [400, 600] as const) {
    const cps = [...want[w]].slice(0, MAX_CODEPOINTS);
    if (!cps.length) continue;
    for (const cp of cps) loaded[w].add(cp);
    const face = new FontFace(SERIF_FAMILY, `url(${subsetUrl(w, cps)}) format("woff2")`, {
      weight: String(w),
      unicodeRange: unicodeRangeOf(cps),
      display: 'swap',
    });
    document.fonts.add(face);
    // 失敗（伺服器沒有原檔、忙線）就讓這些字退回本機明體，下次出現時再試
    face.load().catch(() => {
      document.fonts.delete(face);
      for (const cp of cps) loaded[w].delete(cp);
    });
  }
}

/** 本機有沒有裝思源宋體：同一段字用「它，不然等寬」與「等寬」量寬度，不一樣就是有 */
function hasLocalNotoSerif(): boolean {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return false;
  const sample = '永字八法 明體 Serif';
  ctx.font = '32px monospace';
  const plain = ctx.measureText(sample).width;
  ctx.font = '32px "Noto Serif TC", monospace';
  return ctx.measureText(sample).width !== plain;
}

const wanted = () => {
  const lang = document.documentElement.lang;
  return !/^(zh-CN|ja|ko)/.test(lang);
};

export default function SerifFontLoader() {
  useEffect(() => {
    if (typeof FontFace === 'undefined' || hasLocalNotoSerif()) return;
    const pending: Record<SerifWeight, Set<number>> = { 400: new Set(), 600: new Set() };
    let timer = 0;
    const flush = () => {
      timer = 0;
      if (wanted()) load(pending);
      pending[400].clear();
      pending[600].clear();
    };
    const queue = (node: Node) => {
      collect(node, pending);
      if (!timer) timer = window.setTimeout(flush, 120);
    };
    queue(document.body);
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'characterData') queue(r.target);
        else for (const n of r.addedNodes) queue(n);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      mo.disconnect();
      window.clearTimeout(timer);
    };
  }, []);
  return null;
}
