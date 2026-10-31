// 換頁轉場的 worker：點、彗尾、塵埃與各主題的那一筆在這裡畫（lib/transition/scene），照自己的時鐘。
// 主執行緒卡住（新的一頁掛上去、資料到了重繪）時，轉場照樣走。協定見 lib/transition/host
import {
  carried,
  type Effect,
  type FrameStats,
  type FromWorker,
  type SceneState,
  type ToWorker,
} from '../lib/transition/host';
import type { PaintStyle } from '../lib/transition/paint';
import { createScene, type FrameInput, type Scene } from '../lib/transition/scene';

/** 主執行緒的時間 + shift = 這裡的時間（兩邊 performance.now() 的起點不同） */
let shift = 0;
const local = (t: number) => t + shift;
const remote = (t: number) => t - shift;

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let scene: Scene | null = null;
let style: PaintStyle | null = null;
let w = 0;
let h = 0;
let dpr = 1;
let input: FrameInput | null = null;
let raf = 0;
let effects: Effect[] = [];
let done = false;
/** 這一趟的幀（TX 照它上報：看得到的點是這裡畫的） */
let stats: FrameStats = { frames: 0, maxFrame: 0, long: 0, phases: { leave: 0, fly: 0, grow: 0 } };
let prevFrame = 0;

const nextFrame: (fn: (now: number) => void) => number =
  typeof self.requestAnimationFrame === 'function'
    ? (fn) => self.requestAnimationFrame(fn)
    : (fn) => self.setTimeout(() => fn(performance.now()), 16);
const cancelFrame = (id: number) =>
  typeof self.cancelAnimationFrame === 'function' ? self.cancelAnimationFrame(id) : self.clearTimeout(id);

const report = () => {
  const r = scene?.run ?? null;
  const state: SceneState | null = r
    ? {
        phase: r.phase,
        from: r.from,
        cam: r.cam,
        growAt: remote(r.growAt),
        followUntil: remote(r.followUntil),
        launchAt: remote(r.launchAt),
        planned: r.flight !== null,
        screen: r.screen,
        screenVel: r.screenVel,
      }
    : null;
  const message: FromWorker = { type: 'frame', state, effects, done, ...(done ? { stats } : {}) };
  self.postMessage(message);
  effects = [];
};

const frame = (now: number) => {
  raf = 0;
  if (!scene?.run || !ctx || !canvas || !input) return;
  raf = nextFrame(frame);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const phase = scene.run.phase;
  if (prevFrame) {
    const d = now - prevFrame;
    stats.frames++;
    stats.maxFrame = Math.max(stats.maxFrame, d);
    stats.phases[phase] = Math.max(stats.phases[phase], d);
    if (d > 50) stats.long++;
  }
  prevFrame = now;
  try {
    done = scene.frame(now, input);
  } catch (err) {
    // 哪一頁給的路出了錯：收掉，主執行緒照常收尾
    console.error('[transitionWorker]', err);
    done = true;
  }
  report();
  if (done) {
    cancelFrame(raf);
    raf = 0;
  }
};

const start = () => {
  if (!raf) raf = nextFrame(frame);
};

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'init') {
    canvas = m.canvas;
    ctx = canvas.getContext('2d');
    shift = m.origin - performance.timeOrigin;
    style = { ...m.style };
    if (!ctx) return;
    scene = createScene(ctx, style, {
      screen: (p) => effects.push({ kind: 'screen', p }),
      page: (transform, opacity) => effects.push({ kind: 'page', transform, opacity }),
      camera: (cam) => effects.push({ kind: 'camera', cam }),
      // 路線的時間點換成主執行緒的時鐘（那邊照它把頁面的位移交給合成器）
      planned: ({ translate, flight }) =>
        effects.push({
          kind: 'planned',
          plan: { translate, flight: flight && { ...flight, path: { ...flight.path, at: remote(flight.path.at) } } },
        }),
      grow: (g) => effects.push({ kind: 'grow', ...g }),
    });
  } else if (m.type === 'size') {
    ({ w, h, dpr } = m);
  } else if (m.type === 'style') {
    if (style) Object.assign(style, m.style);
  } else if (!scene) {
    return;
  } else if (m.type === 'begin') {
    const s = m.start;
    const begin = {
      ...s,
      t0: local(s.t0),
      followUntil: local(s.followUntil),
      trail: s.trail.map((q) => ({ ...q, t: local(q.t) })),
    };
    const prev = scene.run;
    done = false;
    scene.begin(m.carry && prev ? carried(prev, begin) : begin);
    stats = { frames: 0, maxFrame: 0, long: 0, phases: { leave: 0, fly: 0, grow: 0 } };
    prevFrame = 0;
    input = null;
  } else if (m.type === 'release') {
    scene.release(local(m.at));
  } else if (m.type === 'plan') {
    scene.plan(m.input, local(m.at));
  } else if (m.type === 'input') {
    input = m.input;
    start();
  } else {
    scene.end();
    input = null;
    done = false;
    if (raf) cancelFrame(raf);
    raf = 0;
    ctx?.clearRect(0, 0, canvas?.width ?? 0, canvas?.height ?? 0);
  }
};
