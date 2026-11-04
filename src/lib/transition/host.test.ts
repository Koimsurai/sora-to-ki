import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createWorkerHost, type FromWorker, type SceneState, type ToWorker } from './host';
import { createScene, type PlanInput, type SceneEffects, type SceneStart } from './scene';

// 換頁轉場的路線一趟只能排一次。排第二次的話頁面被藏回透明、鏡頭從半路重飛：
// 文章頁長到一半閃一下，手記頁變成先長再飛。worker 的回報比送出去的指令晚一則時，
// 控制端會以為還沒排而再排一次（手記 ↔ 文章來回切換時大約一半的趟數會這樣）。

const style = { ink: '#fff', amber: '#e9c17a', ground: '#000', theme: 'saturn' as const };

const effects = () => {
  const calls: string[] = [];
  const fx: SceneEffects = {
    screen: () => undefined,
    page: () => calls.push('page'),
    camera: () => undefined,
    planned: () => calls.push('planned'),
    grow: () => calls.push('grow'),
  };
  return { fx, calls };
};

const start = (phase: 'leave' | 'fly'): SceneStart => ({
  phase,
  t0: 0,
  from: { x: 600, y: 300 },
  vel: { x: 0, y: 0 },
  followUntil: 0,
  trail: [],
  dust: [],
  carried: false,
  quiet: false,
});

const input: PlanInput = { anchor: { x: 100, y: 100 }, arrival: null, w: 1280, h: 800, ring: false };

describe('createScene 的 plan', () => {
  it('一趟只排一次', () => {
    const { fx, calls } = effects();
    const scene = createScene({} as CanvasRenderingContext2D, style, fx);
    scene.begin(start('leave'));
    scene.release(10);
    scene.plan(input, 20);
    const flight = scene.run?.flight;
    scene.plan({ ...input, anchor: { x: 900, y: 600 } }, 40);
    expect(calls.filter((c) => c === 'planned')).toHaveLength(1);
    expect(scene.run?.flight).toBe(flight);
  });

  it('還在收的時候不排', () => {
    const { fx, calls } = effects();
    const scene = createScene({} as CanvasRenderingContext2D, style, fx);
    scene.begin(start('leave'));
    scene.plan(input, 5);
    expect(calls).toEqual([]);
    expect(scene.run?.flight).toBeNull();
  });
});

describe('createWorkerHost 的狀態', () => {
  afterEach(() => vi.unstubAllGlobals());

  const setup = () => {
    const sent: ToWorker[] = [];
    const workers: { onmessage: ((e: { data: FromWorker }) => void) | null }[] = [];
    vi.stubGlobal('window', {
      innerWidth: 1280,
      innerHeight: 800,
      devicePixelRatio: 1,
      addEventListener: () => undefined,
    });
    vi.stubGlobal(
      'Worker',
      class {
        onmessage: ((e: { data: FromWorker }) => void) | null = null;
        constructor() {
          workers.push(this);
        }
        postMessage(m: ToWorker) {
          sent.push(m);
        }
      },
    );
    const canvas = { transferControlToOffscreen: () => ({}) } as unknown as HTMLCanvasElement;
    const applied: string[] = [];
    const host = createWorkerHost(canvas, style, {
      screen: () => undefined,
      page: () => applied.push('page'),
      camera: () => undefined,
      planned: () => undefined,
      grow: () => undefined,
    });
    const reply = (id: number, state: Partial<SceneState>, fx: FromWorker['effects'] = []) =>
      workers[0]?.onmessage?.({
        data: {
          type: 'frame',
          id,
          state: {
            phase: 'fly',
            from: { x: 0, y: 0 },
            cam: { x: 0, y: 0 },
            growAt: 0,
            followUntil: 0,
            launchAt: 0,
            planned: false,
            screen: { x: 0, y: 0 },
            screenVel: { x: 0, y: 0 },
            ...state,
          },
          effects: fx,
          done: false,
        },
      });
    const lastBegin = () => {
      const m = sent.filter((x) => x.type === 'begin').at(-1);
      if (m?.type !== 'begin') throw new Error('還沒有 begin');
      return m;
    };
    return { host, reply, applied, lastBegin };
  };

  it('排了之後，worker 還沒收到時畫的那一幀不會把它蓋回「還沒排」', () => {
    const { host, reply, lastBegin } = setup();
    host.begin(start('leave'), false);
    const { id } = lastBegin();
    host.release(100);
    host.plan(input, 120);
    reply(id, { phase: 'fly', planned: false });
    expect(host.state?.planned).toBe(true);
  });

  it('放行之後，還在收的那一幀不會把它蓋回收', () => {
    const { host, reply, lastBegin } = setup();
    host.begin(start('leave'), false);
    const { id } = lastBegin();
    host.release(100);
    reply(id, { phase: 'leave', launchAt: 0 });
    expect(host.state?.phase).toBe('fly');
    expect(host.state?.launchAt).toBe(100);
  });

  it('上一趟晚到的回報不算這一趟的，它的效果也不套用', () => {
    const { host, reply, applied, lastBegin } = setup();
    host.begin(start('leave'), false);
    const first = lastBegin().id;
    host.begin(start('leave'), true);
    reply(first, { phase: 'grow', planned: true }, [{ kind: 'page', transform: '', opacity: 1 }]);
    expect(host.state?.phase).toBe('leave');
    expect(applied).toEqual([]);
    host.end();
    reply(lastBegin().id, { phase: 'fly' });
    expect(host.state).toBeNull();
  });
});
