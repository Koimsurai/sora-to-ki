// 碎念頁的彗星（blog/Thinking）：一條往下左右擺的大弧線，彗核是最新那一則，碎念沿著彗尾排開。
// 這裡只有幾何與畫圖，不碰 React：版面（每一則落在弧線的哪裡、字放哪一邊）與每一幀的彗尾。
//
// 單則頁（blog/ThinkingDetail）是同一顆彗星往那一則放大進去：弧線、塵埃都乘上 zoom，只有那一段亮。
//
// 座標分兩種：版面座標以頁面容器左上角為原點（捲動不變），畫面座標是視窗座標。
// 畫布固定在視窗上，每一幀把版面座標加上容器目前的位置（origin）。

import { channels, onPalette, palette } from '@/lib/palette';
import { currentFold, type Fold } from '@/lib/viewportFold';
import type { Pt } from '@/store/pageTransition';

let { paper: INK, amber: AMBER } = palette();
/**
 * 彗髮與彗尾的顏色：靠近彗核的地方帶著訊號色（跟換頁的點拖著的那道光同一種），沿著彗尾往後退成墨色。
 * 整條彗尾一個顏色的話，那道帶色的光接進來會接不上。每一粒每一幀都要查，所以先算成 16 階的表
 */
const TINT_REACH = 0.12;
const TINT_STEPS = 16;
let tints: string[] = [];
const buildTints = () => {
  const a = channels(AMBER);
  const b = channels(INK);
  tints = Array.from({ length: TINT_STEPS + 1 }, (_, i) =>
    // 彗核那頭也只帶一半的訊號色：彗尾是塵埃，不是光；光只在彗核
    a.map((v, c) => Math.round(v + ((b[c] ?? v) - v) * (0.5 + 0.5 * Math.sqrt(i / TINT_STEPS)))).join(', '),
  );
};
buildTints();
/** k 是離彗核多遠（0 到 1） */
const tinted = (k: number) => tints[Math.round(Math.min(1, Math.max(0, k / TINT_REACH)) * TINT_STEPS)] ?? INK;
// 主題在頁面開著時換了就跟著換（lib/theme 的 setTheme）
onPalette((p) => {
  ({ paper: INK, amber: AMBER } = p);
  buildTints();
});

/** 弧線一個來回的高度：大約一個半螢幕，捲著看會左右擺 */
const PERIOD = 1300;
const TAU = Math.PI * 2;

export interface ArcLayout {
  /** 弧線中心與擺幅；窄螢幕幾乎是直的、貼著左邊 */
  cx: number;
  amp: number;
  /** 一個來回多高、從彗核起算的相位：列表頁是 PERIOD 與 0.9；單則頁放大過，週期跟著拉長 */
  period: number;
  phase: number;
  /** 彗核的高度（最新那一則） */
  y0: number;
  /** 彗尾畫到哪裡 */
  yEnd: number;
  narrow: boolean;
  /** 字一律從這個 x 開始排（摺疊機書本式：彗星在左頁、字在右頁）；沒有就沿著弧線左右排 */
  column?: number;
  /** 每一則的點：高度與字放在哪一邊 */
  posts: { y: number; left: boolean }[];
  /** 更舊的只剩一個點 */
  ghosts: number[];
  /** 結尾那行字的位置 */
  end: { y: number; left: boolean };
  height: number;
}

export const arcX = (L: Pick<ArcLayout, 'cx' | 'amp' | 'y0' | 'period' | 'phase'>, y: number) =>
  L.cx + L.amp * Math.sin(((y - L.y0) / L.period) * TAU + L.phase);

/**
 * 彗尾在高度 y 有多寬（弧線到一側的距離）：塵埃散開的寬度（同 createComet 的 width），
 * 塵埃再照近似常態的側偏（標準差約 0.5）落在兩側，取一倍大約包住九成五
 */
export const tailHalfWidth = (L: Pick<ArcLayout, 'y0' | 'yEnd' | 'narrow'>, y: number, zoom: number) => {
  const u = Math.min(1, Math.max(0, (y - L.y0) / Math.max(1, L.yEnd - L.y0)));
  return (6 + (L.narrow ? 16 : 46) * Math.sqrt(u)) * zoom;
};

/** 窄於這個寬度就收成貼左的直線，字一律在右邊 */
const NARROW_PX = 760;
const GAP = 230;
const GAP_NARROW = 210;
const GHOST_STEP = 30;

/**
 * 排版：從彗核開始往下，每一則之間至少一個固定間距，字太長就再拉開。
 * 字放在「彗尾往下會彎過去的另一邊」，尾巴就不會穿過字
 */
