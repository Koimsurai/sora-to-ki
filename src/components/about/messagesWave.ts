// 留言頁的訊號：每一則留言是一段波形，字越多訊號越長，字本身決定起伏。
// 頁首那條線是收訊的頻道：平常只有雜訊；打字時你打的字即時變成波形，送出時那一段往右飛進天線。
// 換頁時頻道起點振一下（像超聲波探頭），一道琥珀色的光沿頻道跑：進場跑進天線、離場從天線倒著跑回起點，
// 頻道跟著它長出來、收回去。
// 這裡只畫線與天線，狀態文字（RX／TX）是疊在上面的 DOM。

const INK = '241, 236, 227';
const AMBER = '233, 193, 122';
const TAU = Math.PI * 2;

/** 收訊天線（public/illustrations/dsn-dish.webp，669×865）：饋源的位置（原圖比例）。
 *  畫的時候左右翻過來，碟面朝左上，接左邊來的訊號 */
const DISH = { src: '/illustrations/dsn-dish.webp', ratio: 669 / 865, feed: [0.7, 0.098] } as const;
export const DISH_SRC = DISH.src;

/** 一個字在波形上佔多寬（CSS 像素） */
const PX_PER_CHAR = 9;
/** 送出的那段飛到天線要多久（秒，之後再淡掉） */
export const SEND_S = 1.6;
/** 起點振鈴佔多寬（CSS 像素） */
const PING_W = 72;
/** 那道光身後拖多長（CSS 像素） */
const PULSE_TAIL = 160;

/** 一段文字 → 每個取樣點的高度（-1–1）。同一段字永遠同一個形狀 */
function sampleOf(chars: string[], u: number, x: number, t: number) {
  const c = chars[Math.min(chars.length - 1, Math.floor(u * chars.length))]?.codePointAt(0) ?? 0;
  const amp = 0.25 + (((c * 37) % 97) / 97) * 0.75;
  const env = Math.sin(Math.PI * Math.min(1, u * 1.02));
  return Math.sin(x * (0.12 + (c % 13) * 0.02) + t * 6) * amp * env;
}

/** 留言清單裡那一小段靜止的波形（SVG path，viewBox 寬 `width`、高 `height`） */
export function wavePath(text: string, width: number, height: number) {
  const chars = Array.from(text);
  if (!chars.length) return '';
  const len = Math.min(width, 24 + chars.length * 4);
  const y = height / 2;
  let d = '';
  for (let x = 0; x <= len; x += 1.5) {
    const v = sampleOf(chars, x / len, x, 0) * height * 0.42;
    d += `${x === 0 ? 'M' : 'L'}${x.toFixed(1)} ${(y + v).toFixed(1)}`;
  }
  return d;
}

export interface Strip {
  w: number;
  h: number;
  t: number;
  dt: number;
  /** 正在打的字 */
  typing: string;
  /** 送出中的那段字與經過的秒數（沒有是 null） */
  sending: { text: string; s: number } | null;
  /** 頻道從左端畫到哪裡（0–1，相對整條線）：換頁時跟著電波的前緣走 */
  reveal: number;
  /** 換頁時沿頻道跑的那道琥珀色的光：前緣在哪（0–1）、往哪個方向（1 往天線、-1 從天線倒回來） */
  pulse: { head: number; dir: 1 | -1 } | null;
  /** 頻道起點那一小段振鈴（像超聲波探頭打出去的那一下）的進度（0–1，沒有是 null） */
  ping: number | null;
  /** 天線的亮度倍率（0–1）：換頁時淡入淡出 */
  dishAlpha: number;
  dish: HTMLImageElement | null;
}

/** 頻道的中線與右端（天線底下）的位置 */
export function channelOf(w: number, h: number) {
  const d = dishOf(w, h);
  return { y: h / 2, end: d.x + d.dw * 0.2 };
}

function dishOf(w: number, h: number) {
  const dh = h - 8;
  const dw = dh * DISH.ratio;
  const x = w - dw;
  const y = 4;
  // 翻過來之後饋源在 1 − feed.x
  return { x, y, dw, dh, fx: x + dw * (1 - DISH.feed[0]), fy: y + dh * DISH.feed[1] };
}

