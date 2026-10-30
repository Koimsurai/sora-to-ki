// 在 JS 裡算出 CSS transition 此刻的值（CSS Transitions Level 1 §3），結果跟瀏覽器自己跑的一樣。
//
// 用途：每一幀都會改目標值的屬性（首頁字卡的透明度，home/HomeOrbit）。交給 CSS 的話每改一次，
// 瀏覽器就取消舊的轉場、建一個新的，每一幀都要為它重算樣式——慢手機上那是主執行緒最貴的一塊。
// 改成這裡照同一套規則算出值、直接寫進 style（元素本身不帶 transition），畫面一樣、少了重建轉場的成本。
//
// 規則（照規格）：
//   - 目標變了：從「此刻的值」起跑，走完整的時間
//   - 新目標正好是原本那段的起點（例如滑過去又馬上移開）：反過來走，時間照已經走了多少縮短（reversing shortening）
//   - 此刻的值已經等於新目標：直接停在那裡，不起跑

/** CSS 的 cubic-bezier()（跟瀏覽器一樣，先用牛頓法解 x，不收斂再二分） */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solveX = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-7) return t;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    while (lo < hi) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-7) return t;
      if (x > v) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
      if (hi - lo < 1e-7) break;
    }
    return t;
  };
  return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sampleY(solveX(x)));
}

/** CSS 的 ease */
export const cssEase = cubicBezier(0.25, 0.1, 0.25, 1);

interface Running {
  from: number;
  to: number;
  start: number;
  duration: number;
  /** 規格的 reversing-adjusted start value 與 reversing shortening factor */
  reversingStart: number;
  factor: number;
}

export interface TransitionValue {
  /** 時間 now（毫秒，跟 rAF 的時間戳同一個時鐘）時目標改成 target */
  set(target: number, now: number, duration: number): void;
  /** 時間 now 的值 */
  at(now: number): number;
  /** now 時還在轉 */
  running(now: number): boolean;
}

export function transitionValue(initial: number, easing: (t: number) => number = cssEase): TransitionValue {
  let value = initial;
  let run: Running | null = null;
  const progress = (r: Running, now: number) =>
    r.duration <= 0 ? 1 : Math.min(1, Math.max(0, (now - r.start) / r.duration));
  const at = (now: number) => {
    if (!run) return value;
    const p = progress(run, now);
    if (p >= 1) {
      value = run.to;
      run = null;
      return value;
    }
    return run.from + (run.to - run.from) * easing(p);
  };
  return {
    at,
    running: (now) => run !== null && progress(run, now) < 1,
    set(target, now, duration) {
      const current = at(now);
      const old = run;
      if (old ? old.to === target : current === target) return;
      if (current === target || duration <= 0) {
        value = target;
        run = null;
        return;
      }
      if (old?.reversingStart === target) {
        const factor = Math.min(1, Math.abs(easing(progress(old, now)) * old.factor + (1 - old.factor)));
        run = { from: current, to: target, start: now, duration: duration * factor, reversingStart: old.to, factor };
      } else {
        run = { from: current, to: target, start: now, duration, reversingStart: current, factor: 1 };
      }
      value = current;
    },
  };
}