export function layoutArc(
  width: number,
  top: number,
  heights: number[],
  ghostCount: number,
  fold: Fold | null = currentFold(),
): ArcLayout {
  // 摺疊機書本式：彗星在左頁擺盪，字全部排在右頁，不沿著弧線左右交錯、橫跨摺痕
  const book = fold?.pose === 'book';
  const narrow = !book && width < NARROW_PX;
  const base = {
    cx: book ? fold.first.x + fold.first.width * 0.5 : narrow ? 30 : width * 0.5,
    amp: book ? fold.first.width * 0.24 : narrow ? 18 : Math.min(width * 0.22, 330),
    y0: top,
    period: PERIOD,
    phase: 0.9,
  };
  const sideAt = (y: number) => !book && !narrow && arcX(base, y + 160) > arcX(base, y);
  const gap = narrow ? GAP_NARROW : GAP;
  const posts: ArcLayout['posts'] = [];
  let y = top;
  heights.forEach((h, i) => {
    posts.push({ y, left: sideAt(y) });
    if (i < heights.length - 1) y += Math.max(gap, h + 64);
  });
  const lastH = heights.at(-1) ?? 0;
  const gy0 = y + Math.max(gap * 0.75, lastH + 48);
  const ghosts = Array.from({ length: ghostCount }, (_, k) => gy0 + k * GHOST_STEP);
  const endY = (ghosts.at(-1) ?? y + lastH) + (ghosts.length ? 90 : 120);
  const height = endY + 140;
  return {
    ...base,
    yEnd: height - 30,
    narrow,
    column: book ? fold.second.x + 32 : undefined,
    posts,
    ghosts,
    end: { y: endY, left: sideAt(endY) },
    height,
  };
}

interface Dust {
  u: number;
  side: number;
  j: number;
}
interface Coma {
  /** 在彗核後面多遠（0 是彗核，1 是彗髮的尾端） */
  u: number;
  /** 往兩側偏多少（-1 到 1，靠中間的多） */
  s: number;
  j: number;
}

