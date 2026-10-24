// 按頁裁字的瀏覽器端：收集畫面上用思源宋體的字，跟伺服器要還沒載過的那些（編碼見 lib/serifSubset）。
//
// 一開始掃整頁一次，之後只看新加進來或改過的節點（換頁、延遲載入的區塊、留言），所以換頁時只補
// 新出現的字。只收字型堆疊裡有 SERIF_FAMILY 的元素，等寬字、Instrument Serif 那些不算。
// 字重分兩桶：粗於 550 的進 600，其餘進 400。
//
// 繁中、簡中、日文、韓文各裁自己那一套（字形各依各地的寫法，見 lib/serifSubset 的 SerifFace），
// 照 <html lang> 決定；英文頁用繁中那套的拉丁字形。每一套各自一個字族名，站內切語系時不會互搶。
// 訪客電腦裡已經裝了那一套思源宋體就什麼都不下載：堆疊裡下一個就是本機的 "Noto Serif TC／SC／JP／KR"。
import { useEffect } from 'react';
import {
  MAX_CODEPOINTS,
  SERIF_FACE_FAMILY,
  SERIF_FAMILY,
  isSerifCodepoint,
  serifFaceOf,
  subsetUrl,
  unicodeRangeOf,
  type SerifFace,
  type SerifWeight,
} from '@/lib/serifSubset';

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'svg', 'CANVAS']);
/** 每一套、每個字重已經載過（或正在載）的字 */
const loadedSets = new Map<string, Set<number>>();
const loadedOf = (face: SerifFace, w: SerifWeight) => {
  const id = `${face}-${w}`;
  let set = loadedSets.get(id);
  if (!set) {
    set = new Set();
    loadedSets.set(id, set);
  }
  return set;
};
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

function collect(root: Node, face: SerifFace, into: Record<SerifWeight, Set<number>>) {
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
      if (isSerifCodepoint(cp) && !loadedOf(face, w).has(cp)) into[w].add(cp);
    }
  }
}

function load(which: SerifFace, want: Record<SerifWeight, Set<number>>) {
  for (const w of [400, 600] as const) {
    const cps = [...want[w]].slice(0, MAX_CODEPOINTS);
    if (!cps.length) continue;
    const loaded = loadedOf(which, w);
    for (const cp of cps) loaded.add(cp);
    const face = new FontFace(SERIF_FACE_FAMILY[which], `url(${subsetUrl(w, cps, which)}) format("woff2")`, {
      weight: String(w),
      unicodeRange: unicodeRangeOf(cps),
      display: 'swap',
    });
    document.fonts.add(face);
    // 失敗（伺服器沒有原檔、忙線）就讓這些字退回本機明體，下次出現時再試
    face.load().catch(() => {
      document.fonts.delete(face);
      for (const cp of cps) loaded.delete(cp);
    });
  }
}

/** 本機的那一套叫什麼（Linux 的套件常叫 "Noto Serif CJK SC" 這種名字，兩個都試） */
const LOCAL_NAMES: Record<SerifFace, string[]> = {
  tc: ['Noto Serif TC', 'Noto Serif CJK TC'],
  sc: ['Noto Serif SC', 'Noto Serif CJK SC'],
  jp: ['Noto Serif JP', 'Noto Serif CJK JP'],
  kr: ['Noto Serif KR', 'Noto Serif CJK KR'],
};
const SAMPLE: Record<SerifFace, string> = {
  tc: '永字八法 明體 Serif',
  sc: '永字八法 明体 Serif',
  jp: '永字八法 明朝 Serif',
  kr: '영자팔법 명조 Serif',
};
const localKnown = new Map<SerifFace, boolean>();

/** 本機有沒有裝這一套思源宋體：同一段字用「它，不然等寬」與「等寬」量寬度，不一樣就是有 */
function hasLocal(face: SerifFace): boolean {
  const known = localKnown.get(face);
  if (known !== undefined) return known;
  const ctx = document.createElement('canvas').getContext('2d');
  let has = false;
  if (ctx) {
    ctx.font = '32px monospace';
    const plain = ctx.measureText(SAMPLE[face]).width;
    has = LOCAL_NAMES[face].some((name) => {
      ctx.font = `32px "${name}", monospace`;
      return ctx.measureText(SAMPLE[face]).width !== plain;
    });
  }
  localKnown.set(face, has);
  return has;
}

const faceNow = () => serifFaceOf(document.documentElement.lang);

export default function SerifFontLoader() {
  useEffect(() => {
    if (typeof FontFace === 'undefined') return;
    const pending: Record<SerifWeight, Set<number>> = { 400: new Set(), 600: new Set() };
    let pendingFace = faceNow();
    let timer = 0;
    const flush = () => {
      timer = 0;
      if (!hasLocal(pendingFace)) load(pendingFace, pending);
      pending[400].clear();
      pending[600].clear();
    };
    const queue = (node: Node) => {
      // 站內切了語系：先把上一個語系收集到的送出去，再照新的那套收
      const face = faceNow();
      if (face !== pendingFace) {
        if (timer) {
          window.clearTimeout(timer);
          flush();
        }
        pendingFace = face;
      }
      collect(node, face, pending);
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
