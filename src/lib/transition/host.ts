// 轉場的場景跑在哪：主執行緒（createLocalHost）或轉場的 worker（createWorkerHost，workers/transitionWorker）。
// 控制端（layout/TransitionLayer）不管是哪一種：每幀把讀好的資料交給宿主，宿主回報場景的狀態與效果。
//
// worker 那邊用自己的時鐘畫：主執行緒卡住（新的一頁掛上去）的時候，點與彗尾照樣走。
// 兩邊的 performance.now() 起點不同（timeOrigin），時間點在傳送時換算，對外一律是主執行緒的時鐘。
import type { Pt } from '@/store/pageTransition';
import type { PaintStyle } from './paint';
import { createScene, type FrameInput, type Phase, type PlanInput, type SceneEffects, type SceneStart } from './scene';

/** 一趟的幀：幾幀、最長一幀、超過 50ms 的幾幀、收飛長各自最長的一幀（毫秒） */
export interface FrameStats {
  frames: number;
  maxFrame: number;
  long: number;
  phases: Record<Phase, number>;
}

/** 控制端看得到的場景狀態（時間都是主執行緒的時鐘） */
export interface SceneState {
  phase: Phase;
  from: Pt;
  cam: Pt;
  growAt: number;
  followUntil: number;
  launchAt: number;
  /** 路線排好了 */
  planned: boolean;
  /** 點現在畫在畫面上的哪裡、往哪裡動（px/ms） */
  screen: Pt;
  screenVel: Pt;
}

export interface SceneHost {
  /** 場景現在的狀態；沒有在跑是 null */
  readonly state: SceneState | null;
  /** 這一趟跑完了（點暗下去、彗尾與塵埃散完） */
  readonly done: boolean;
  /**
   * 畫點的那個迴圈的幀（worker 那邊量的）。主執行緒那種是 null：控制端自己的迴圈就是畫點的迴圈，照它量。
   * TX 上報的是看得到的那個點順不順，所以照畫它的迴圈算
   */
  readonly stats: FrameStats | null;
  /**
   * 開始一趟。carry：接著上一趟沒跑完的——上一趟的彗尾與塵埃帶過來照樣散完、點帶著它的速度出發
   * （宿主自己接，不必把彗尾整包傳回控制端）
   */
  begin(start: SceneStart, carry: boolean): void;
  release(now: number): void;
  plan(input: PlanInput, now: number): void;
  /** 每幀：控制端讀好的資料。主執行緒那種當場畫這一幀；worker 那種只送過去，它照自己的時鐘畫 */
  frame(now: number, input: FrameInput): void;
  end(): void;
  /** 換配色、主題 */
  restyle(style: PaintStyle): void;
  dispose(): void;
}

/** 接著上一趟的：點帶著它在畫面上的速度出發（太快的收到 1.2 px/ms），彗尾與塵埃換成畫面座標帶過來 */
export function carried(prev: NonNullable<ReturnType<typeof createScene>['run']>, start: SceneStart): SceneStart {
  const speed = Math.hypot(prev.screenVel.x, prev.screenVel.y);
  const cam = prev.cam;
  return {
    ...start,
    vel: speed > 1.2 ? { x: (prev.screenVel.x / speed) * 1.2, y: (prev.screenVel.y / speed) * 1.2 } : prev.screenVel,
    trail: [...prev.trail.map((q) => ({ x: q.x - cam.x, y: q.y - cam.y, t: q.t })), ...start.trail],
    dust: prev.dust.map((d) => ({ ...d, x: d.x - cam.x, y: d.y - cam.y })),
    carried: true,
  };
}

/** 場景在主執行緒跑（不支援 OffscreenCanvas、worker 起不來時） */
export function createLocalHost(ctx: CanvasRenderingContext2D, style: PaintStyle, fx: SceneEffects): SceneHost {
  const paint = { ...style };
  const scene = createScene(ctx, paint, fx);
  let done = false;
  return {
    get state() {
      const r = scene.run;
      return r
        ? {
            phase: r.phase,
            from: r.from,
            cam: r.cam,
            growAt: r.growAt,
            followUntil: r.followUntil,
            launchAt: r.launchAt,
            planned: r.flight !== null,
            screen: r.screen,
            screenVel: r.screenVel,
          }
        : null;
    },
    get done() {
      return done;
    },
    stats: null,
    begin(start, carry) {
      const prev = scene.run;
      done = false;
      scene.begin(carry && prev ? carried(prev, start) : start);
    },
    release: (now) => scene.release(now),
    plan: (input, now) => scene.plan(input, now),
    // 畫在控制端那張 canvas 上（它這一幀已經清好、量好尺寸，頁面留下的線也畫好了）
    frame(now, input) {
      done = scene.frame(now, input);
    },
    end() {
      scene.end();
      done = false;
    },
    restyle(next) {
      Object.assign(paint, next);
    },
    dispose() {
      scene.end();
    },
  };
}

