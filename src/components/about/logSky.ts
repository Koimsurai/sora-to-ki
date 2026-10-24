// 航行日誌的畫布：一條往上爬的軌跡，高度是從站點誕生起累積的 GitHub 貢獻；
// 改版是軌跡上的點，最前端是「現在」，一枚火箭的噴嘴對在那裡、往後噴著火；
// 正下方是同一條時間軸的熱力圖，一天一個點、一週一行，貢獻越多點越大越亮。
// 這裡只畫點與線，字（里程碑的名字、累積數、現在、提示）是疊在上面的 DOM。

const INK = '241, 236, 227';
const AMBER = '233, 193, 122';
const TAU = Math.PI * 2;
const DAY_MS = 86400000;
/** 字型：月份刻度是數字，用等寬字畫在畫布上（數字不需要裁字） */
const MONO = '10px "Fira Code Variable", "Fira Code", ui-monospace, monospace';

/** 火箭線稿（public/illustrations/rocket-ascent.webp，568×878）：噴嘴出口與機鼻的位置（原圖比例） */
const ROCKET = { src: '/illustrations/rocket-ascent.webp', nozzle: [0.074, 0.957], nose: [0.968, 0.017] } as const;
export const ROCKET_SRC = ROCKET.src;
/** 火箭畫多長（噴嘴到機鼻，CSS 像素） */
const ROCKET_LEN = 128;
/** 火焰的點活多久（秒） */
const FLAME_LIFE = 0.55;

interface LogPoint {
  x: number;
  y: number;
}

export interface LogFrame {
  w: number;
  h: number;
  t: number;
  dt: number;
  /** 換頁進來後軌跡從起點畫到現在的進度（0–1）：火箭沿著軌跡爬上去 */
  grow: number;
  /** 換頁離開的進度（0–1）：火箭沿最後的方向飛走，其他的淡掉 */
  erase: number;
  /** 滑到的里程碑索引（沒有是 -1） */
  milestone: number;
  /** 滑到的那一天（沒有是 -1） */
  day: number;
  rocket: HTMLImageElement | null;
}

export interface LogGeometry {
  x0: number;
  x1: number;
  base: number;
  top: number;
  X: (i: number) => number;
  Y: (i: number) => number;
  /** 熱力圖第 i 天的位置 */
  heat: (i: number) => LogPoint;
  heatStep: number;
}

const dayIndex = (start: number, date: string) => Math.round((new Date(`${date}T00:00:00`).getTime() - start) / DAY_MS);

