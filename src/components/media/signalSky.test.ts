// @vitest-environment jsdom
import { describe, expect, it } from 'vite-plus/test';
import { createSignalSky, visibleArcs, type SkyFrame } from './signalSky';

const TAU = Math.PI * 2;
const span = (arcs: [number, number][]) => arcs.reduce((s, [a, b]) => s + (b - a), 0);

describe('visibleArcs', () => {
  it('整圈都在畫面裡：一整圈', () => {
    expect(visibleArcs(500, 400, 100, 40, 1000, 800)).toEqual([[0, TAU]]);
  });

  it('整圈在畫面外，或畫面整個在圈裡面：不畫', () => {
    expect(visibleArcs(5000, 400, 100, 40, 1000, 800)).toEqual([]);
    expect(visibleArcs(500, 400, 5000, 3000, 1000, 800)).toEqual([]);
  });

  it('大圈只有一部分落在畫面裡：只回那幾段，總長遠小於一圈', () => {
    const arcs = visibleArcs(500, 400, 900, 300, 1000, 800);
    expect(arcs.length).toBeGreaterThan(0);
    expect(span(arcs)).toBeLessThan(TAU * 0.6);
    for (const [a, b] of arcs) expect(b).toBeGreaterThan(a);
  });
});

const NOW = Date.UTC(2026, 9, 30, 12);
const frame = (over: Partial<SkyFrame> = {}): SkyFrame => ({
  w: 1440,
  h: 900,
  now: NOW,
  t: 0,
  s: 0,
  hovered: null,
  bloom: 1,
  ...over,
});

/** 記下呼叫了哪些繪圖方法的假 context（draw 只需要這幾個有回傳值） */
function recorder() {
  const calls: string[] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === 'getTransform') return () => ({ a: 1 });
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient')
        return () => ({ addColorStop: () => undefined });
      return () => {
        calls.push(prop);
      };
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  });
  const count = (name: string) => calls.filter((c) => c === name).length;
  return { ctx: ctx as unknown as CanvasRenderingContext2D, count };
}

describe('背景交給 GPU 畫（media/gpuBackdrop）', () => {
  const sky = createSignalSky([], NOW);

  it('資料照 2D 畫的順序排好：銀河八階、遠方的星八階、閃爍的星；透明度跟 2D 一樣量化成 8 位元', () => {
    const { rects } = sky.gpuBackdrop;
    expect(rects.length % 8).toBe(0);
    const rows = Array.from({ length: rects.length / 8 }, (_, i) => rects.subarray(i * 8, i * 8 + 8));
    expect(rows).toHaveLength(7000 + 2400 + 60);
    const still = rows.slice(0, 9400);
    const twinkle = rows.slice(9400);
    for (const r of still) {
      expect(r[5]).toBe(0);
      expect(r[7]).toBe(1);
      expect(Math.abs(r[4] * 255 - Math.round(r[4] * 255))).toBeLessThan(1e-3);
    }
    for (const r of twinkle) {
      expect(r[5]).toBeGreaterThan(0);
      expect(r[7]).toBe(0);
    }
    // 每一群裡亮度由暗到亮（一階一階畫上去，半透明的重疊處才跟 2D 一樣）
    const nonDecreasing = (list: Float32Array[]) => list.every((r, i) => i === 0 || r[4] >= list[i - 1][4]);
    expect(nonDecreasing(still.slice(0, 7000))).toBe(true);
    expect(nonDecreasing(still.slice(7000))).toBe(true);
  });

  it('歐特雲與兩條小行星帶：每點 6 個數，群組依序是 0、1、2', () => {
    const { points } = sky.gpuBackdrop;
    const groups = Array.from({ length: points.length / 6 }, (_, i) => points[i * 6 + 5]);
    expect(groups).toHaveLength(900 + 700 + 1000);
    expect(groups.every((g, i) => i === 0 || g >= groups[i - 1])).toBe(true);
    expect(new Set(groups)).toEqual(new Set([0, 1, 2]));
  });

  it('backdrop: false 時 2D 不畫背景：沒有光霧、背景的點少掉', () => {
    const all = recorder();
    sky.draw(all.ctx, frame());
    const fg = recorder();
    sky.draw(fg.ctx, frame({ backdrop: false }));
    expect(all.count('drawImage')).toBeGreaterThan(fg.count('drawImage'));
    expect(all.count('fillRect')).toBeGreaterThan(fg.count('fillRect') + 100);
  });

  it('拉遠到看得到歐特雲與小行星帶時，backdrop: false 也不畫它們的點', () => {
    // 從近往遠找：小行星帶看得到的那個距離
    const far = Array.from({ length: 100 }, (_, i) => frame({ s: i / 100 })).find(
      (f) => sky.gpuScene(f, sky.viewOf(f)).belts[0] > 0.2,
    );
    expect(far).toBeDefined();
    if (!far) return;
    const all = recorder();
    sky.draw(all.ctx, far);
    const fg = recorder();
    sky.draw(fg.ctx, { ...far, backdrop: false });
    expect(all.count('fillRect') - fg.count('fillRect')).toBeGreaterThan(500);
  });

  it('鏡頭參數都是有限的數', () => {
    const v = sky.viewOf(frame());
    for (const x of Object.values(v)) expect(Number.isFinite(x)).toBe(true);
    expect(v.k).toBeGreaterThan(0);
  });
});
