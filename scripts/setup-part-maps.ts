// 設備頁圖紙的「零件編號圖」：每個像素記著它屬於第幾個零件，滑過零件表時前端只把那個零件的線染成琥珀色。
//
// 以前是手描多邊形，描不準就缺一塊（GPU 少一截散熱片、機殼漏掉一條邊）。現在從線稿本身的像素算：
//   1. 線 = 底稿 alpha 夠高的像素
//   2. 種子：setupPayloads 每個零件的 seeds（多邊形）裡的線、loose（多邊形裡獨立的小碎片）、
//      points 與 at 附近最近的線。多邊形重疊時小的贏（機殼的多邊形包住整台，裡面的零件要比它優先）
//   3. 從種子沿著線往外長（多源 BFS，相隔 GAP 像素以內算連著）：相連的線分給最近的那個零件，
//      所以種子沒蓋到的那一截也會被它自己的零件長到
//   4. 反鋸齒的淡邊（alpha 很低、不算線的）跟著旁邊的編號，染色時邊緣才不會變細
// 輸出：public/illustrations/setup/<art>.parts.png，灰階，值 = 零件序號 + 1（0 是不屬於任何零件）
//
// 用法：pnpm exec tsx scripts/setup-part-maps.ts [--preview <資料夾>]
//   --preview 會另外輸出上色的對照圖，換底稿或調種子時用來檢查
import path from 'node:path';
import sharp from 'sharp';
import { PAYLOADS, type Pt } from '../src/components/about/setupPayloads';

const DIR = path.join(import.meta.dirname, '../public/illustrations/setup');
/** 算「線」的 alpha 門檻 */
const LINE_ALPHA = 40;
/** 相隔幾個像素以內算連著（同一個零件的線之間常有很小的空隙；太大會跨到隔壁零件） */
const GAP = 2;
/** points / at 往外找最近一條線的半徑（像素） */
const SNAP = 60;
/** loose 種子只認多大以內的碎片（像素數） */
const LOOSE_MAX = 4000;

const preview = (() => {
  const i = process.argv.indexOf('--preview');
  return i > 0 ? process.argv[i + 1] : null;
})();

const PALETTE: [number, number, number][] = [
  [233, 193, 122],
  [110, 200, 255],
  [255, 120, 140],
  [140, 230, 140],
  [200, 150, 255],
  [255, 170, 80],
  [90, 230, 210],
  [255, 230, 90],
  [180, 180, 255],
  [255, 140, 220],
  [160, 255, 200],
];

