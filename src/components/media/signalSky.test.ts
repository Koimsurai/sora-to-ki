import { describe, expect, it } from 'vite-plus/test';
import { visibleArcs } from './signalSky';

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
