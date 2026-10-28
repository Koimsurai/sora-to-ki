// WebGPU 星空 worker entry——純訊息轉接（場景/渲染邏輯全在 lib/starfieldGpu.ts，
// 與主執行緒 fallback 共用同一份 code）。
//
// 汰換 @react-three/offscreen 的理由（實測過的坑）：
//   ‧ 它的協定走 structured clone，傳不了 WebGPURenderer 需要的 async factory
//   ‧ handleProps 無 try/catch（init 失敗後任何 props 訊息都在 worker 內 uncaught throw）
//   ‧ worker 內 shim self.document={} 干擾環境判定
// 這裡協定極簡：init / resize / running / scroll / saturn / glow / collapse / stars，錯誤一律回報主執行緒處理。
// 回程：ready / perf / lost / error，以及首頁衛星的位置（satellites）。
import { createStarfieldRunner, type StarfieldRunner } from '../lib/starfieldGpu';
import type { Fold } from '../lib/viewportFold';

interface InitMsg {
  type: 'init';
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  fold?: Fold | null;
  dpr: number;
  lite?: boolean;
}
interface ResizeMsg {
  type: 'resize';
  width: number;
  height: number;
  /** 摺疊機摺起來時的兩半（主執行緒讀 window.viewport.segments 轉來） */
  fold?: Fold | null;
}
interface RunningMsg {
  type: 'running';
  value: boolean;
}
interface ScrollMsg {
  type: 'scroll';
  y: number;
}
interface SaturnMsg {
  type: 'saturn';
  visible: boolean;
  animate: boolean;
}
/** 首頁衛星的亮度（見 store/homeOrbit） */
interface GlowMsg {
  type: 'glow';
  glow: number[];
}
/** 換頁轉場的「收」：土星收進第 index 顆衛星（-1 是中心）。只在跑著的時候有意義，不補放 */
interface CollapseMsg {
  type: 'collapse';
  index: number;
}
/** 星星淡出／淡回：頁面自己畫背景時讓出來（補放：init 前就到的話 ready 後照著設） */
interface StarsMsg {
  type: 'stars';
  visible: boolean;
}
/** 換頁的鏡頭移動時星空跟著轉：累積的位移（畫面像素，補放同上） */
interface PanMsg {
  type: 'pan';
  x: number;
  y: number;
}
type InMsg = InitMsg | ResizeMsg | RunningMsg | ScrollMsg | SaturnMsg | GlowMsg | CollapseMsg | StarsMsg | PanMsg;

let runner: StarfieldRunner | null = null;
// init 是 async（renderer.init + 貼圖）——先到的狀態訊息記下來，ready 後補放
let lastScroll = 0;
let lastSaturn: { visible: boolean; animate: boolean } | null = null;
// ⚠ running 也必須補放，理由跟上面兩個不同：它不只是「狀態晚一點才對」。
//
// runner 建好時預設是跑的。所以 init 期間抵達的 `running:false` 被丟掉的話，
// 使用者已經進了全螢幕、背景卻在 init 完成後自己跑起來——而暫停這件事存在的唯一理由
// 就是「全螢幕播影片時不要跟影片搶 GPU」（見 SpaceBackdropShell 的長註解：
// 沒停掉時 Edge 上連續 seek 第 8~15 次就會把媒體管線卡死）。
// 冷啟動第一次進文章頁按全螢幕正好落在這個窗口裡。
let lastRunning: boolean | null = null;
let lastGlow: number[] | null = null;
let lastStars: boolean | null = null;
let lastPan: { x: number; y: number } | null = null;

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    void (async () => {
      try {
        const {
          runner: r,
          backend,
          timing,
        } = await createStarfieldRunner({
          canvas: msg.canvas,
          width: msg.width,
          height: msg.height,
          fold: msg.fold,
          dpr: msg.dpr,
          lite: msg.lite,
          onPerf: (report) => self.postMessage({ type: 'perf', report }),
          // device lost：worker 裡的 console.error 不會出現在頁面 console，而且這個 renderer
          // 之後一幀都不會再畫。轉給主執行緒，由它換一張新 canvas 重建（見 StarfieldGpu）。
          onDeviceLost: (message) => self.postMessage({ type: 'lost', message }),
          onSatellites: (positions, at) => self.postMessage({ type: 'satellites', positions, at }),
        });
        runner = r;
        runner.setScroll(lastScroll);
        if (lastSaturn) runner.setSaturn(lastSaturn.visible, lastSaturn.animate);
        if (lastRunning !== null) runner.setRunning(lastRunning);
        if (lastGlow) runner.setSatelliteGlow(lastGlow);
        if (lastStars !== null) runner.setStars(lastStars);
        if (lastPan) runner.setPan(lastPan.x, lastPan.y);
        self.postMessage({ type: 'ready', backend, timing });
      } catch (err) {
        self.postMessage({ type: 'error', message: String(err) });
      }
    })();
  } else if (msg.type === 'resize') {
    runner?.setSize(msg.width, msg.height, msg.fold);
  } else if (msg.type === 'running') {
    lastRunning = msg.value;
    runner?.setRunning(msg.value);
  } else if (msg.type === 'scroll') {
    lastScroll = msg.y;
    runner?.setScroll(msg.y);
  } else if (msg.type === 'glow') {
    lastGlow = msg.glow;
    runner?.setSatelliteGlow(msg.glow);
  } else if (msg.type === 'stars') {
    lastStars = msg.visible;
    runner?.setStars(msg.visible);
  } else if (msg.type === 'pan') {
    lastPan = { x: msg.x, y: msg.y };
    runner?.setPan(msg.x, msg.y);
  } else if (msg.type === 'collapse') {
    runner?.collapseSaturnTo(msg.index);
    lastSaturn = { visible: true, animate: false };
  } else {
    // 到這裡 union 只剩 SaturnMsg，再比對一次 msg.type 是恆真。
    // 日後新增訊息型別時，下面存取 msg.visible/msg.animate 會編譯失敗——不會被靜默吞掉。
    lastSaturn = { visible: msg.visible, animate: msg.animate };
    runner?.setSaturn(msg.visible, msg.animate);
  }
};
