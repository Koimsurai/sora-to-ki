// 照片頁（gallery/Photos）的畫布：深空網路的下傳。
// 在太空拍的照片要經過一趟傳輸才看得到：相機把畫面轉成 0 和 1，天線把訊號送回地球，
// 地面站的巨型天線接住，再解碼、上色。這裡畫三樣東西：頁首的地面站與遠處的探測器、
// 每個月收到幾張的接收紀錄、每一張照片進畫面時的接收過程。只有畫圖，不碰 React。

const TAU = Math.PI * 2;
const INK = '241, 236, 227';
const AMBER = '233, 193, 122';
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
    const pw = Math.min(170, w * 0.32);
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

  /** 地面站：左下是碟形天線，右上很遠的地方是探測器，訊號一圈一圈從探測器傳到天線的饋源 */
  function draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, dot: boolean) {
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
    for (let k = 0; k < 6; k++) {
      const p = (t * 0.35 + k / 6) % 1;
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
  }

  return { draw, transmitter };
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

/**
 * 畫一張照片接收到第 t 秒的樣子：還沒收到的部分是一片閃動的 0 與 1，收到的部分是黑白，
 * 顏色從左往右映射回來；正在收的那一行、正在上色的那一列是一條琥珀色的線
 */
export function drawReception(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  t: number,
  font: string,
) {
  const { scan, color } = rxStage(t);
  ctx.clearRect(0, 0, w, h);
  const rows = Math.floor(scan * h);
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.fillStyle = rgba(INK, 0.22);
  const cols = Math.ceil(w / 5.6);
  for (let y = rows + 9; y < h; y += 11) {
    let line = '';
    for (let x = 0; x < cols; x++) line += Math.random() < 0.5 ? '0' : '1';
    ctx.fillText(line, 2, y);
  }
  if (rows > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, rows);
    ctx.clip();
    ctx.filter = 'grayscale(1) contrast(1.05)';
    ctx.drawImage(img, 0, 0, w, h);
    ctx.filter = 'none';
    if (color > 0) {
      ctx.beginPath();
      ctx.rect(0, 0, w * color, rows);
      ctx.clip();
      ctx.drawImage(img, 0, 0, w, h);
    }
    ctx.restore();
  }
  ctx.fillStyle = rgba(AMBER, 0.9);
  if (scan > 0 && scan < 1) ctx.fillRect(0, rows, w, 1);
  if (color > 0 && color < 1) ctx.fillRect(w * color, 0, 1, h);
}
