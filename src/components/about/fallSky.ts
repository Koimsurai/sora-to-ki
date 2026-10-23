// 關於頁的近景（about/AboutFall）：下墜時往上掠過的細線、落地時升上來的地平線與一棵樹、
// 跟著降下來的返回艙（降落傘著地後倒下收掉）、往下挖時一層一層越來越密的地層、地心的一點琥珀光，
// 以及右邊的高度計。畫布固定在視窗上，位置都由捲動算出來；這裡只有畫圖，不碰 React。

const TAU = Math.PI * 2;
const INK = '241, 236, 227';
const AMBER = '233, 193, 122';
/** 起點的高度（公里）：地球同步軌道那麼高 */
const TOP_KM = 36000;
/** 地底的深度刻度（公尺）：挖到地心是這麼深 */
const CORE_M = 320;

/** 返回艙插圖（public/illustrations/reentry-parachute.webp）：原圖尺寸、傘與艙的分界、吊帶的位置、腳底 */
const CW = 483;
const CH = 900;
const SPLIT = 0.78;
const RISER = [0.5, 0.6] as const;
const FOOT = 0.94;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const fmt = (n: number) => n.toLocaleString('en-US');

export interface FallState {
  w: number;
  h: number;
  /** 秒 */
  t: number;
  dt: number;
  /** 頁面捲了多少（頁面座標） */
  top: number;
  /** 0 到 1：捲得多快（往上掠過的線就拖多長） */
  speed: number;
  /** 各段在頁面座標裡的位置 */
  landTop: number;
  layerTop: number;
  coreMid: number;
  chapterMids: number[];
  maxScroll: number;
  /** 高度計上的兩個字（已經翻好） */
  labels: { fall: string; dig: string };
  /** 字型堆疊（高度計的數字用等寬字） */
  mono: string;
}

