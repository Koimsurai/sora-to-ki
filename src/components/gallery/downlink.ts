// 照片頁（gallery/Photos）的畫布：深空網路的下傳。
// 在太空拍的照片要經過一趟傳輸才看得到：相機把畫面轉成 0 和 1，天線把訊號送回地球，
// 地面站的巨型天線接住，再解碼、上色。這裡畫三樣東西：頁首的地面站與遠處的探測器、
// 每個月收到幾張的接收紀錄、每一張照片進畫面時的接收過程。只有畫圖，不碰 React。

const TAU = Math.PI * 2;
const INK = '241, 236, 227';
const AMBER = '233, 193, 122';
/** 紙色（--ground）：整頁遮罩先鋪這一層，底下的內容才不會透出來 */
const GROUND = '#0a0a0c';
const rgba = (c: string, a: number) => `rgba(${c}, ${a.toFixed(3)})`;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** 線稿插圖（public/illustrations），以及畫訊號要用到的位置（圖裡的比例） */
const DISH = { src: '/illustrations/dsn-dish.webp', feed: [0.7, 0.098] } as const;
/** 探測器的高增益天線碟面中心；畫的時候轉 180°，讓碟面朝左下對著地面站 */
const PROBE = { src: '/illustrations/deep-space-probe.webp', dish: [435 / 698, 265 / 700] } as const;

function load(src: string) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return img;
}
const ready = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0;

