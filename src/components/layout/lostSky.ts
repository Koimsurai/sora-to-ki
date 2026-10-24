// 404 的畫面：一個繫繩斷掉的太空人在黑裡慢慢漂、慢慢翻滾，偶爾往前漂近一點又退回去。
// 斷掉的那一端還在閃，也還在發訊號，但每一道都斷在半路。
// 星空是全站背景在畫（這裡不畫星），這裡只畫太空人、斷端與斷掉的訊號。

const INK = '241, 236, 227';
const AMBER = '233, 193, 122';
const TAU = Math.PI * 2;

/** 太空人線稿（public/illustrations/404-astronaut.webp，731×727）：繫繩斷端的位置與它朝的方向（原圖） */
const ASTRONAUT = { src: '/illustrations/404-astronaut.webp', tether: [0.969, 0.034], aim: -1.26 } as const;
export const ASTRONAUT_SRC = ASTRONAUT.src;
/** 多久發一道訊號（秒） */
const PULSE_EVERY = 1.9;

export interface LostFrame {
  w: number;
  h: number;
  t: number;
  dt: number;
  /** 換頁進來後太空人淡入的進度（0–1） */
  appear: number;
  /** 換頁離開的進度（0–1） */
  erase: number;
  img: HTMLImageElement | null;
}

export function createLost() {
  const pulses: { born: number; dir: number; cut: number; seed: number }[] = [];
  let nextPulse = 0.4;

  /** 太空人的位置、大小、角度：右半邊，慢慢漂、慢慢翻，偶爾往前漂近一點 */
  const pose = (w: number, h: number, t: number) => {
    const narrow = w < 760;
    const base = narrow ? Math.min(w * 0.7, h * 0.4) : Math.min(h * 0.7, w * 0.38);
    const size = base * (1 + Math.sin(t * 0.05) * 0.06);
    const cx = w * (narrow ? 0.55 : 0.64) + Math.sin(t * 0.07) * w * 0.02;
    const cy = h * (narrow ? 0.3 : 0.5) + Math.sin(t * 0.11 + 1) * h * 0.035;
    const ang = Math.sin(t * 0.09) * 0.22 + t * 0.015;
    return { size, cx, cy, ang };
  };

  /** 繫繩斷端在畫面上的位置與它朝的方向 */
  const tether = (w: number, h: number, t: number) => {
    const { size, cx, cy, ang } = pose(w, h, t);
    const lx = (ASTRONAUT.tether[0] - 0.5) * size;
    const ly = (ASTRONAUT.tether[1] - 0.5) * size;
    return {
      x: cx + lx * Math.cos(ang) - ly * Math.sin(ang),
      y: cy + lx * Math.sin(ang) + ly * Math.cos(ang),
      dir: ASTRONAUT.aim + ang,
    };
  };

  return {
    tether,
    draw(ctx: CanvasRenderingContext2D, f: LostFrame) {
      const { w, h, t, dt, appear, erase, img } = f;
      ctx.clearRect(0, 0, w, h);
      const fade = appear * (1 - erase);
      const { size, cx, cy, ang } = pose(w, h, t);
      if (img?.complete && img.naturalWidth) {
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(cx, cy);
        ctx.rotate(ang);
        ctx.drawImage(img, -size / 2, -size / 2, size, size);
        ctx.restore();
      }

      // 斷端發出的訊號：一圈一圈往外擴的點，擴到半路就斷掉、散開
      const end = tether(w, h, t);
      nextPulse -= dt;
      if (nextPulse <= 0 && appear >= 1) {
        pulses.push({
          born: t,
          dir: end.dir + (Math.random() - 0.5) * 0.4,
          cut: 0.25 + Math.random() * 0.45,
          seed: Math.random() * 100,
        });
        nextPulse = PULSE_EVERY;
      }
      for (let k = pulses.length - 1; k >= 0; k--) {
        const p = pulses[k];
        const age = t - p.born;
        const reach = 10 + age * 80;
        if (age > 4) {
          pulses.splice(k, 1);
          continue;
        }
        const life = Math.min(1, reach / 240);
        if (life > p.cut) continue;
        ctx.fillStyle = `rgba(${INK}, ${0.6 * (1 - life / p.cut) * fade})`;
        let n = 0;
        for (let a2 = -0.45; a2 <= 0.45; a2 += 0.08, n++) {
          // 越往外越多點掉線（用固定的亂數，免得每幀閃）
          const r = Math.sin((p.seed + n) * 12.9898) * 43758.5453;
          if (r - Math.floor(r) < life * 1.6) continue;
          ctx.fillRect(end.x + Math.cos(p.dir + a2) * reach, end.y + Math.sin(p.dir + a2) * reach, 1.5, 1.5);
        }
      }

      // 斷端那一點：還亮著，但沒有回應
      const blink = Math.sin(t * 4) > 0.6 ? 1 : 0.25;
      const glow = ctx.createRadialGradient(end.x, end.y, 0, end.x, end.y, 12);
      glow.addColorStop(0, `rgba(${AMBER}, ${0.45 * blink * fade})`);
      glow.addColorStop(1, `rgba(${AMBER}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(end.x, end.y, 12, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(${AMBER}, ${blink * fade})`;
      ctx.beginPath();
      ctx.arc(end.x, end.y, 2.4, 0, TAU);
      ctx.fill();
    },
  };
}
