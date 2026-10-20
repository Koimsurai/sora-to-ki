/**
 * 書櫃「知識星圖」的版面：每本書是一顆星，系列書連成星座，同類的書聚成星團。
 *
 * 純函式、不碰 DOM：同一份書單永遠排出同一張天空（位置由書的 id 與系列名決定，不用亂數），
 * 所以 SSR 與 hydrate 一致，新增一本書也不會讓其他星星整片跳位置。
 *
 * 座標系是固定的 1000 × 600（`SKY_W` × `SKY_H`），元件再用百分比縮放到實際寬度。
 */

export const SKY_W = 1000;
export const SKY_H = 600;

export interface ConstellationBook {
  id: number;
  title: string;
  categories?: string | null;
  reading_status?: string | null;
}

export type GroupKey = 'fantasy' | 'literature' | 'life' | 'other';

export interface Series {
  name: string;
  index: number;
}

/**
 * 從書名認出系列：「波西傑克森 5: 終極天神」→ 波西傑克森 #5、「【套書】馭光者3 破碎眼」→ 馭光者 #3。
 *
 * 系列名不能含標點：否則「世界盡頭的咖啡館：這一生…（全球每19秒售出1本！）」會被當成
 * 「世界盡頭的咖啡館…全球每」第 19 集。只認書名開頭、緊接著 1～2 位數字的寫法。
 */