export function createStation() {
  const dish = load(DISH.src);
  const probe = load(PROBE.src);

  /** 探測器在畫布上的位置、大小、轉角，以及它發送訊號的那一點 */
  const layout = (w: number, t: number) => {
    const pw = Math.min(200, w * 0.3);
    const cx = w - pw * 0.55;
    const cy = pw * 0.42 + Math.sin(t * 0.3) * 3;
    const rot = Math.PI + Math.sin(t * 0.12) * 0.06;
    const ox = (PROBE.dish[0] - 0.5) * pw;
    const oy = (PROBE.dish[1] - 0.5) * pw;
    return {
      pw,
      cx,
      cy,
      rot,
      tx: cx + ox * Math.cos(rot) - oy * Math.sin(rot),
      ty: cy + ox * Math.sin(rot) + oy * Math.cos(rot),
    };
  };

  /** 發送中的那一點（琥珀點）在畫布上的位置：換頁轉場的點落在這裡 */
  const transmitter = (w: number, t: number) => {
    const l = layout(w, t);
    return { x: l.tx, y: l.ty };
  };

  /** 天線的饋源（收訊號的那一點）在畫布上的位置：換頁轉場的點沿著訊號落進這裡 */
  const receiver = (h: number) => {
    const dh = h - 6;
    return { x: dh * (669 / 865) * DISH.feed[0], y: dh * DISH.feed[1] };
  };

  /**
   * 地面站：左下是碟形天線，右上很遠的地方是探測器，訊號一圈一圈從探測器傳到天線的饋源。
   * dot：探測器上那個發送中的琥珀點畫不畫（換頁轉場的點還在飛、或正要發射出去時由轉場畫）；
   * caught：0 到 1，饋源剛收到換頁轉場那一點時亮一下、慢慢退掉
   */
  function draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, dot: boolean, caught = 0) {
    ctx.clearRect(0, 0, w, h);
    const dh = h - 6;
    const dw = dh * (669 / 865);
    if (ready(dish)) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(dish, 0, 0, dw, dh);
      ctx.globalAlpha = 1;
    }
    const l = layout(w, t);
    if (ready(probe)) {
      ctx.save();
      ctx.translate(l.cx, l.cy);
      ctx.rotate(l.rot);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(probe, -l.pw / 2, -l.pw / 2, l.pw, l.pw);
      ctx.restore();
    }
    // 訊號：一圈一圈的點弧，從探測器往饋源傳，越近越大
    const fx = dw * DISH.feed[0];
    const fy = dh * DISH.feed[1];
    const vx = fx - l.tx;
    const vy = fy - l.ty;
    const ang = Math.atan2(vy, vx);
    // 波前的間距固定（大約 140px 一道），訊號走得越遠道數越多
    const waves = Math.max(6, Math.round(Math.hypot(vx, vy) / 140));
    for (let k = 0; k < waves; k++) {
      const p = (t * 0.35 * (6 / waves) + k / waves) % 1;
      const cx = l.tx + vx * p;
      const cy = l.ty + vy * p;
      const r = 10 + p * 26;
      // 一道波前：圓弧的頂點在 (cx, cy)、朝著天線那一側拱出去
      const ox = cx - Math.cos(ang) * r;
      const oy = cy - Math.sin(ang) * r;
      ctx.fillStyle = rgba(INK, 0.5 * Math.sin(p * Math.PI));
      for (let a = -0.7; a <= 0.7; a += 0.14) {
        ctx.fillRect(ox + Math.cos(ang + a) * r, oy + Math.sin(ang + a) * r, 1.4, 1.4);
      }
    }
    // 發送中：碟面中心一個琥珀色的點（換頁轉場的點還在飛時由轉場畫）
    if (dot) {
      const g = ctx.createRadialGradient(l.tx, l.ty, 0, l.tx, l.ty, 12);
      g.addColorStop(0, rgba(AMBER, 0.45));
      g.addColorStop(1, rgba(AMBER, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(l.tx, l.ty, 12, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(AMBER, 0.65 + 0.35 * Math.sin(t * 3));
      ctx.beginPath();
      ctx.arc(l.tx, l.ty, 2.2, 0, TAU);
      ctx.fill();
    }
    if (caught > 0) {
      const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 26);
      g.addColorStop(0, rgba(AMBER, 0.6 * caught));
      g.addColorStop(1, rgba(AMBER, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(fx, fy, 26, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(AMBER, caught);
      ctx.beginPath();
      ctx.arc(fx, fy, 2.4, 0, TAU);
      ctx.fill();
    }
  }

  return { draw, transmitter, receiver };
}

/**
 * 整頁的遮罩（進場、退場）：y 從 top 到 bottom 這一段是還沒收到（或已經收回去）的部分，
 * 鋪紙色再貼一層 0 與 1；hole 是地面站的畫布，那一塊不蓋（點要沿著訊號從探測器飛到天線，得看得到它們）。
 * edge 那一側畫一條琥珀色的掃描線
 */
export function drawVeil(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  top: number,
  bottom: number,
  edge: 'top' | 'bottom' | null,
  hole: { x: number; y: number; w: number; h: number } | null,
  t: number,
  font: string,
) {
  ctx.clearRect(0, 0, w, h);
  if (bottom <= top) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, w, bottom - top);
  if (hole) {
    // 反著畫一個洞（evenodd）：地面站那一塊不蓋
    ctx.rect(hole.x + hole.w, hole.y, -hole.w, hole.h);
  }
  ctx.clip('evenodd');
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, top, w, bottom - top);
  const tiles = noiseTiles(font);
  const tile = tiles[Math.floor((Math.max(0, t) * 1000) / NOISE_SWAP_MS) % tiles.length];
  for (let y = top - (top % NOISE_H); y < bottom; y += NOISE_H) {
    for (let x = 0; x < w; x += NOISE_W) ctx.drawImage(tile, x, y);
  }
  ctx.restore();
  ctx.fillStyle = rgba(AMBER, 0.9);
  if (edge === 'top') ctx.fillRect(0, top, w, 1);
  if (edge === 'bottom') ctx.fillRect(0, bottom - 1, w, 1);
}

/** 接收紀錄：每個月收到幾張，一個月一個圈（圈越大收得越多），多的那幾個月標上數字 */
export function drawPasses(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  passes: [string, number][],
  font: string,
) {
  ctx.clearRect(0, 0, w, h);
  if (passes.length === 0) return;
  const month = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    return y * 12 + m - 1;
  };
  const m0 = month(passes[0][0]) - 1;
  const m1 = month(passes[passes.length - 1][0]) + 1;
  const X = (ym: string) => 10 + ((month(ym) - m0) / Math.max(1, m1 - m0)) * (w - 20);
  const y = h * 0.45;
  ctx.strokeStyle = rgba(INK, 0.2);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(10, y);
  ctx.lineTo(w - 10, y);
  ctx.stroke();
  ctx.font = font;
  ctx.textAlign = 'center';
  const first = Math.floor(m0 / 12) + 1;
  const last = Math.floor(m1 / 12);
  for (let yr = first; yr <= last; yr++) {
    const x = X(`${yr}-01`);
    ctx.fillStyle = rgba(INK, 0.12);
    ctx.fillRect(x, y - 14, 1, 28);
    ctx.fillStyle = rgba(INK, 0.4);
    ctx.fillText(String(yr), x, h - 4);
  }
  const max = Math.max(...passes.map(([, n]) => n));
  for (const [ym, n] of passes) {
    const x = X(ym);
    const r = 1.5 + Math.sqrt(n) * 1.3;
    ctx.strokeStyle = rgba(INK, 0.6);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = `rgb(${INK})`;
    ctx.beginPath();
    ctx.arc(x, y, 1.2, 0, TAU);
    ctx.fill();
    if (n >= max * 0.3) {
      ctx.fillStyle = rgba(INK, 0.55);
      ctx.fillText(`${ym.replace('-', '.')} · ${n}`, x, y - r - 6);
    }
  }
}