export function createLog(start: string, counts: number[], milestoneDates: string[]) {
  const N = Math.max(2, counts.length);
  const startMs = new Date(`${start}T00:00:00`).getTime();
  const cum: number[] = [];
  counts.reduce((a, c, i) => (cum[i] = a + c), 0);
  const total = cum[cum.length - 1] || 1;
  const startDow = new Date(startMs).getDay();
  const msIndex = milestoneDates.map((d) => Math.max(0, Math.min(N - 1, dayIndex(startMs, d))));
  // 月份刻度：每三個月一格
  const ticks: { i: number; label: string }[] = [];
  for (let m = new Date(startMs); ; m = new Date(m.getFullYear(), m.getMonth() + 3, 1)) {
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    const i = Math.round((first.getTime() - startMs) / DAY_MS);
    if (i >= N) break;
    if (i > 0) ticks.push({ i, label: `${first.getFullYear()}.${String(first.getMonth() + 1).padStart(2, '0')}` });
  }
  const flame: { x: number; y: number; a: number; v: number; life: number }[] = [];

  const geometry = (w: number, h: number): LogGeometry => {
    const x0 = 10;
    const x1 = w - 120;
    const base = h * 0.6;
    const top = h * 0.06 + 56;
    const X = (i: number) => x0 + (i / (N - 1)) * (x1 - x0);
    const Y = (i: number) => base - ((cum[Math.max(0, Math.min(N - 1, Math.floor(i)))] ?? 0) / total) * (base - top);
    const hy0 = h * 0.72;
    const heatStep = Math.min(11, (h * 0.26) / 7);
    const heat = (i: number) => {
      const dow = (startDow + i) % 7;
      const wk = Math.floor((i + startDow) / 7);
      return { x: X(Math.min(N - 1, Math.max(0, wk * 7 - startDow + 3))), y: hy0 + dow * heatStep };
    };
    return { x0, x1, base, top, X, Y, heat, heatStep };
  };

  /** 現在那一點與軌跡最後一段的方向（弧度） */
  const nowOf = (g: LogGeometry, upto = N - 1) => {
    const k0 = Math.max(0, upto - 25);
    const x = g.X(upto);
    const y = g.Y(upto);
    return { x, y, dir: Math.atan2(y - g.Y(k0), x - g.X(k0)) };
  };

  return {
    total,
    counts,
    geometry,
    milestoneIndex: msIndex,
    /** 里程碑在畫面上的位置 */
    milestonesAt: (w: number, h: number) => {
      const g = geometry(w, h);
      return msIndex.map((i) => ({ x: g.X(i), y: g.Y(i) }));
    },
    /** 現在那一點（離開時火箭會從這裡沿 dir 飛走） */
    now: (w: number, h: number) => nowOf(geometry(w, h)),
    /** 火箭的機鼻：離開時點跟著它 */
    rocketNose: (w: number, h: number, erase: number) => {
      const n = nowOf(geometry(w, h));
      const fly = erase * erase * 260;
      return {
        x: n.x + Math.cos(n.dir) * (ROCKET_LEN + fly),
        y: n.y + Math.sin(n.dir) * (ROCKET_LEN + fly),
        dir: n.dir,
      };
    },
    /** 滑鼠在哪個里程碑或哪一天上 */
    hit(w: number, h: number, px: number, py: number) {
      const g = geometry(w, h);
      let milestone = -1;
      let best = 14;
      msIndex.forEach((i, k) => {
        const d = Math.hypot(px - g.X(i), py - g.Y(i));
        if (d < best) {
          best = d;
          milestone = k;
        }
      });
      let day = -1;
      if (milestone < 0 && py > g.heat(0).y - g.heatStep) {
        let bestDay = Math.max(5, g.heatStep * 0.7);
        for (let i = 0; i < counts.length; i++) {
          const p = g.heat(i);
          const d = Math.hypot(px - p.x, py - p.y);
          if (d < bestDay) {
            bestDay = d;
            day = i;
          }
        }
      }
      return { milestone, day };
    },

    draw(ctx: CanvasRenderingContext2D, f: LogFrame) {
      const { w, h, t, dt, grow, erase, milestone, day, rocket } = f;
      ctx.clearRect(0, 0, w, h);
      const g = geometry(w, h);
      const fade = 1 - erase;
      const upto = Math.max(0, Math.min(N - 1, grow * (N - 1)));
      const tip = Math.floor(upto);

      // 基線與刻度
      ctx.strokeStyle = `rgba(${INK}, ${0.12 * fade})`;
      ctx.beginPath();
      ctx.moveTo(g.x0, g.base);
      ctx.lineTo(g.x1, g.base);
      ctx.stroke();
      ctx.font = MONO;
      ctx.textAlign = 'center';
      for (const tk of ticks) {
        const x = g.X(tk.i);
        ctx.fillStyle = `rgba(${INK}, ${0.18 * fade})`;
        ctx.fillRect(x, g.base - 4, 1, 8);
        ctx.fillStyle = `rgba(${INK}, ${0.4 * fade})`;
        ctx.fillText(tk.label, x, g.base + 16);
      }

      // 軌跡：一條往上爬的細線，畫到 grow 的位置
      ctx.strokeStyle = `rgba(${INK}, ${0.55 * fade})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i <= tip; i++) {
        const x = g.X(i);
        const y = g.Y(i);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;

      // 改版的點：軌跡畫過去才出現
      msIndex.forEach((i, k) => {
        if (i > tip) return;
        const x = g.X(i);
        const y = g.Y(i);
        const on = k === milestone;
        ctx.fillStyle = `rgba(${INK}, ${(on ? 1 : 0.7) * fade})`;
        ctx.beginPath();
        ctx.arc(x, y, on ? 4.6 : 3, 0, TAU);
        ctx.fill();
        if (on) {
          ctx.strokeStyle = `rgba(${INK}, ${0.5 * fade})`;
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, TAU);
          ctx.stroke();
        }
      });

      // 熱力圖：一天一個點，跟上面同一條時間軸；軌跡畫到哪、點長到哪
      for (let i = 0; i < counts.length; i++) {
        const p = g.heat(i);
        const c = counts[i];
        const shown = i <= tip ? 1 : 0;
        if (!shown) continue;
        const r = c ? Math.min(4.2, 1.1 + Math.sqrt(c) * 0.55) : 0.7;
        const on = i === day;
        ctx.fillStyle = `rgba(${INK}, ${(on ? 1 : c ? Math.min(1, 0.35 + c / 30) : 0.12) * fade})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, on ? r + 1.5 : r, 0, TAU);
        ctx.fill();
      }

      // 現在：軌跡最前端。爬升時是正在畫的那一點
      const n = nowOf(g, tip);
      const fly = erase * erase * 260;
      const nx = n.x + Math.cos(n.dir) * fly;
      const ny = n.y + Math.sin(n.dir) * fly;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 16 + pulse * 8);
      glow.addColorStop(0, `rgba(${AMBER}, ${0.6 * fade})`);
      glow.addColorStop(1, `rgba(${AMBER}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 24, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(${AMBER}, ${fade})`;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 3.6, 0, TAU);
      ctx.fill();

      // 火焰：往後噴的點，近的是琥珀色、遠的變成墨色，越遠越淡
      for (let k = 0; k < 3; k++) {
        flame.push({
          x: nx,
          y: ny,
          a: n.dir + Math.PI + (Math.random() - 0.5) * 0.5,
          v: 26 + Math.random() * 40,
          life: 0,
        });
      }
      for (let k = flame.length - 1; k >= 0; k--) {
        const p = flame[k];
        p.life += dt;
        if (p.life > FLAME_LIFE) {
          flame.splice(k, 1);
          continue;
        }
        const d = p.v * p.life;
        const q = p.life / FLAME_LIFE;
        const px = Math.round((p.x + Math.cos(p.a) * d) / 2) * 2;
        const py = Math.round((p.y + Math.sin(p.a) * d) / 2) * 2;
        ctx.fillStyle = q < 0.35 ? `rgba(${AMBER}, ${0.9 * (1 - q)})` : `rgba(${INK}, ${0.6 * (1 - q) * fade})`;
        ctx.fillRect(px, py, 2, 2);
      }

      // 火箭：噴嘴對在現在那一點，機身沿著軌跡最後一段的方向
      if (rocket?.complete && rocket.naturalWidth) {
        const rw = rocket.naturalWidth;
        const rh = rocket.naturalHeight;
        const ax = (ROCKET.nose[0] - ROCKET.nozzle[0]) * rw;
        const ay = (ROCKET.nose[1] - ROCKET.nozzle[1]) * rh;
        const sc = ROCKET_LEN / Math.hypot(ax, ay);
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.translate(nx, ny);
        ctx.rotate(n.dir - Math.atan2(ay, ax));
        ctx.drawImage(rocket, -ROCKET.nozzle[0] * rw * sc, -ROCKET.nozzle[1] * rh * sc, rw * sc, rh * sc);
        ctx.restore();
      }
      return { now: { x: n.x, y: n.y }, tip };
    },
  };
}
