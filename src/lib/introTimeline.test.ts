// 開場時間軸。主執行緒只靠這些階段切 DOM（解開內容、收掉跳過鈕），
// 所以「每個階段剛好送一次、順序對、跳過之後一定走到 done」是這裡最要緊的事——
// 漏了 done，內容就一直被藏著。
import { describe, expect, it } from 'vite-plus/test';
import { cubicBezier, INTRO, introFrame, phasesCrossed, phaseTimes, trailFadeFor } from './introTimeline';

/** 以固定步長從 0 跑到 end，收集送出的階段 */
function run(end: number, step: number, skipAt: number | null = null) {
  const out: [string, number][] = [];
  let prev = -1;
  let skipped: number | null = null;
  for (let t = 0; t <= end; t += step) {
    // 跟 runner 一樣：跳過的時間點是收到跳過之後的那一幀
    if (skipAt !== null && skipped === null && t >= skipAt) skipped = t;
    for (const p of phasesCrossed(prev, t, skipped)) out.push([p, t]);
    prev = t;
  }
  return out;
}

describe('cubicBezier', () => {
  it('端點固定、(0,0,1,1) 是線性', () => {
    const linear = cubicBezier(0, 0, 1, 1);
    for (const x of [0, 0.25, 0.5, 0.9, 1]) expect(linear(x)).toBeCloseTo(x, 5);
    const ease = cubicBezier(0.25, 0.1, 0.25, 1);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it('CSS ease 在 0.5 的值（瀏覽器實作的已知值 ≈ 0.8024）', () => {
    expect(cubicBezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3);
  });
});

describe('階段', () => {
  it('完整播完：每個階段剛好一次、照順序、在設計的時間', () => {
    const phases = run(4000, 1000 / 60);
    expect(phases.map(([p]) => p)).toEqual(['started', 'preReveal', 'explosion', 'ending', 'done']);
    const at = Object.fromEntries(phases);
    expect(at.started).toBe(0);
    expect(at.preReveal).toBeGreaterThanOrEqual(INTRO.preReveal);
    expect(at.explosion).toBeGreaterThanOrEqual(INTRO.explosion);
    expect(at.done).toBeGreaterThanOrEqual(INTRO.endStart + INTRO.fadeDuration);
  });

  it('幀率很低（分頁剛切回來、一幀跨過好幾個階段）也一個都不漏', () => {
    expect(run(4000, 1300).map(([p]) => p)).toEqual(['started', 'preReveal', 'explosion', 'ending', 'done']);
  });

  it('開頭就跳過：後面的階段全部提前，0.4 秒內結束', () => {
    const phases = run(4000, 1000 / 60, 500);
    expect(phases.map(([p]) => p)).toEqual(['started', 'preReveal', 'explosion', 'ending', 'done']);
    const at = Object.fromEntries(phases);
    expect(at.done).toBeLessThan(500 + 400);
  });

  it('爆炸之後才跳過：已經過去的階段不重送，淡出照樣提前', () => {
    const times = phaseTimes(3000);
    expect(times.explosion).toBe(INTRO.explosion);
    expect(times.ending).toBe(3080);
    expect(times.done).toBe(3080 + INTRO.fadeDuration);
  });
});

describe('每一幀的狀態', () => {
  it('爆炸前星空被蓋住、星芒在畫；爆炸後反過來', () => {
    expect(introFrame(2800, null)).toMatchObject({ sceneOpacity: 0, streaks: true });
    const after = introFrame(INTRO.explosion + INTRO.sceneFade, null);
    expect(after.streaks).toBe(false);
    expect(after.sceneOpacity).toBe(1);
  });

  it('開場層：淡出前不透明、done 時完全透明', () => {
    expect(introFrame(INTRO.endStart, null).stageOpacity).toBe(1);
    expect(introFrame(INTRO.endStart + INTRO.fadeDuration, null).stageOpacity).toBe(0);
  });

  it('閃光：2200 之前沒有，約 2600 最亮', () => {
    expect(introFrame(2100, null).flashOpacity).toBe(0);
    const peak = INTRO.flashStart + INTRO.flashDuration * 0.37;
    expect(introFrame(peak, null).flashOpacity).toBeCloseTo(1, 5);
    expect(introFrame(peak, null).flashScale).toBeCloseTo(1.6, 5);
  });

  it('土星在爆炸後 200ms 才開始放大', () => {
    expect(introFrame(INTRO.explosion + 199, null).saturnAnimate).toBe(false);
    expect(introFrame(INTRO.explosion + 200, null).saturnAnimate).toBe(true);
  });
});

describe('殘影的淡出量跟更新率無關', () => {
  it('60Hz 一幀就是設計值', () => {
    expect(trailFadeFor(0.12, 1000 / 60)).toBeCloseTo(0.12, 10);
  });

  it('180Hz 連續三幀合起來 = 60Hz 一幀', () => {
    const a = trailFadeFor(0.12, 1000 / 180);
    expect(1 - Math.pow(1 - a, 3)).toBeCloseTo(0.12, 10);
  });
});
