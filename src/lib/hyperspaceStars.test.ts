// 開場星芒的模擬。輸出的三個陣列直接當 GPU 的 instanced 屬性用，
// 而且一個 draw call 依 instance 順序混色——所以順序與筆數就是畫面。
import { describe, expect, it } from 'vite-plus/test';
import { createHyperspaceStars, MAX_STREAKS, STREAK_CORE, STREAK_GLOW } from './hyperspaceStars';

const W = 1440;
const H = 900;

function stepFor(ms: number, speedMult = 1) {
  const sim = createHyperspaceStars(W, H);
  for (let t = 0; t <= ms; t += 1000 / 60) sim.step(t, 1000 / 60, speedMult, W, H);
  return sim.buffers;
}

describe('hyperspaceStars', () => {
  it('筆數不超過 GPU 那邊配置的上限', () => {
    const b = stepFor(1500);
    expect(b.count).toBeGreaterThan(0);
    expect(b.count).toBeLessThanOrEqual(MAX_STREAKS);
  });

  // 以前 2D canvas 是逐顆星「先光暈、再亮核」地畫，疊色順序就是這樣；
  // 光暈一定緊接著同一顆星的亮核，不能分成兩批。
  it('光暈後面一定緊跟同一顆星的亮核', () => {
    const b = stepFor(1500);
    let glows = 0;
    for (let i = 0; i < b.count; i++) {
      if (b.c[i * 4 + 1] !== STREAK_GLOW) continue;
      glows += 1;
      const j = i + 1;
      expect(b.c[j * 4 + 1]).toBe(STREAK_CORE);
      for (let k = 0; k < 4; k++) expect(b.a[j * 4 + k]).toBe(b.a[i * 4 + k]); // 同一個尾端與方向
    }
    expect(glows).toBeGreaterThan(0);
  });

  it('亮度都在有效範圍、線寬至少半個像素', () => {
    const b = stepFor(1500);
    for (let i = 0; i < b.count; i++) {
      const intensity = b.b[i * 4 + 2];
      expect(intensity).toBeGreaterThanOrEqual(0.02);
      expect(intensity).toBeLessThanOrEqual(1);
      expect(b.b[i * 4 + 1]).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('速度為 0 時星星不動（減速到停之後畫面靜止）', () => {
    const sim = createHyperspaceStars(W, H);
    sim.step(2000, 16, 0, W, H);
    const first = Float32Array.from(sim.buffers.a.subarray(0, sim.buffers.count * 4));
    sim.step(2016, 16, 0, W, H);
    // 只比尾端位置：鏡頭有極輕微的晃動（中心點跟時間走），所以拿同一個 elapsed 比
    sim.step(2000, 16, 0, W, H);
    expect(Float32Array.from(sim.buffers.a.subarray(0, sim.buffers.count * 4))).toEqual(first);
  });
});
