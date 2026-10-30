import { describe, expect, it } from 'vite-plus/test';
import { cssEase, cubicBezier, transitionValue } from './cssTransition';

describe('cubicBezier', () => {
  it('兩端固定、linear 是直線', () => {
    const linear = cubicBezier(0, 0, 1, 1);
    expect(linear(0.37)).toBeCloseTo(0.37, 6);
    expect(cssEase(0)).toBe(0);
    expect(cssEase(1)).toBe(1);
  });

  it('ease 的中點跟瀏覽器一樣（約 0.8024）', () => {
    expect(cssEase(0.5)).toBeCloseTo(0.8024, 3);
  });
});

describe('transitionValue', () => {
  it('從現在的值走到目標，走完停在目標', () => {
    const v = transitionValue(0);
    v.set(1, 1000, 300);
    expect(v.at(1000)).toBe(0);
    expect(v.at(1150)).toBeCloseTo(cssEase(0.5), 6);
    expect(v.at(1300)).toBe(1);
    expect(v.running(1300)).toBe(false);
  });

  it('中途改目標：從當下的值重新起跑，不跳', () => {
    const v = transitionValue(0);
    v.set(1, 0, 300);
    const mid = v.at(100);
    v.set(0.5, 100, 300);
    expect(v.at(100)).toBeCloseTo(mid, 9);
    expect(v.at(400)).toBe(0.5);
  });

  it('改回原本的起點：反過來走，時間照走過的比例縮短', () => {
    const v = transitionValue(0);
    v.set(1, 0, 300);
    const p = cssEase(150 / 300);
    v.set(0, 150, 300);
    // 縮短後的時間是 300 × p，走完就回到 0
    expect(v.at(150 + 300 * p - 1)).toBeGreaterThan(0);
    expect(v.at(150 + 300 * p)).toBe(0);
  });

  it('時間是 0（要求減少動態）：直接到目標', () => {
    const v = transitionValue(0);
    v.set(1, 0, 0);
    expect(v.at(0)).toBe(1);
  });

  it('目標沒變不重新起跑', () => {
    const v = transitionValue(0);
    v.set(1, 0, 300);
    v.set(1, 100, 300);
    expect(v.at(300)).toBe(1);
  });
});