export function seriesOf(title: string): Series | null {
  const t = title.replace(/^【[^】]*】\s*/, '').trim();
  const m = /^([^：:（(，,、！？!?\s\d【】][^：:（(，,、！？!?\d【】]{1,19}?)\s*(\d{1,2})(?!\d)/.exec(t);
  if (!m) return null;
  return { name: m[1].trim(), index: Number(m[2]) };
}

/**
 * 分類歸成四個星團。Google Books 給的分類很雜（Fiction / American fiction / 日本文學
 * 都是同一件事），而且是英中混雜的自由字串，所以用關鍵字比對，比對不到就歸「其他」。
 */
export function groupOf(categories?: string | null): GroupKey {
  const c = (categories ?? '').toLowerCase();
  if (!c) return 'other';
  if (/fantasy|juvenile|奇幻|科幻|science fiction/.test(c)) return 'fantasy';
  if (/fiction|literature|novel|文學|小說/.test(c)) return 'literature';
  if (/self-help|psycholog|humor|fortune|philosoph|business|心理|勵志|成長|生活|哲學|商業|幽默/.test(c)) return 'life';
  return 'other';
}

/** FNV-1a：把字串變成穩定的 32-bit 整數，拿來決定方向與相位（不是安全用途）。 */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface PlacedStar<B> {
  book: B;
  x: number;
  y: number;
  group: GroupKey;
  series: Series | null;
}

interface ConstellationLine {
  series: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** 兩端的書 id——篩選時連線跟著兩顆星一起變暗。 */
  ids: [number, number];
}

interface Cluster {
  key: GroupKey;
  x: number;
  y: number;
  count: number;
}

interface SeriesLabel {
  name: string;
  x: number;
  y: number;
}

export interface Constellation<B> {
  stars: PlacedStar<B>[];
  lines: ConstellationLine[];
  clusters: Cluster[];
  seriesLabels: SeriesLabel[];
}

/**
 * 星團的錨點，依星團大小由大到小取用。刻意不放在正中央、也不排成一列：
 * 天空要留白，星團之間的空隙本身就是構圖的一部分。
 */
const ANCHORS: readonly [number, number][] = [
  [300, 270],
  [700, 220],
  [720, 450],
  [290, 470],
];

const MARGIN_X = 70;
const MARGIN_Y = 55;
/** 兩顆星至少要隔這麼遠，標籤才不會疊在一起。 */
const MIN_DIST = 54;
export const MIN_DIST_FOR_TEST = MIN_DIST;

export function layoutConstellation<B extends ConstellationBook>(books: readonly B[]): Constellation<B> {
  // 系列：同名至少兩本才算（只有一集的「埃及守護神1」就是一顆單獨的星）
  const bySeries = new Map<string, { book: B; s: Series }[]>();
  for (const book of books) {
    const s = seriesOf(book.title);
    if (!s) continue;
    const list = bySeries.get(s.name) ?? [];
    list.push({ book, s });
    bySeries.set(s.name, list);
  }
  const seriesOfBook = new Map<number, Series>();
  for (const [, list] of bySeries) {
    if (list.length < 2) continue;
    for (const { book, s } of list) seriesOfBook.set(book.id, s);
  }

  // 系列整組歸到同一個星團（取系列第一集的分類），不然一套書會被拆到兩片天空
  const seriesGroup = new Map<string, GroupKey>();
  for (const [name, list] of bySeries) {
    if (list.length < 2) continue;
    const first = [...list].sort((a, b) => a.s.index - b.s.index)[0];
    seriesGroup.set(name, groupOf(first.book.categories));
  }

  const groups = new Map<GroupKey, B[]>();
  for (const book of [...books].sort((a, b) => a.id - b.id)) {
    const s = seriesOfBook.get(book.id);
    const g = s ? (seriesGroup.get(s.name) ?? 'other') : groupOf(book.categories);
    const list = groups.get(g) ?? [];
    list.push(book);
    groups.set(g, list);
  }

  // 大的星團拿前面的錨點；同樣大小時照固定順序，結果才穩定
  const order: GroupKey[] = ['fantasy', 'literature', 'life', 'other'];
  const ranked = [...groups.entries()].sort(
    (a, b) => b[1].length - a[1].length || order.indexOf(a[0]) - order.indexOf(b[0]),
  );

  const stars: PlacedStar<B>[] = [];
  const clusters: Cluster[] = [];

  ranked.forEach(([key, members], gi) => {
    const [ax, ay] = ANCHORS[gi % ANCHORS.length];
    clusters.push({ key, x: ax, y: ay, count: members.length });

    // 1) 這個星團裡的系列：沿著一個方向排成鋸齒，像仙后座那種 W 形
    const seriesNames = [...new Set(members.map((b) => seriesOfBook.get(b.id)?.name).filter(Boolean))] as string[];
    seriesNames.sort();
    seriesNames.forEach((name, si) => {
      const list = members
        .filter((b) => seriesOfBook.get(b.id)?.name === name)
        .sort((a, b) => (seriesOfBook.get(a.id)?.index ?? 0) - (seriesOfBook.get(b.id)?.index ?? 0));
      const angle = ((hash(name) % 70) - 35) * (Math.PI / 180); // 大致水平，帶一點傾斜
      const step = 62;
      const span = step * (list.length - 1);
      // 第二個系列往錨點下方錯開，兩條星座不會疊在同一條線上
      const cx = ax + (si % 2 === 0 ? 0 : 30);
      const cy = ay + (si === 0 ? -40 : 60 * si);
      list.forEach((book, i) => {
        const along = i * step - span / 2;
        const zig = i % 2 === 0 ? -16 : 16;
        stars.push({
          book,
          x: cx + along * Math.cos(angle) - zig * Math.sin(angle),
          y: cy + along * Math.sin(angle) + zig * Math.cos(angle),
          group: key,
          series: seriesOfBook.get(book.id) ?? null,
        });
      });
    });

    // 2) 其餘的書：黃金角螺旋散在錨點周圍（向日葵種子的排法，密度均勻、不會排成格子）
    const singles = members.filter((b) => !seriesOfBook.has(b.id));
    const phase = (hash(key) % 360) * (Math.PI / 180);
    const r0 = seriesNames.length ? 95 : 30;
    singles.forEach((book, i) => {
      const r = r0 + 34 * Math.sqrt(i + 1);
      const th = phase + i * 2.39996; // 137.5°
      stars.push({ book, x: ax + r * Math.cos(th), y: ay + r * Math.sin(th) * 0.8, group: key, series: null });
    });
  });

  // 星團名稱寫在錨點上，是不會動的障礙物：星星（連同牠底下的書名）要讓開
  const obstacles: Rect[] = clusters.map((c) => labelRect(c.x, c.y, CLUSTER_LABEL_W));

  // 3) 鬆弛：太近的兩顆互相推開、壓到名稱的推出去，再夾回畫布內。固定迭代次數，結果是確定的。
  for (let iter = 0; iter < 60; iter++) {
    for (const s of stars) pushOutOf(s, obstacles);
    for (let i = 0; i < stars.length; i++) {
      for (let j = i + 1; j < stars.length; j++) {
        const a = stars[i];
        const b = stars[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= MIN_DIST) continue;
        if (d < 0.01) {
          // 完全重疊時用 id 決定推開的方向，不能用亂數
          dx = Math.cos(a.book.id + b.book.id);
          dy = Math.sin(a.book.id + b.book.id);
          d = 1;
        }
        const push = (MIN_DIST - d) / 2;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
      }
    }
    for (const s of stars) {
      pushOutOfCorner(s, LEGEND_CORNER);
      s.x = Math.min(SKY_W - MARGIN_X, Math.max(MARGIN_X, s.x));
      s.y = Math.min(SKY_H - MARGIN_Y, Math.max(MARGIN_Y, s.y));
    }
  }

  // 連線與系列名稱要在鬆弛之後算，才會接在星星最後的位置上
  const lines: ConstellationLine[] = [];
  const seriesLabels: SeriesLabel[] = [];
  const byName = new Map<string, PlacedStar<B>[]>();
  for (const s of stars) {
    if (!s.series) continue;
    const list = byName.get(s.series.name) ?? [];
    list.push(s);
    byName.set(s.series.name, list);
  }
  for (const [name, list] of byName) {
    list.sort((a, b) => (a.series?.index ?? 0) - (b.series?.index ?? 0));
    for (let i = 1; i < list.length; i++) {
      lines.push({
        series: name,
        from: { x: list[i - 1].x, y: list[i - 1].y },
        to: { x: list[i].x, y: list[i].y },
        ids: [list[i - 1].book.id, list[i].book.id],
      });
    }
    // 星座名放在整組的上方
    const minY = Math.min(...list.map((s) => s.y));
    const meanX = list.reduce((sum, s) => sum + s.x, 0) / list.length;
    seriesLabels.push({ name, x: meanX, y: Math.max(20, minY - 30) });
  }

  // 4) 星座名也是障礙物，但它跟著自己的星座走，所以只推「不屬於這個星座」的星
  const seriesRects = seriesLabels.map((l) => ({ name: l.name, rect: labelRect(l.x, l.y, l.name.length * 14 + 16) }));
  for (let iter = 0; iter < 20; iter++) {
    for (const s of stars) {
      pushOutOf(
        s,
        seriesRects.filter((r) => r.name !== s.series?.name).map((r) => r.rect),
      );
      s.x = Math.min(SKY_W - MARGIN_X, Math.max(MARGIN_X, s.x));
      s.y = Math.min(SKY_H - MARGIN_Y, Math.max(MARGIN_Y, s.y));
    }
  }

  return { stars, lines, clusters, seriesLabels };
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 星團名稱的寬度（4 個字、0.3em 字距的 13px）；高度固定。 */
const CLUSTER_LABEL_W = 110;

/**
 * 左上角留給圖例框（頁面標題與統計疊在星圖上，見 Bookshelf 的 .bs-sky-card）。
 * 換算成畫面：寬 25%、高 23%，CSS 那邊的框不能超過這個範圍。
 */
export const LEGEND_CORNER: Rect = { x0: 0, y0: 0, x1: 250, y1: 140 };

/**
 * 角落的障礙只能往下或往右推：往上、往左會撞到畫布邊緣、被夾回來，下一輪又被推，來回抖動。
 * 判斷用的是星星連同書名的外框（同 pushOutOf）。
 */
function pushOutOfCorner(s: { x: number; y: number }, r: Rect) {
  const HALF_W = 32;
  const ABOVE = 10;
  if (s.x - HALF_W > r.x1 || s.y - ABOVE > r.y1) return;
  // 多推 2：剛好壓在邊界上也算重疊
  const down = r.y1 - (s.y - ABOVE) + 2;
  const right = r.x1 - (s.x - HALF_W) + 2;
  if (down < right) s.y += down;
  else s.x += right;
}

/** 以文字基線為中心的名稱外框（SVG text 的 y 是基線，字身在它上方約 12px）。 */
function labelRect(x: number, y: number, w: number): Rect {
  return { x0: x - w / 2, y0: y - 16, x1: x + w / 2, y1: y + 6 };
}

/**
 * 星星連同它底下的書名，佔的是一塊「上窄下長」的區域：星本體上方約 10px，書名一直到下方約 24px。
 * 跟名稱外框重疊的話，往重疊比較少的那一側（上或下）推出去。
 */
function pushOutOf(s: { x: number; y: number }, rects: readonly Rect[]) {
  const HALF_W = 32;
  const ABOVE = 10;
  const BELOW = 24;
  for (const r of rects) {
    if (s.x + HALF_W < r.x0 || s.x - HALF_W > r.x1) continue;
    if (s.y + BELOW < r.y0 || s.y - ABOVE > r.y1) continue;
    const up = s.y + BELOW - r.y0; // 往上推要移多少
    const down = r.y1 - (s.y - ABOVE); // 往下推要移多少
    s.y += up < down ? -up : down;
  }
}