/** 主執行緒 → worker */
export type ToWorker =
  | { type: 'init'; canvas: OffscreenCanvas; origin: number; style: PaintStyle }
  | { type: 'size'; w: number; h: number; dpr: number }
  | { type: 'style'; style: PaintStyle }
  | { type: 'begin'; start: SceneStart; carry: boolean }
  | { type: 'release'; at: number }
  | { type: 'plan'; input: PlanInput; at: number }
  | { type: 'input'; input: FrameInput }
  | { type: 'end' };

/** worker → 主執行緒：一幀一則，效果照發生的順序 */
export interface FromWorker {
  type: 'frame';
  state: SceneState | null;
  effects: Effect[];
  done: boolean;
  /** 跑完的那一幀才帶 */
  stats?: FrameStats;
}

export type Effect =
  | { kind: 'screen'; p: Pt }
  | { kind: 'page'; transform: string | null; opacity: number }
  | { kind: 'camera'; cam: Pt }
  | { kind: 'planned'; plan: Parameters<SceneEffects['planned']>[0] }
  | { kind: 'grow'; from: Pt; to: Pt; trail: Pt[]; quiet: boolean };

/** 套用 worker 回報的效果 */
function applyEffect(fx: SceneEffects, e: Effect) {
  if (e.kind === 'screen') fx.screen(e.p);
  else if (e.kind === 'page') fx.page(e.transform, e.opacity);
  else if (e.kind === 'camera') fx.camera(e.cam);
  else if (e.kind === 'planned') fx.planned(e.plan);
  else fx.grow(e);
}

/**
 * 場景在轉場的 worker 裡跑，畫在 canvas（transferControlToOffscreen 之後交給它）。
 * 狀態是 worker 上一幀回報的（最多晚一幀）
 */
export function createWorkerHost(canvas: HTMLCanvasElement, style: PaintStyle, fx: SceneEffects): SceneHost {
  const worker = new Worker(new URL('../../workers/transitionWorker.ts', import.meta.url), { type: 'module' });
  const offscreen = canvas.transferControlToOffscreen();
  const post = (m: ToWorker, transfer: Transferable[] = []) => worker.postMessage(m, transfer);
  post({ type: 'init', canvas: offscreen, origin: performance.timeOrigin, style: { ...style } }, [offscreen]);
  const size = () =>
    post({ type: 'size', w: window.innerWidth, h: window.innerHeight, dpr: Math.min(window.devicePixelRatio || 1, 2) });
  size();
  window.addEventListener('resize', size);
  let state: SceneState | null = null;
  let done = false;
  let stats: FrameStats | null = null;
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data;
    state = m.state;
    if (m.done) done = true;
    if (m.stats) stats = m.stats;
    for (const effect of m.effects) applyEffect(fx, effect);
  };
  return {
    get state() {
      return state;
    },
    get done() {
      return done;
    },
    get stats() {
      return stats;
    },
    begin(start, carry) {
      done = false;
      stats = null;
      // 先當作已經開始（worker 下一幀才會回報）：控制端這一幀就要讀到收的那一段
      state = {
        phase: start.phase,
        from: start.from,
        cam: { x: 0, y: 0 },
        growAt: 0,
        followUntil: start.followUntil,
        launchAt: start.phase === 'fly' ? start.t0 : 0,
        planned: false,
        screen: start.from,
        screenVel: { x: 0, y: 0 },
      };
      post({ type: 'begin', start, carry });
    },
    release(now) {
      if (state) state = { ...state, phase: 'fly', launchAt: now };
      post({ type: 'release', at: now });
    },
    plan(input, now) {
      if (state) state = { ...state, planned: true };
      post({ type: 'plan', input, at: now });
    },
    frame(_now, input) {
      post({ type: 'input', input });
    },
    end() {
      state = null;
      done = false;
      post({ type: 'end' });
    },
    restyle(next) {
      post({ type: 'style', style: { ...next } });
    },
    dispose() {
      window.removeEventListener('resize', size);
      worker.terminate();
    },
  };
}