export function createStrip() {
  let flash = 0;
  let arrived = false;
  /** 換頁那道光碰過天線了沒（進場是前緣跑到天線、離場是一開始從天線出發，各亮一下） */
  let pulseHit = false;
  return {
    /** 畫一幀；送出的那段飛進天線時天線亮一下 */
    draw(ctx: CanvasRenderingContext2D, f: Strip) {
      const { w, h, t, dt, typing, sending, reveal, pulse, ping, dishAlpha, dish } = f;
      ctx.clearRect(0, 0, w, h);
      const y = h / 2;
      const d = dishOf(w, h);
      const lineEnd = d.x + d.dw * 0.2;
      flash = Math.max(0, flash - dt * 1.4);
      if (pulse) {
        const headX = pulse.head * lineEnd;
        if (!pulseHit && (pulse.dir === -1 || headX > d.x)) {
          pulseHit = true;
          flash = 1;
        }
      } else pulseHit = false;

      if (dish?.complete && dish.naturalWidth) {
        ctx.save();
        ctx.globalAlpha = (0.45 + 0.5 * flash) * dishAlpha;
        ctx.translate(d.x + d.dw, d.y);
        ctx.scale(-1, 1);
        ctx.drawImage(dish, 0, 0, d.dw, d.dh);
        ctx.restore();
      }
      if (flash > 0) {
        const g = ctx.createRadialGradient(d.fx, d.fy, 0, d.fx, d.fy, 30);
        g.addColorStop(0, `rgba(${AMBER}, ${0.7 * flash})`);
        g.addColorStop(1, `rgba(${AMBER}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(d.fx, d.fy, 30, 0, TAU);
        ctx.fill();
      }

      // 起點的振鈴：頻道最左邊一小段，越往右越小，整段隨時間衰減掉；跟那道光同一個琥珀色
      if (ping !== null && ping < 1) {
        const decay = (1 - ping) ** 2;
        ctx.strokeStyle = `rgba(${AMBER}, ${0.95 * (1 - ping * 0.5)})`;
        ctx.beginPath();
        for (let x = 0; x <= PING_W; x += 1) {
          const env = (1 - x / PING_W) ** 1.5;
          const v = Math.sin(x * 0.45 - t * 40) * env * decay * h * 0.3;
          if (x === 0) ctx.moveTo(x, y + v);
          else ctx.lineTo(x, y + v);
        }
        ctx.stroke();
      }

      // 沿頻道跑的那道光：一條琥珀色的直線，前緣最亮、身後拖一段漸淡
      if (pulse) {
        const head = pulse.head * lineEnd;
        const tail = head - pulse.dir * Math.min(PULSE_TAIL, lineEnd * 0.25);
        const line = ctx.createLinearGradient(tail, y, head, y);
        line.addColorStop(0, `rgba(${AMBER}, 0)`);
        line.addColorStop(1, `rgba(${AMBER}, 0.95)`);
        ctx.strokeStyle = line;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tail, y);
        ctx.lineTo(head, y);
        ctx.stroke();
        ctx.lineWidth = 1;
        const g = ctx.createRadialGradient(head, y, 0, head, y, 14);
        g.addColorStop(0, `rgba(${AMBER}, 0.6)`);
        g.addColorStop(1, `rgba(${AMBER}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(head, y, 14, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgb(${AMBER})`;
        ctx.beginPath();
        ctx.arc(head, y, 3, 0, TAU);
        ctx.fill();
      }

      // 頻道：從左端畫到 reveal（換頁時跟著電波的前緣長出來、收回去）
      const to = lineEnd * reveal;
      if (to <= 0) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, to, h);
      ctx.clip();

      // 背景的雜訊：沒有訊號時就只有這個
      ctx.strokeStyle = `rgba(${INK}, 0.25)`;
      ctx.beginPath();
      for (let x = 0; x <= lineEnd; x += 3) {
        const v = (Math.random() - 0.5) * 3;
        if (x === 0) ctx.moveTo(x, y + v);
        else ctx.lineTo(x, y + v);
      }
      ctx.stroke();

      const wave = (text: string, x0: number, x1: number, alpha: number) => {
        const chars = Array.from(text);
        if (!chars.length || alpha <= 0) return;
        ctx.strokeStyle = `rgba(${INK}, ${alpha})`;
        ctx.beginPath();
        for (let x = x0; x <= x1; x += 1.5) {
          const v = sampleOf(chars, (x - x0) / Math.max(1, x1 - x0), x, t) * h * 0.32;
          if (x === x0) ctx.moveTo(x, y + v);
          else ctx.lineTo(x, y + v);
        }
        ctx.stroke();
      };

      const mid = lineEnd * 0.5;
      if (!sending && typing) {
        const len = Math.min(lineEnd * 0.7, Array.from(typing).length * PX_PER_CHAR);
        wave(typing, mid - len / 2, mid + len / 2, 0.9);
      }
      if (sending) {
        const s = sending.s;
        const off = s * s * w * 0.9;
        const len = Math.min(lineEnd * 0.7, Array.from(sending.text).length * PX_PER_CHAR);
        wave(sending.text, mid - len / 2 + off, mid + len / 2 + off, Math.max(0, 0.9 - s * 0.4));
        // 訊號的前緣
        ctx.fillStyle = `rgba(${AMBER}, ${Math.max(0, 1 - s * 0.5)})`;
        ctx.beginPath();
        ctx.arc(mid + len / 2 + off, y, 3, 0, TAU);
        ctx.fill();
        if (!arrived && mid - len / 2 + off > d.x) {
          arrived = true;
          flash = 1;
        }
      } else arrived = false;
      ctx.restore();
    },
  };
}