/** 近似常態分布：四個均勻亂數相加，夠用而且不會有長尾把點甩到很遠 */
const gauss = () => {
  let u = 0;
  for (let k = 0; k < 4; k++) u += Math.random();
  return (u - 2) / 1.15;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 彗尾從彗核往下長到畫面底的時間 */
export const REVEAL_MS = 900;
/** 換頁轉場的「收」：彗尾縮回彗核的時間 */
export const RETRACT_MS = 380;
/** 點飛進來時，最後沿著彗尾往上飛的那一段最長多長（實際是彗核到畫面底） */
export const APPROACH_PX = 640;

/** 彗星往哪裡飛（版面座標的單位向量）：沿著弧線往上 */
export function headDirection(L: ArcLayout): Pt {
  const dx = arcX(L, L.y0 - 6) - arcX(L, L.y0);
  const n = Math.hypot(dx, 6);
  return { x: dx / n, y: -6 / n };
}

export interface CometFrame {
  /** 容器左上角的畫面座標 */
  origin: Pt;
  /** 滑到哪一則上（版面座標的高度），那附近的塵埃亮一點 */
  hoverY: number | null;
  /** 彗尾目前長到哪裡（版面座標）；Infinity = 全部 */
  revealY: number;
  /** 彗髮的大小（0 到 1）：換頁收的時候跟著縮回彗核 */
  headScale: number;
  /**
   * 只亮一段（版面座標的高度）：這一段裡的塵埃照常，外面的暗下去。
   * 點進一則碎念時，那一則的那段彗尾亮著，其他的退暗
   */
  focus?: { from: number; to: number } | null;
  /** 外面暗下去的程度（0–1，放大進去的途中慢慢暗）；不給就是 1 */
  focusAmount?: number;
  /** 鏡頭：畫面座標放大 s 倍再平移（點進一則碎念時往那一段放大進去）；沒有就是原樣 */
  view?: { s: number; dx: number; dy: number } | null;
}

/** 亮的那一段外面暗到多少 */
const DIM = 0.2;
/** 亮與暗之間漸變多長（版面座標） */
const FOCUS_EDGE = 120;

/** 放大：列表頁的彗星以點 P 為中心放大 zoom 倍、P 移到 T（P 是列表頁的版面座標，T 是單則頁的） */
export interface ZoomSpec {
  zoom: number;
  P: Pt;
  T: Pt;
  arc: Pick<ArcLayout, 'cx' | 'amp' | 'y0' | 'period' | 'phase'>;
  /** 列表頁整條彗尾多長（彗核到尾端）：放大後塵埃照同樣的比例分布，這一段的疏密、亮暗才跟列表上一樣 */
  span: number;
  narrow: boolean;
}

/** 放大之後的同一條弧線：擺幅與週期都乘上 zoom，彗核（多半在畫面外很上面）跟著移 */
export const zoomArc = (z: ZoomSpec): Pick<ArcLayout, 'cx' | 'amp' | 'y0' | 'period' | 'phase'> => ({
  cx: z.T.x + z.zoom * (z.arc.cx - z.P.x),
  amp: z.arc.amp * z.zoom,
  y0: z.T.y + z.zoom * (z.arc.y0 - z.P.y),
  period: z.arc.period * z.zoom,
  phase: z.arc.phase,
});

/** 列表頁彗核大概在哪（標題底下，版面座標）：直接打開單則頁時用來估它在列表上的位置 */
const LIST_TOP = 270;

/**
 * 直接打開一則碎念（沒有從列表放大進來）：照它在列表上大概的位置（第幾則）算一個放大的鏡頭，
 * 讓那一段彗尾的彎法跟在列表上看到的差不多；那一則放在 top
 */
export function estimateZoom(width: number, index: number, top: number, zoom: number): ZoomSpec {
  // 摺疊機書本式：彗星在左頁（跟 layoutArc 一樣）
  const fold = currentFold();
  const book = fold?.pose === 'book' ? fold.first : null;
  const narrow = !book && width < NARROW_PX;
  const arc = {
    cx: book ? book.x + book.width * 0.5 : narrow ? 30 : width * 0.5,
    amp: book ? book.width * 0.24 : narrow ? 18 : Math.min(width * 0.22, 330),
    y0: LIST_TOP,
    period: PERIOD,
    phase: 0.9,
  };
  const gap = narrow ? GAP_NARROW : GAP;
  const y = LIST_TOP + index * gap;
  const P = { x: arcX(arc, y), y };
  return { zoom, P, T: { x: P.x, y: top }, arc, span: Math.max(1600, (index + 6) * gap), narrow };
}

/** 單則頁的留言之間至少隔多遠（放大後的版面座標） */
const BIT_GAP = 150;

/**
 * 單則頁的排版：放大過的那一段彗尾上，那則碎念在 top（就是 T），留言接著沿彗尾往下排，
 * 送出列在最後。字放的那一邊跟列表頁同一個規則（彗尾往下會彎過去的另一邊），送出列也是：
 * 原本固定放右邊，彗尾在那裡往右下彎的話整條穿過輸入框與送出鈕
 */
export function layoutSegment(
  arc: Pick<ArcLayout, 'cx' | 'amp' | 'y0' | 'period' | 'phase'>,
  /** 放大後整條彗尾多長（列表頁的長度乘上 zoom） */
  span: number,
  narrow: boolean,
  top: number,
  heights: number[],
): ArcLayout {
  const sideAt = (y: number) => !narrow && arcX(arc, y + 160) > arcX(arc, y);
  const posts: ArcLayout['posts'] = [];
  let y = top;
  heights.forEach((h, i) => {
    posts.push({ y, left: sideAt(y) });
    if (i < heights.length - 1) y += Math.max(i === 0 ? BIT_GAP * 1.3 : BIT_GAP, h + 56);
  });
  // 摺疊機筆電式：送出列不要停在摺痕上，至少從下半開始（像鍵盤）
  const fold = currentFold();
  const endY = Math.max(
    y + Math.max(BIT_GAP, (heights.at(-1) ?? 0) + 64),
    fold?.pose === 'laptop' ? fold.second.y + 24 : 0,
  );
  const height = endY + 280;
  // 彗尾畫到列表那條彗尾的尾端（放大後），塵埃的分布才跟列表上一樣；留言太多、頁面比它長時再往下延
  const yEnd = Math.max(height - 30, arc.y0 + span);
  return {
    ...arc,
    yEnd,
    narrow,
    // 摺疊機書本式：那則碎念、留言與送出列都排在右頁（彗星在左頁）
    column: fold?.pose === 'book' ? fold.second.x + 32 : undefined,
    posts,
    ghosts: [],
    end: { y: endY, left: sideAt(endY) },
    height,
  };
}

export function createComet(tailLength: number, narrow: boolean, zoom = 1) {
  // 窄螢幕的彗尾只有三分之一寬，點數照比例減，不然擠成一條實心的柱子
  const count = Math.min(6000, Math.max(1500, (tailLength * 1.6) / zoom)) * (narrow ? 0.4 : 1);
  const dust: Dust[] = Array.from({ length: Math.round(count) }, () => ({
    u: Math.pow(Math.random(), 1.35),
    side: gauss(),
    j: Math.random(),
  }));
  const coma: Coma[] = Array.from({ length: 320 }, () => ({
    u: Math.pow(Math.random(), 2.2),
    s: Math.max(-1, Math.min(1, gauss() / 1.6)),
    j: Math.random(),
  }));

  /** dt 是秒；0 代表不前進（減少動態時只畫靜態的一張） */
  function draw(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    L: ArcLayout,
    f: CometFrame,
    dt: number,
    t: number,
  ) {
    ctx.clearRect(0, 0, w, h);
    const { x: ox, y: oy } = f.origin;
    const span = L.yEnd - L.y0;
    const view = f.view;
    if (view) {
      ctx.save();
      ctx.transform(view.s, 0, 0, view.s, view.dx, view.dy);
    }
    // 畫面上看得到的範圍（放大時變小）：外面的不畫
    const top = view ? (-8 - view.dy) / view.s : -8;
    const bottom = view ? (h + 8 - view.dy) / view.s : h + 8;
    // 放大過的彗尾：顆粒照比例變大，看得出一粒一粒
    const grain = 2 * zoom;
    const grid = 3 * zoom;
    const focus = f.focus;

    // 彗尾：塵埃從彗核一路往下流，越往後散得越開、越淡；尾巴往弧線外側變寬
    for (const d of dust) {
      d.u += dt * (0.006 + 0.02 * d.u);
      if (d.u > 1) {
        d.u = Math.random() * 0.03;
        d.side = gauss();
      }
      const y = L.y0 + d.u * span;
      if (y > f.revealY) continue;
      const sy = y + oy;
      if (sy < top || sy > bottom) continue;
      const width = (6 + (L.narrow ? 16 : 46) * Math.sqrt(d.u)) * zoom;
      const x = arcX(L, y) + d.side * width;
      let a = Math.pow(1 - d.u, 1.2) * (0.3 + 0.7 * d.j) * 0.8;
      if (f.hoverY !== null) a *= 1 + 1.4 * Math.exp(-(((y - f.hoverY) / 50) ** 2));
      // 剛長出來的那一段先淡一點，看起來是長出來的而不是切出來的
      if (f.revealY !== Infinity) a *= clamp01((f.revealY - y) / 120);
      if (focus) {
        const inside = clamp01(Math.min((y - focus.from) / FOCUS_EDGE + 1, (focus.to - y) / FOCUS_EDGE + 1));
        a *= 1 - (f.focusAmount ?? 1) * (1 - DIM) * (1 - inside);
      }
      if (a < 0.03) continue;
      ctx.fillStyle = `rgba(${tinted(d.u)}, ${Math.min(1, a)})`;
      ctx.fillRect(Math.round(x / grid) * grid + ox, Math.round(y / grid) * grid + oy, grain, grain);
    }

    // 彗核：最新那一則的點（DOM 的 .mo-dot.is-new，轉場的點也落在這裡）。彗髮是一個往後張開的
    // 拋物面，開口朝彗尾：前緣貼著彗核、越往後越寬越淡，直接接進彗尾的塵埃
    const hx = arcX(L, L.y0) + ox;
    const hy = L.y0 + oy;
    // 放大過的彗核也跟著大（彗髮、光暈都乘上 zoom）
    const k = f.headScale * zoom;
    if (k > 0.01 && hy > top - 80 * zoom && hy < bottom + 80 * zoom) {
      const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 30 * k);
      glow.addColorStop(0, `rgba(${AMBER}, 0.3)`);
      glow.addColorStop(1, `rgba(${AMBER}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(hx, hy, 30 * k, 0, TAU);
      ctx.fill();
      const fwd = headDirection(L);
      const side = { x: -fwd.y, y: fwd.x };
      for (const c of coma) {
        // 彗髮包著彗核：前緣在彗核前面一點，最寬、最亮的地方就在彗核上，往後收窄接進彗尾
        const back = (-9 + 58 * c.u) * k;
        const spread = (7 + 12 * Math.sqrt(c.u)) * k;
        const a = Math.pow(1 - c.u, 1.4) * (0.4 + 0.45 * Math.sin(t * 1.6 + c.j * 9) ** 2);
        if (a < 0.04) continue;
        ctx.fillStyle = `rgba(${tinted(c.u * 0.5)}, ${a.toFixed(3)})`;
        ctx.fillRect(
          hx - fwd.x * back + side.x * c.s * spread - 0.75 * zoom,
          hy - fwd.y * back + side.y * c.s * spread - 0.75 * zoom,
          1.5 * zoom,
          1.5 * zoom,
        );
      }
    }
    if (view) ctx.restore();
  }

  return { draw };
}
