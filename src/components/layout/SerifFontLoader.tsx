// 按頁裁字的瀏覽器端：收集畫面上用裁字字型的字，跟伺服器要還沒載過的那些（編碼見 lib/serifSubset）。
//
// 一開始掃整頁一次，之後只看新加進來或改過的節點（換頁、延遲載入的區塊、留言），所以換頁時只補
// 新出現的字。只收字型堆疊第一個是裁字字型（Koim Serif／Sans／Kai／Modern）的元素，等寬字、
// Instrument Serif 那些不算。字重分兩桶：粗於 550 的進 600，其餘進 400。
//
// 字型有四種風格：宋體是站上的主字型，另外三種是文章的「字體」切換（html[data-blog-font]）。
// 讀者換了字體，DOM 不會變、只有計算出來的字型變了，所以那個屬性一變就整頁重掃一次。
//
// 繁中、簡中、日文、韓文各裁自己那一套（字形各依各地的寫法，見 lib/serifSubset 的 SerifFace），
// 照 <html lang> 決定；英文頁用繁中那套的拉丁字形。每一套各自一個字族名，站內切語系時不會互搶。
// 訪客電腦裡已經裝了那一支字就什麼都不下載：堆疊裡下一個就是本機的那一支。
import { useEffect } from 'react';
import {
  MAX_CODEPOINTS,
  fallbackFamilyOf,
  familyOf,
  isHanCodepoint,
  isSerifCodepoint,
  serifFaceOf,
  styleOfFamily,
  subsetUrl,
  unicodeRangeOf,
  type FontStyle,
  type SerifFace,
  type SerifWeight,
} from '@/lib/serifSubset';

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'svg', 'CANVAS']);
/** 每一種風格、每一套、每個字重已經載過（或正在載）的字 */
const loadedSets = new Map<string, Set<number>>();
const loadedOf = (style: FontStyle, face: SerifFace, w: SerifWeight) => {
  const id = `${style}-${face}-${w}`;
  let set = loadedSets.get(id);
  if (!set) {
    set = new Set();
    loadedSets.set(id, set);
  }
  return set;
};

interface Use {
  style: FontStyle;
  weight: SerifWeight;
}
/** 元素 → 它的字用哪種風格、哪個字重（不用裁字字型是 null）。讀者換字體時整個換掉重算 */
let useOf = new WeakMap<Element, Use | null>();

function usesOf(el: Element): Use | null {
  const known = useOf.get(el);
  if (known !== undefined) return known;
  const cs = getComputedStyle(el);
  const style = styleOfFamily(cs.fontFamily.split(',')[0] ?? '');
  const use: Use | null = style ? { style, weight: Number(cs.fontWeight) > 550 ? 600 : 400 } : null;
  useOf.set(el, use);
  return use;
}

/** 收集到的字：`風格:字重` → 碼位 */
type Pending = Map<string, Set<number>>;

function collect(root: Node, face: SerifFace, into: Pending) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (
    let n = walker.currentNode.nodeType === Node.TEXT_NODE ? walker.currentNode : walker.nextNode();
    n;
    n = walker.nextNode()
  ) {
    const el = n.parentElement;
    if (!el || SKIP.has(el.tagName) || el.closest('pre, code, svg, textarea')) continue;
    const use = usesOf(el);
    if (!use) continue;
    const loaded = loadedOf(use.style, face, use.weight);
    const key = `${use.style}:${use.weight}`;
    let set = into.get(key);
    for (const ch of n.nodeValue ?? '') {
      const cp = ch.codePointAt(0) ?? 0;
      if (!isSerifCodepoint(cp) || loaded.has(cp)) continue;
      if (!set) {
        set = new Set();
        into.set(key, set);
      }
      set.add(cp);
    }
  }
}

function load(style: FontStyle, which: SerifFace, w: SerifWeight, want: Set<number>) {
  const cps = [...want].slice(0, MAX_CODEPOINTS);
  if (!cps.length) return;
  const loaded = loadedOf(style, which, w);
  for (const cp of cps) loaded.add(cp);
  const face = new FontFace(familyOf(style, which), `url(${subsetUrl(w, cps, which, style)}) format("woff2")`, {
    weight: String(w),
    unicodeRange: unicodeRangeOf(cps),
    display: 'swap',
  });
  document.fonts.add(face);
  // 失敗（伺服器沒有原檔、忙線）就讓這些字退回堆疊裡的下一個字型，下次出現時再試
  face.load().catch(() => {
    document.fonts.delete(face);
    for (const cp of cps) loaded.delete(cp);
  });
  if (which === 'tc') addFallback(style, w, cps);
}

/**
 * 繁中那套缺的字（簡體留言裡的帅、满、关⋯）從簡中那套補，字族見 serifSubset 的 fallbackFamilyOf。
 * 這個字型**不主動載**：它在 CSS 堆疊裡排在繁中那套後面，瀏覽器只有在繁中那套找不到某個字時才會去要它，
 * 所以整頁都是繁體字的時候不會多一個請求。伺服器只裁繁中缺的字（`x=tc`），要了也只有幾 KB
 */