/** 一張照片收多久（秒）：先找訊號，再一行一行收成黑白，最後一道掃過去把顏色映射回來 */
export const RX_TOTAL = 3.6;
const ACQUIRE = 0.4;
const SCAN = [0.4, 2.2] as const;
const COLOR = [2.4, 3.4] as const;

export type RxStage = 'acquire' | 'rx' | 'color' | 'done';

/** 接收到第 t 秒是哪一段、收了多少 */
export function rxStage(t: number): { stage: RxStage; scan: number; color: number } {
  const scan = clamp01((t - SCAN[0]) / (SCAN[1] - SCAN[0]));
  const color = clamp01((t - COLOR[0]) / (COLOR[1] - COLOR[0]));
  const stage: RxStage = t < ACQUIRE ? 'acquire' : scan < 1 ? 'rx' : color < 1 ? 'color' : 'done';
  return { stage, scan, color };
}

/** 0 與 1 的雜訊貼圖有幾張、多大（像素）：輪流換著貼，看起來就是一直在閃 */
const NOISE_TILES = 4;
const NOISE_W = 480;
const NOISE_H = 264;
/** 雜訊多久換一張（毫秒） */
const NOISE_SWAP_MS = 70;
let noise: { font: string; tiles: HTMLCanvasElement[] } | null = null;

/**
 * 雜訊貼圖：一排一排的 0 與 1，先畫好幾張。每一幀都重新排一整片字太貴
 * （好幾張同時在收的時候會掉幀），貼現成的圖幾乎不花時間
 */
function noiseTiles(font: string) {
  if (noise?.font === font) return noise.tiles;
  const tiles = Array.from({ length: NOISE_TILES }, () => {
    const cv = document.createElement('canvas');
    cv.width = NOISE_W;
    cv.height = NOISE_H;
    const g = cv.getContext('2d');
    if (!g) return cv;
    g.font = font;
    g.textAlign = 'left';
    g.fillStyle = rgba(INK, 0.22);
    // 一排字要排滿整張貼圖（多排一個字，超出的會被切掉），貼圖接在一起時才不會有一條直縫
    const cols = Math.ceil(NOISE_W / g.measureText('0').width) + 1;
    for (let y = 9; y < NOISE_H; y += 11) {
      let line = '';
      for (let x = 0; x < cols; x++) line += Math.random() < 0.5 ? '0' : '1';
      g.fillText(line, 0, y);
    }
    return cv;
  });
  noise = { font, tiles };
  return tiles;
}

/** 一張照片的黑白版：只做一次（每一幀都套濾鏡畫一次也很貴） */
export function grayscaleOf(img: HTMLImageElement, w: number, h: number, dpr: number) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * dpr));
  cv.height = Math.max(1, Math.round(h * dpr));
  const g = cv.getContext('2d');
  if (g) {
    g.filter = 'grayscale(1) contrast(1.05)';
    g.drawImage(img, 0, 0, cv.width, cv.height);
  }
  return cv;
}

/**
 * 畫一張照片接收到第 t 秒的樣子：還沒收到的部分是一片閃動的 0 與 1，收到的部分是黑白，
 * 顏色從左往右映射回來；正在收的那一行、正在上色的那一列是一條琥珀色的線
 */
export function drawReception(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  gray: HTMLCanvasElement,
  w: number,
  h: number,
  t: number,
  font: string,
) {
  const { scan, color } = rxStage(t);
  ctx.clearRect(0, 0, w, h);
  const rows = Math.floor(scan * h);
  if (rows < h) {
    const tiles = noiseTiles(font);
    const tile = tiles[Math.floor((Math.max(0, t) * 1000) / NOISE_SWAP_MS) % tiles.length];
    for (let y = rows; y < h; y += NOISE_H) {
      for (let x = 0; x < w; x += NOISE_W) {
        const sh = Math.min(NOISE_H, h - y);
        ctx.drawImage(tile, 0, 0, Math.min(NOISE_W, w - x), sh, x, y, Math.min(NOISE_W, w - x), sh);
      }
    }
  }
  if (rows > 0) {
    ctx.drawImage(gray, 0, 0, gray.width, (rows / h) * gray.height, 0, 0, w, rows);
    if (color > 0) {
      const cw = w * color;
      ctx.drawImage(img, 0, 0, (cw / w) * img.naturalWidth, (rows / h) * img.naturalHeight, 0, 0, cw, rows);
    }
  }
  ctx.fillStyle = rgba(AMBER, 0.9);
  if (scan > 0 && scan < 1) ctx.fillRect(0, rows, w, 1);
  if (color > 0 && color < 1) ctx.fillRect(w * color, 0, 1, h);
}