function inside(poly: [number, number][], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const area = (poly: [number, number][]) =>
  Math.abs(
    poly.reduce((s, [x, y], i) => {
      const [nx, ny] = poly[(i + 1) % poly.length];
      return s + x * ny - nx * y;
    }, 0),
  ) / 2;

for (const sheet of PAYLOADS) {
  const src = path.join(DIR, `${sheet.art}.webp`);
  const { data, info } = await sharp(src).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const alpha = data;
  const line = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) line[i] = alpha[i] > LINE_ALPHA ? 1 : 0;
  const label = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  let qHead = 0;
  let qTail = 0;
  const toPx = ([x, y]: Pt): [number, number] => [(x / 100) * W, (y / 100) * H];

  // 2a. 多邊形種子：大的先填、小的後填（小的蓋掉大的）
  const polys = sheet.parts
    .flatMap((p, k) => (p.seeds ?? []).map((s) => ({ k, poly: s.map(toPx) })))
    .sort((a, b) => area(b.poly) - area(a.poly));
  for (const { k, poly } of polys) {
    const xs = poly.map((q) => q[0]);
    const ys = poly.map((q) => q[1]);
    const x0 = Math.max(0, Math.floor(Math.min(...xs)));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (line[i] && inside(poly, x + 0.5, y + 0.5)) label[i] = k + 1;
      }
  }
  // 2a'. loose：只認多邊形裡「小而獨立」的線（浮起來的鍵帽），不會把剛好穿過那裡的長線（桌緣）一起圈進來
  if (sheet.parts.some((p) => p.loose)) {
    const comp = new Int32Array(W * H).fill(-1);
    const size: number[] = [];
    for (let s = 0; s < W * H; s++) {
      if (!line[s] || comp[s] >= 0) continue;
      const id = size.length;
      let n = 0;
      let h = 0;
      let t = 0;
      queue[t++] = s;
      comp[s] = id;
      while (h < t) {
        const i = queue[h++];
        n++;
        const x = i % W;
        const y = (i - x) / W;
        for (let dy = -GAP; dy <= GAP; dy++)
          for (let dx = -GAP; dx <= GAP; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const j = ny * W + nx;
            if (line[j] && comp[j] < 0) {
              comp[j] = id;
              queue[t++] = j;
            }
          }
      }
      size.push(n);
    }
    sheet.parts.forEach((p, k) => {
      for (const s of p.loose ?? []) {
        const poly = s.map(toPx);
        for (let i = 0; i < W * H; i++) {
          if (!line[i] || size[comp[i]] > LOOSE_MAX) continue;
          const x = i % W;
          const y = (i - x) / W;
          if (inside(poly, x + 0.5, y + 0.5)) label[i] = k + 1;
        }
      }
    });
  }
  // 2b. 點種子：at 與 points 各自找最近的一條線
  sheet.parts.forEach((p, k) => {
    for (const q of [p.at, ...(p.points ?? [])]) {
      const [cx, cy] = toPx(q);
      let best = -1;
      let bd = SNAP * SNAP;
      for (let y = Math.max(0, Math.round(cy - SNAP)); y <= Math.min(H - 1, Math.round(cy + SNAP)); y++)
        for (let x = Math.max(0, Math.round(cx - SNAP)); x <= Math.min(W - 1, Math.round(cx + SNAP)); x++) {
          const i = y * W + x;
          const d = (x - cx) ** 2 + (y - cy) ** 2;
          if (line[i] && d < bd) {
            bd = d;
            best = i;
          }
        }
      if (best >= 0 && !label[best]) label[best] = k + 1;
    }
  });
  for (let i = 0; i < W * H; i++) if (label[i]) queue[qTail++] = i;

  // 3. 沿著線往外長：先到先得，所以相連的線歸最近的零件
  while (qHead < qTail) {
    const i = queue[qHead++];
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -GAP; dy <= GAP; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= H) continue;
      for (let dx = -GAP; dx <= GAP; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= W) continue;
        const j = ny * W + nx;
        if (line[j] && !label[j]) {
          label[j] = label[i];
          queue[qTail++] = j;
        }
      }
    }
  }

  // 4. 反鋸齒的淡邊跟著旁邊的編號（讀舊的一份，免得一圈一圈地擴散出去）
  const out = Uint8Array.from(label);
  for (let i = 0; i < W * H; i++) {
    if (label[i] || alpha[i] === 0) continue;
    const x = i % W;
    const y = (i - x) / W;
    search: for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const l = label[ny * W + nx];
        if (l) {
          out[i] = l;
          break search;
        }
      }
  }

  const dst = path.join(DIR, `${sheet.art}.parts.png`);
  await sharp(Buffer.from(out), { raw: { width: W, height: H, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(dst);
  const counts = sheet.parts.map((p, k) => `${p.id}:${out.filter((v) => v === k + 1).length}`);
  console.log(`${sheet.art}.parts.png ${W}×${H}  ${counts.join('  ')}`);

  if (preview) {
    const rgb = Buffer.alloc(W * H * 3, 10);
    for (let i = 0; i < W * H; i++) {
      if (!alpha[i]) continue;
      const a = alpha[i] / 255;
      const c = out[i] ? PALETTE[(out[i] - 1) % PALETTE.length] : [120, 120, 120];
      for (let ch = 0; ch < 3; ch++) rgb[i * 3 + ch] = Math.round(10 + (c[ch] - 10) * a);
    }
    await sharp(rgb, { raw: { width: W, height: H, channels: 3 } })
      .png()
      .toFile(path.join(preview, `${sheet.art}.preview.png`));
  }
}