export function createFallSky(streakCount: number, chute: HTMLImageElement) {
  const streaks = Array.from({ length: streakCount }, () => ({
    x: Math.random(),
    y: Math.random(),
    l: 0.4 + Math.random(),
    a: 0.06 + Math.random() * 0.2,
  }));
  // 落地那顆星球上唯一的一棵樹：遞迴分叉的線
  const tree: [number, number, number, number, number][] = [];
  const grow = (x: number, y: number, ang: number, len: number, d: number) => {
    if (d > 7) return;
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    tree.push([x, y, x2, y2, d]);
    grow(x2, y2, ang - 0.38 - Math.random() * 0.2, len * 0.74, d + 1);
    grow(x2, y2, ang + 0.34 + Math.random() * 0.2, len * 0.7, d + 1);
  };
  grow(0, 0, -Math.PI / 2, 34, 0);
  let landedAt = -1;

  function draw(ctx: CanvasRenderingContext2D, s: FallState) {
    const { w, h, t, dt, top } = s;
    ctx.clearRect(0, 0, w, h);
    const landAt = s.landTop - h * 0.25;
    const pFall = Math.min(1, Math.max(0, top / landAt));
    const landK = smooth(landAt - h * 0.9, landAt, top);
    const dig = Math.max(0, top - (s.layerTop - h * 0.75));
    ctx.lineWidth = 1;

    // 下墜：往上掠過的細線，捲得越快拖得越長（落地後收掉）
    const sky = 1 - landK;
    if (sky > 0.01) {
      for (const st of streaks) {
        st.y -= dt * (0.02 + s.speed * 1.6) * (0.5 + st.l);
        if (st.y < -0.2) {
          st.y = 1.1;
          st.x = Math.random();
        }
        const len = (6 + s.speed * 130) * st.l;
        const x = st.x * (w - 160) + 20;
        ctx.strokeStyle = `rgba(${INK}, ${(st.a * sky).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(x, st.y * h);
        ctx.lineTo(x, st.y * h + len);
        ctx.stroke();
      }
    }

    // 地平線與樹：落地時升上來，往下挖時跟著往上捲走
    const R = Math.max(w, h) * 1.6;
    const cx = w * 0.5;
    const horizonY = h - 150 + (1 - landK) * 220 - dig;
    if (landK > 0.01 && horizonY > -h) {
      const cy = horizonY + R;
      ctx.strokeStyle = `rgba(${INK}, ${0.5 * landK})`;
      ctx.beginPath();
      ctx.arc(cx, cy, R, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      // 樹與返回艙落在地平線上：照畫面寬度擺（窄螢幕靠近一點），再找出地平線在那裡的高度
      const narrow = w < 760;
      const onHorizon = (fx: number) => {
        const x = w * fx;
        return { x, y: cy - Math.sqrt(Math.max(0, R * R - (x - cx) ** 2)) };
      };
      const { x: tx, y: ty } = onHorizon(narrow ? 0.16 : 0.2);
      for (const [x1, y1, x2, y2, d] of tree) {
        ctx.strokeStyle = `rgba(${INK}, ${landK * (0.75 - d * 0.07)})`;
        ctx.beginPath();
        ctx.moveTo(tx + x1, ty + y1);
        ctx.lineTo(tx + x2, ty + y2);
        ctx.stroke();
      }
      // 返回艙：從上面降下來，「就此落下」那一刻著地；傘著地後往右倒、往下沉、淡掉
      if (chute.complete && chute.naturalWidth) {
        const { x: gx, y: gy } = onHorizon(narrow ? 0.7 : 0.76);
        const dh = Math.min(narrow ? 170 : 250, h * 0.34);
        const dw = CW * (dh / CH);
        if (landK > 0.995) {
          if (landedAt < 0) landedAt = t;
        } else landedAt = -1;
        const c = landedAt < 0 ? 0 : Math.min(1, (t - landedAt) / 1.6);
        const drop = Math.pow(1 - landK, 1.3) * (gy + dh);
        const footY = gy - drop + 2;
        const left = gx - dw / 2;
        const topY = footY - FOOT * dh;
        const sway = Math.sin(t * 0.9) * 0.07 * (1 - landK);
        const rx = left + RISER[0] * dw;
        const ry = topY + RISER[1] * dh;
        ctx.save();
        ctx.globalAlpha = landK;
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(sway);
        ctx.translate(-rx, -ry);
        ctx.drawImage(chute, 0, SPLIT * CH, CW, (1 - SPLIT) * CH, left, topY + SPLIT * dh, dw, (1 - SPLIT) * dh);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = landK * (1 - 0.9 * c);
        ctx.translate(rx, ry);
        ctx.rotate(sway + c * 1.1);
        ctx.translate(-rx + c * 26, -ry + c * 30);
        ctx.drawImage(chute, 0, 0, CW, SPLIT * CH, left, topY, dw, SPLIT * dh);
        ctx.restore();
        ctx.restore();
      }
    }

    // 地層：地平線以下，一層一層越來越密的點線
    if (dig > 0) {
      for (let k = 1; k < 40; k++) {
        const ly = horizonY + 40 + k * 120;
        if (ly < -10) continue;
        if (ly > h + 10) break;
        const gap = Math.max(3, 14 - k * 0.9);
        ctx.fillStyle = `rgba(${INK}, ${Math.min(0.5, 0.12 + k * 0.03)})`;
        for (let x = 0; x < w; x += gap) ctx.fillRect(x, ly + Math.sin(x * 0.01 + k) * 6, 1.2, 1.2);
      }
      // 地心：一點琥珀色的光
      const cyCore = s.coreMid - top;
      if (cyCore < h + 200) {
        const g = ctx.createRadialGradient(w / 2, cyCore, 0, w / 2, cyCore, 260);
        g.addColorStop(0, `rgba(${AMBER}, 0.14)`);
        g.addColorStop(1, `rgba(${AMBER}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(w / 2, cyCore, 260, 0, TAU);
        ctx.fill();
      }
    }

    // 高度計：下墜時是離地表幾公里，往下挖時換成地表以下幾公尺。窄螢幕貼著右邊
    const rx = w - (w < 760 ? 28 : 60);
    const y0 = 96;
    const y1 = h - 80;
    const digging = dig > 0;
    const digSpan = Math.max(1, s.maxScroll - (s.layerTop - h * 0.75));
    const mark = digging ? Math.min(1, dig / digSpan) : pFall;
    ctx.strokeStyle = `rgba(${INK}, 0.22)`;
    ctx.beginPath();
    ctx.moveTo(rx, y0);
    ctx.lineTo(rx, y1);
    ctx.stroke();
    if (!digging) {
      for (const mid of s.chapterMids) {
        const y = y0 + (y1 - y0) * Math.min(1, Math.max(0, (mid - h * 0.5) / landAt));
        ctx.strokeStyle = `rgba(${INK}, 0.35)`;
        ctx.beginPath();
        ctx.moveTo(rx - 5, y);
        ctx.lineTo(rx, y);
        ctx.stroke();
      }
    }
    const my = y0 + (y1 - y0) * mark;
    const g = ctx.createRadialGradient(rx, my, 0, rx, my, 10);
    g.addColorStop(0, `rgba(${AMBER}, 0.6)`);
    g.addColorStop(1, `rgba(${AMBER}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(rx, my, 10, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgb(${AMBER})`;
    ctx.beginPath();
    ctx.arc(rx, my, 2.6, 0, TAU);
    ctx.fill();
    ctx.font = `11px ${s.mono}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = `rgba(${INK}, 0.75)`;
    const reading = digging
      ? `${fmt(Math.round(mark * CORE_M))} m`
      : `${fmt(Math.round(TOP_KM * Math.pow(1 - pFall, 1.7)))} km`;
    ctx.fillText(reading, rx - 12, my + 4);
    ctx.fillStyle = `rgba(${INK}, 0.35)`;
    ctx.fillText(digging ? s.labels.dig : s.labels.fall, rx - 12, y0 - 16);
  }

  return { draw };
}