function addFallback(style: FontStyle, w: SerifWeight, cps: number[]) {
  const family = fallbackFamilyOf(style);
  const han = cps.filter(isHanCodepoint);
  if (!family || !han.length) return;
  document.fonts.add(
    new FontFace(family, `url(${subsetUrl(w, han, 'sc', style, 'tc')}) format("woff2")`, {
      weight: String(w),
      unicodeRange: unicodeRangeOf(han),
      display: 'swap',
    }),
  );
}

/** 本機的那一支叫什麼（同 index.css 各風格堆疊裡排在裁字字型後面的那些；Linux 的套件常叫 "Noto Serif CJK SC" 這種名字） */
const LOCAL_NAMES: Record<FontStyle, Record<SerifFace, string[]>> = {
  serif: {
    tc: ['Noto Serif TC', 'Noto Serif CJK TC'],
    sc: ['Noto Serif SC', 'Noto Serif CJK SC'],
    jp: ['Noto Serif JP', 'Noto Serif CJK JP'],
    kr: ['Noto Serif KR', 'Noto Serif CJK KR'],
  },
  sans: {
    tc: ['Noto Sans TC', 'Noto Sans CJK TC'],
    sc: ['Noto Sans SC', 'Noto Sans CJK SC'],
    jp: ['Noto Sans JP', 'Noto Sans CJK JP'],
    kr: ['Noto Sans KR', 'Noto Sans CJK KR'],
  },
  kai: { tc: ['LXGW WenKai TC'], sc: ['LXGW WenKai'], jp: ['Klee One'], kr: ['Gowun Batang'] },
  modern: { tc: ['MiSans'], sc: ['MiSans'], jp: ['BIZ UDPGothic'], kr: ['Pretendard Variable', 'Pretendard'] },
};
const SAMPLE: Record<SerifFace, string> = {
  tc: '永字八法 明體 Serif',
  sc: '永字八法 明体 Serif',
  jp: '永字八法 明朝 Serif',
  kr: '영자팔법 명조 Serif',
};
const localKnown = new Map<string, boolean>();

/** 本機有沒有裝這一支：同一段字用「它，不然等寬」與「等寬」量寬度，不一樣就是有 */
function hasLocal(style: FontStyle, face: SerifFace): boolean {
  const id = `${style}-${face}`;
  const known = localKnown.get(id);
  if (known !== undefined) return known;
  const ctx = document.createElement('canvas').getContext('2d');
  let has = false;
  if (ctx) {
    ctx.font = '32px monospace';
    const plain = ctx.measureText(SAMPLE[face]).width;
    has = LOCAL_NAMES[style][face].some((name) => {
      ctx.font = `32px "${name}", monospace`;
      return ctx.measureText(SAMPLE[face]).width !== plain;
    });
  }
  localKnown.set(id, has);
  return has;
}

const faceNow = () => serifFaceOf(document.documentElement.lang);

export default function SerifFontLoader() {
  useEffect(() => {
    if (typeof FontFace === 'undefined') return;
    const pending: Pending = new Map();
    // 新加進來的節點先記著，計時器到了才掃：掃的時候要讀每個元素的計算樣式，當場掃等於在 React 剛掛上一批內容
    // 的那一幀裡多算一次樣式（站內換頁進文章時，內文一幀一批地掛，每批都會多這一下）
    let roots: Node[] = [];
    let pendingFace = faceNow();
    let timer = 0;
    const flush = () => {
      timer = 0;
      for (const node of roots) collect(node, pendingFace, pending);
      roots = [];
      for (const [key, set] of pending) {
        const [style, w] = key.split(':') as [FontStyle, string];
        if (!hasLocal(style, pendingFace)) load(style, pendingFace, Number(w) as SerifWeight, set);
      }
      pending.clear();
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
      // 整頁重掃已經排著的話，底下的節點不用另外掃
      if (node === document.body) roots = [node];
      else if (roots[0] !== document.body) roots.push(node);
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
    // 讀者換了文章字體：記下來的「誰用哪種字型」全部作廢，整頁重掃。
    // 站內切語系也要整頁重掃：React 先把字換成新語系、<html lang> 稍後才改，那一瞬間收到的
    // 新字（簡體的「记」「关」）是照舊的那套去要的（繁中的字型裡沒有它們）；lang 換過來之後
    // 那些節點不會再變，新的那套就永遠沒要到，頂欄的字退回系統字型
    const fontMo = new MutationObserver(() => {
      useOf = new WeakMap();
      queue(document.body);
    });
    fontMo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-blog-font', 'lang'] });
    return () => {
      mo.disconnect();
      fontMo.disconnect();
      window.clearTimeout(timer);
    };
  }, []);
  return null;
}
