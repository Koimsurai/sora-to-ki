// WebGPU 星空 runner——純 three/webgpu 命令式（無 React、無 R3F、無 pmndrs postprocessing）。
//
// 同一份 code 兩處跑：
//   ‧ worker（OffscreenCanvas，主路徑）—— src/workers/spaceGpuWorker.ts 轉接
//   ‧ 主執行緒 fallback（無 OffscreenCanvas 的瀏覽器）—— StarfieldGpu.tsx 直接呼叫
// backend 也是同一份 code 兩條：WebGPU（有 adapter）/ WebGL2（three 自動 fallback）。
//
// bloom 走 three 原生 TSL RenderPipeline（r183+ 節點式後處理；BloomNode 官方用法），
// 參數對齊現行 pmndrs 星空（intensity 0.9 / threshold 0.25）。之後單 canvas 合併時
// 這裡的 pass 換成 setMRT(mrt({output, emissive})) 做 selective bloom（官方文件同款）。
import * as THREE from 'three/webgpu';
import {
  Fn,
  abs,
  asin,
  atan,
  exp,
  fract,
  fwidth,
  mx_noise_float,
  positionLocal,
  pow,
  select,
  pass,
  mrt,
  output,
  float,
  instancedBufferAttribute,
  uv,
  screenUV,
  vec2,
  time,
  sin,
  cos,
  mix,
  smoothstep,
  vec3,
  vec4,
  uniform,
  dot,
  normalize,
  max,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { createFramePacer } from './framePacer';
import { channels, DEFAULT_PALETTE, type Palette } from './palette';
import {
  ORBITS,
  PLANETS,
  RING_COVER,
  RING_ROWS,
  ROLL,
  satellitePhase,
  satelliteSpeed,
  saturnFrame,
  saturnGrowAt,
  SATURN_VIEW_HALF,
  BASE_SCALE,
  fitScale,
  SUN,
  TILT,
  type PlanetSpec,
  type StarOrbit,
} from './saturnSpec';
import type { Theme } from './theme';
import type { Fold } from './viewportFold';
import { inspectWebGL } from './webglRenderer';
import type { SatelliteScreen, SaturnGrow } from '@/store/homeOrbit';

/** 環在半徑 1（土星赤道半徑）處的角速度（rad/s）；實際照半徑的 -1.5 次方遞減 */
const RING_SPIN = 0.3;

export const STAR_COUNT = 13000; // 7k 主層 + 6k 星系層（2026-10 翻新減半，見 LAYERS）

export interface PerfReport {
  fps: number;
  avgMs: number;
  /** 品質等級，0 是沒降級 */
  quality: number;
  /** GPU 真的花在這一幀的時間（timestamp query）；瀏覽器不給 timestamp 時是 null */
  gpuMs: number | null;
  /** 估到的 vsync 間隔：180Hz 應該是 5.6、60Hz 是 16.7 */
  vsyncMs: number;
  /** 這一刻是否判定為閒置（閒置時降到 30fps） */
  idle: boolean;
  /** rAF 時間戳減 performance.now()，正常是 −16～0。偏很多代表兩個時鐘不同步 */
  clockSkewMs: number;
}

/** 建 runner 各段花了多久（毫秒）：土星出來得慢的時候看是哪一段（?debug=perf 的徽章會顯示） */
export interface InitTiming {
  /** 判斷是不是軟體渲染 */
  probe: number;
  /** renderer.init：拿 GPU adapter、建 device */
  device: number;
  /** 建場景＋預先編譯所有著色器（沒有著色器快取時最慢的就是這段） */
  compile: number;
  /** 暖機的第一幀 */
  first: number;
}

export interface StarfieldRunner {
  /** fold：摺疊機摺起來時的兩半（lib/viewportFold），土星放進其中一半 */
  setSize(width: number, height: number, fold?: Fold | null): void;
  setRunning(running: boolean): void;
  /** 捲動位置（土星的捲動旋轉；worker 無 window，由主執行緒轉發） */
  setScroll(y: number): void;
  /** 土星顯示（僅首頁）；animate 為 false 時收成一點，true 時從一點撐開（換頁的收與長） */
  setSaturn(visible: boolean, animate: boolean): void;
  /** 首頁衛星的亮度（見 store/homeOrbit） */
  setSatelliteGlow(glow: number[]): void;
  /** 換頁轉場的「收」：土星整組收進第 index 顆衛星，-1 是收進中心 */
  collapseSaturnTo(index: number): void;
  /** 星星淡出／淡回（頁面自己畫背景的時候讓出來） */
  setStars(visible: boolean): void;
  /** 換頁的鏡頭移動：星空要在畫面上挪多少（累積的像素），換成星空鏡頭轉的角度 */
  setPan(x: number, y: number): void;
  /** 開著幾個主要分區：土星留下幾條軌道（站台設定改了就呼叫，多的收起來、少的長出來） */
  setSections(count: number): void;
  /**
   * 頁面開著時換了主題（lib/theme 的 setTheme）：主星顯示中的話先收成一點，在點的那一刻換成新主題的主星，
   * 再從那一點長出來；沒顯示的話直接換掉
   */
  setTheme(theme: Theme, palette: Palette): void;
  dispose(): void;
}

export interface StarfieldInit {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width: number;
  height: number;
  fold?: Fold | null;
  dpr: number;
  /** 每秒回報一次渲染迴圈的狀態（?debug=perf 用） */
  onPerf?: (report: PerfReport) => void;
  /**
   * GPU device / WebGL context 掉了。
   *
   * 這不是理論上的邊角情況：分頁切到背景時 GPU 行程回收資源、驅動 reset（Windows TDR）、
   * GPU 行程崩潰重啟都會觸發，而且**掉了就是永久的**——three 的預設處理只有 console.error
   * 一行（worker 裡的話連那行都不會轉出來），renderer 之後一幀都不會再畫。
   * 實測：手動 loseContext 之後 draw call 直接歸零，等 15 秒、換路由都不會回來，只有重整能救。
   *
   * 症狀是「星空停住不動、切回首頁連土星都不出現，但流星還在跑」——後者是 CSS/DOM 特效，
   * 跟這條 WebGL 管線無關，所以看起來像「只有 3D 死掉」。
   *
   * 呼叫端收到之後要整個重建（canvas 已 transfer 給 worker 的話得換一個新的 canvas 元素）。
   */
  onDeviceLost?: (message: string) => void;
  /**
   * 站上的配色（lib/palette）。由主執行緒讀好傳進來：這支常在 worker 裡跑，那裡讀不到 CSS。
   * 沒給就是預設的配色。
   */
  palette?: Palette;
  /**
   * 土星顯示時，每畫一幀回報一次衛星在畫面上的位置（首頁的字跟著它走，見 store/homeOrbit）。
   * 土星收起來時送一次空陣列。
   */
  onSatellites?: (positions: SatelliteScreen[], at: number) => void;
  /**
   * 土星正在長時，每畫一幀回報星球與環長到幾成。開場那道小環照這個跟著長（layout/TransitionLayer）：
   * 剛載入時很忙，這裡的一幀最多只走 0.05 秒，實際長得比時間表慢，小環照自己的時鐘走會跑到前面
   */
  onSaturnGrow?: (grow: SaturnGrow) => void;
  /** 手機：星星只畫三分之一左右（手機只在首頁跑 3D，主角是土星與衛星） */
  lite?: boolean;
  /** 開著幾個主要分區（站台設定）＝土星有幾條軌道。沒給就是全部 */
  sections?: number;
  /** 主題（lib/theme）：主星照哪一份規格畫（lib/saturnSpec 的 PLANETS）。由主執行緒讀好傳進來，沒給是土星 */
  theme?: Theme;
}

interface StarLayerCfg {
  count: number;
  rMin: number;
  rMax: number;
  /** quad 基準尺寸（world 單位，隨距離衰減）。quad 刻意偏大 + 徑向柔光：
   *  亮核看起來仍小，但 footprint 永不亞像素 → 無 MSAA 也不閃爍/不掉星（驗收核心）。 */
  size: number;
  rotX: number;
  rotY: number;
}

// 對齊舊視覺：主層（radius 100 depth 50、細、快轉）+ 星系層（radius 90 depth 20、大、慢轉）
// 2026-10 翻新：數量減半、亮度調低。星空退到底下當紙的紋理，讓土星的軌道與各頁的星軌浮出來
const LAYERS: StarLayerCfg[] = [
  { count: 7000, rMin: 100, rMax: 150, size: 0.2, rotX: 0.01, rotY: 0.02 },
  { count: 6000, rMin: 90, rMax: 110, size: 0.28, rotX: 0.008, rotY: 0.015 },
];

/// 單層星——官方 WebGPU 點雲模式：THREE.Sprite + instancing（PointsNodeMaterial 文件指定）。
/// 重要：WebGPU 上 THREE.Points 永遠 1px（平台限制、size 無效、也沒有 quad uv）——
/// 一開始用 Points 在 WebGPU 上就是「1px 閃爍細星」慘案（實測）。Sprite+instancing
/// 兩個 backend 都走實例化 quad：size/scaleNode 生效、uv() 有值，單一路徑無分叉。
/// per-star 尺寸/色溫/閃爍相位進 instanced attribute，閃爍與柔光全在 shader（TSL）。
/** 星星整體的亮度（0 到 1）：有些頁面自己畫背景（手記的星軌、關於的下墜），星星要讓出來 */
const starAlpha = uniform(1);

function buildStarLayer(cfg: StarLayerCfg): THREE.Sprite {
  const positions = new Float32Array(cfg.count * 3);
  const scales = new Float32Array(cfg.count);
  const phases = new Float32Array(cfg.count);
  const tints = new Float32Array(cfg.count);
  for (let i = 0; i < cfg.count; i++) {
    const r = cfg.rMin + Math.random() * (cfg.rMax - cfg.rMin);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions.set([r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi)], i * 3);
    // 尺寸：偏態分佈（多小星、少亮星）
    scales[i] = 0.5 + Math.pow(Math.random(), 2.5) * 1.3;
    phases[i] = Math.random() * Math.PI * 2;
    tints[i] = Math.random();
  }

  const mat = new THREE.PointsNodeMaterial();
  // instanced 位置：官方模式 positionNode = instancedBufferAttribute(...)
  mat.positionNode = instancedBufferAttribute<'vec3'>(new THREE.InstancedBufferAttribute(positions, 3), 'vec3');

  // 色溫：白為主，冷暖微變
  const tint = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(tints, 1), 'float');
  const starColor = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.9, 0.78), tint);
  // 冷暖只留一點點：翻新後整站是黑紙白墨，星星不該帶出藍或橘
  const finalColor = mix(vec3(1, 1, 1), starColor, 0.12).mul(0.7);
  mat.colorNode = finalColor;
  // selective bloom：per-material mrtNode 覆寫（官方 selective FX 模式）——星星的
  // bloomIntensity 通道寫 1，其他材質（土星/衛星）走全域預設 0 → bloom 只暈星星
  mat.mrtNode = mrt({ bloomIntensity: float(1) });

  // 碟形柔光輪廓（對齊 drei Stars 的 fade 觀感）：d<0.55 全亮平台、0.55→1 柔滑歸零。
  // Sprite 的 quad geometry 有 uv attribute → uv() 兩個 backend 都有值。
  const d = uv().sub(0.5).length().mul(2.0); // 0 = 中心, 1 = 邊
  const falloff = smoothstep(1.0, 0.55, d);
  // 閃爍：慢速呼吸（週期 10–25s）+ 振幅 per-star 分佈——多數星幾乎不閃、少數明顯，
  // 對齊舊觀感（舊棧 27k 顆只有 800 顆閃爍星；26k 全閃會產生忙碌的快閃感，使用者實測嫌快）。
  const phase = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(phases, 1), 'float');
  const amp = phase.mul(0.008).add(0.008); // 0.008~0.058：舊版等級「幾乎看不出來的呼吸」（使用者對比定調）
  const speed = phase.mul(0.06).add(0.25); // 0.25~0.63 rad/s
  const twinkle = sin(time.mul(speed).add(phase.mul(7.0)))
    .mul(amp)
    .add(amp.oneMinus());
  mat.opacityNode = falloff.mul(twinkle).mul(starAlpha);

  // per-star 尺寸（scaleNode 乘在 sprite 縮放上）
  mat.scaleNode = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(scales, 1), 'float');
  mat.size = cfg.size;
  mat.sizeAttenuation = true;
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const sprite = new THREE.Sprite(mat);
  sprite.count = cfg.count; // instanced 數量
  return sprite;
}

interface SaturnRig {
  group: THREE.Group;
  /**
   * moving：還在追趕目標（收與長的縮放、捲動旋轉、衛星的亮度沒收斂），這段時間不進閒置降幀。
   * zooming：收與長的縮放還沒收斂——這段要跟著螢幕更新率畫，不受 60fps 上限限制。
   * grow：正在長的話，星球與環此刻各長到幾成（長完的那一幀是 1、1），其餘時候是 null
   */
  update(dt: number, scrollY: number, animate: boolean): { moving: boolean; zooming: boolean; grow: SaturnGrow | null };
  /**
   * 黑洞的重力透鏡在畫面上的中心與愛因斯坦半徑（CSS 像素）；不是黑洞、或還沒長出來是 null
   */
  lensOnScreen(camera: THREE.Camera, width: number, height: number): { x: number; y: number; r: number } | null;
  /** 視窗大小：窄的視窗要把整組縮小，最外圈的軌道才放得下；位置與可用的那一塊照 saturnFrame */
  setView(width: number, height: number, fold: Fold | null): void;
  /** 每顆衛星該有多亮（0 到 1），實際亮度會慢慢靠過去 */
  setGlow(glow: number[]): void;
  /** 衛星在畫面上的位置（CSS 像素），首頁的字跟著它走 */
  project(camera: THREE.Camera, width: number, height: number): SatelliteScreen[];
  /** 縮回一點：下一次顯示時就從這一點撐開 */
  collapse(): void;
  /**
   * 有幾個主要分區開著（站台設定）：由內到外留下前 count 條軌道與衛星，其餘的收起來。
   * 開著的時候改也可以：多出來或少掉的那幾條慢慢長出來、收回去
   */
  setSections(count: number): void;
  /**
   * 換頁轉場的「收」：整組收進一顆衛星（index）或土星中心（-1）。收的過程衛星停住，
   * 收進去的那一點在畫面上不動——轉場的點就從那裡接手飛出去
   */
  collapseTo(index: number): void;
}

/**
 * 長（換頁落地、開場）：分層依序。星球先從那一點長出來，環從星球表面往外攤開，五條軌道由內而外
 * 一條接一條、從衛星所在的地方畫一圈，快畫完時那顆衛星彈出來。秒數從開始長算起，全部長完約 1.2 秒。
 * 星球與環的時間在 lib/saturnSpec 的 saturnGrowAt（開場那道小環也照它跟著長）
 */
const GROW = {
  /** 第一條軌道開始畫、之後每條晚多少、一條畫多久 */
  orbit: 0.3,
  orbitStep: 0.07,
  orbitDur: 0.45,
  /** 衛星在自己那條軌道開始畫之後多久彈出來、彈多久 */
  sat: 0.35,
  satDur: 0.25,
} as const;
/**
 * 收（換頁離開）：其他衛星先熄、軌道收回衛星那裡、環捲回星球，最後整組收進點下去的那顆衛星（或中心），
 * 越收越快，像被吸進那一點。整組從 COLLAPSE_GROUP_FROM 秒開始收
 */
const COLLAPSE_S = 0.5;
/** 摺疊機摺起來或攤開時，土星滑到新位置、新大小的時間（秒） */
const REFOLD_S = 0.6;
const COLLAPSE_GROUP_FROM = 0.2;
const easeInCubic = (t: number) => t * t * t;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** 帶一點回彈：衛星彈出來時稍微超過原本的大小再停穩 */
const easeOutBack = (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
const span = (t: number, from: number, dur: number) => Math.min(1, Math.max(0, (t - from) / dur));

/**
 * 「每幀往目標靠近 rate」換算成跟幀率無關的係數（rate 是以 60fps 為準的值）。
 * 直接每幀乘 rate 的話，同一段動畫在 180Hz 上會快 3 倍。
 */
const lerpFactor = (rate: number, dt: number) => 1 - Math.pow(1 - rate, dt * 60);

/** 吸積盤的刷痕最濃時佔一列的幾成：比土星的環（RING_COVER）密，盤看起來是厚實的一層 */
const DISK_COVER = 0.8;
/** 重力透鏡的愛因斯坦半徑是陰影半徑的幾倍（貼著光子環外面那一圈的星被拉成弧） */
const LENS_EINSTEIN = 2.2;

/** 土星那層的鏡頭：視角 8°，放在讓畫面半高在 z=0 是 3.84 個單位的距離（見 createStarfieldRunner） */
const SATURN_FOV = 8;
const SATURN_CAMERA_Z = SATURN_VIEW_HALF / Math.tan(THREE.MathUtils.degToRad(SATURN_FOV / 2));

/** sRGB 的 `r, g, b` → three 的 Color（自己換成線性空間，跟 `new THREE.Color('#rrggbb')` 一樣） */
const threeColor = (rgb: string) => {
  const [r, g, b] = channels(rgb);
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
};

/** 土星用的三個顏色 */
interface SaturnColors {
  /** 墨色（--paper）：刷痕、軌道 */
  INK: THREE.Color;
  /** 紙色（--ground）：擋住背面那顆球的顏色，要跟頁面底色一樣才看不出它在那裡 */
  GROUND: THREE.Color;
  /** 琥珀（--amber）：靠近的那顆衛星 */
  AMBER: THREE.Color;
}

/// 土星（2026-10 翻新）：刻線畫的星球與環，外面五條軌道各有一顆衛星。
///
/// 星球與環都在著色器裡畫成一道一道的刷痕（見下面 strokes），亮暗跟著太陽。
/// 星球是不透明的黑球，球後面的星星、環與軌道的背段、轉到後面的衛星都被它擋掉。
/// 軌道是 1px 的線（WebGPU 的線本來就只有 1px）。
///
/// 只有星球繞自己的軸自轉（0.05 rad/s，捲動再多轉一點）；環與軌道的平面固定不動，
/// 不然衛星的軌道會跟著晃。換頁時整組從一點撐開、或收回一點。
function buildSaturn(
  sunWorld: THREE.Vector3,
  { INK, GROUND, AMBER }: SaturnColors,
  initialSections: number,
  spec: PlanetSpec,
): SaturnRig {
  const { ring: ringSpec } = spec;
  // 外層側傾、內層俯角：跟提案的投影同一個順序（先自轉、再俯、再側傾）。
  // 環與軌道都在內層的水平面（y = 0）上，星球繞內層的 y 軸自轉，軸自然垂直於環
  const group = new THREE.Group();
  group.rotation.z = ROLL;
  const tilted = new THREE.Group();
  tilted.rotation.x = TILT;
  const body = new THREE.Group();
  tilted.add(body);
  group.add(tilted);

  // 星球與環都是刻線畫（使用者給的參考：黑底上一道一道白色的刷痕）：
  // 沿緯度一列一列的橫線，每一條的粗細就是那裡的亮度——迎光又落在亮帶上的地方線粗到連成一片，
  // 背光的那一面線細到消失，只剩黑。線不是直的：用拉長的雜訊讓它微微起伏、斷成一段一段的筆觸。
  // 星球本身是不透明的黑球，背面的點、環與軌道的背段、轉到後面的衛星都被它的深度擋掉
  const sunInPlanet = uniform(new THREE.Vector3());
  const sunInPlane = uniform(new THREE.Vector3());
  /** 環轉了多久（秒）：跟著每一幀的 dt 走，閒置降幀、收起來時一起停 */
  const ringClock = uniform(0);
  // 刷痕的顏色：墨色，海王星往訊號色偏一點（規格裡的 tint）
  const paper = mix(vec3(INK.r, INK.g, INK.b), vec3(AMBER.r, AMBER.g, AMBER.b), spec.tint);
  const ground = vec3(GROUND.r, GROUND.g, GROUND.b);
  /**
   * 一列一列的刷痕：row 是列的座標（每 1 是一列），ink 是 0 到 1 的濃度，回傳這個像素有沒有墨。
   * 最濃的地方線也只佔一列的 cover（星球 0.76、環 0.64）：線與線之間永遠留一道黑縫，線不會糊成一片
   */
  type FloatNode = THREE.Node<'float'>;
  const strokes = (row: FloatNode, ink: FloatNode, cover: number) => {
    const f = abs(fract(row).sub(0.5));
    const half = ink.mul(cover / 2);
    const aa = fwidth(row).mul(0.75).max(0.001);
    // 線比一個像素還細的時候整條按比例淡掉；不然反鋸齒的那半個像素會在背光面留下一層灰
    return smoothstep(half.add(aa), half.sub(aa), f).mul(half.div(aa).clamp(0, 1));
  };

  /** 環在半徑 r 的亮度（規格裡的 segments、gaps） */
  const ringTone = (r: FloatNode) => {
    let tone: FloatNode = float(0);
    for (const [inner, outer, value] of ringSpec.segments) {
      tone = tone.add(
        smoothstep(inner - 0.004, inner + 0.004, r)
          .mul(smoothstep(outer + 0.004, outer - 0.004, r))
          .mul(value),
      );
    }
    for (const [at, half] of ringSpec.gaps) tone = tone.mul(smoothstep(half * 0.4, half, abs(r.sub(at))));
    return tone.mul(ringSpec.gain);
  };

  const planetMat = new THREE.MeshBasicNodeMaterial();
  planetMat.colorNode = Fn(() => {
    const n = normalize(positionLocal);
    const sun = normalize(sunInPlanet);
    // 晨昏線切得乾脆：參考圖背光那一面幾乎全黑
    const lit = smoothstep(-0.12, 0.4, dot(n, sun));
    // 雲帶照真實星球的緯度排（規格裡的 bands）
    const lat = asin(n.y.clamp(-1, 1)).mul(180 / Math.PI);
    let tone: FloatNode = float(spec.base);
    for (const [c, w, d] of spec.bands) {
      tone = tone.add(exp(lat.sub(c).div(w).pow(2).negate()).mul(d * 1.6));
    }
    // 斑點（風暴）：經度差先折回 ±π，東西方向的寬度在高緯度要乘 cos(緯度) 才是真的角距離
    if (spec.spots.length) {
      const lon = atan(n.x, n.z);
      for (const [lo, la, wLon, wLat, d] of spec.spots) {
        const dl = fract(
          lon
            .sub(lo)
            .div(Math.PI * 2)
            .add(0.5),
        )
          .sub(0.5)
          .mul(360 * Math.cos((la * Math.PI) / 180));
        tone = tone.add(exp(dl.div(wLon).pow(2).add(lat.sub(la).div(wLat).pow(2)).negate()).mul(d));
      }
    }
    // 極區整片暗下去：真實的土星兩極偏暗，而且斜看時極點附近的線會繞成一圈一圈的靶心
    tone = tone.mul(smoothstep(spec.pole[0], spec.pole[1], abs(lat)));
    // 筆觸：橫向拉長的雜訊讓線起伏、粗細不一，另一層讓線斷成一段一段
    const wave = mx_noise_float(vec3(n.x.mul(1.1), n.y.mul(6), n.z.mul(1.1)));
    const row = n.y.mul(spec.rows).add(wave.mul(spec.stroke.wave));
    const swell = mx_noise_float(vec3(n.x.mul(2.2), n.y.mul(36), n.z.mul(2.2)))
      .mul(spec.stroke.swell)
      .add(1);
    const brush = smoothstep(-0.45, 0.15, mx_noise_float(vec3(n.x.mul(2.4), n.y.mul(48), n.z.mul(2.4))));
    // 環落在星球上的影子：從這一點往太陽看，視線穿過環的平面時落在環上，越密的環影子越深
    const t = n.y.negate().div(sun.y);
    const hit = n.add(sun.mul(t));
    const rr = vec3(hit.x, 0, hit.z).length();
    const shade = select(t.greaterThan(0), float(1).sub(ringTone(rr).mul(0.8)), float(1));
    const ink = pow(
      lit
        .mul(tone)
        .mul(swell)
        .mul(mix(float(spec.stroke.floor), float(1), brush))
        .mul(shade)
        .clamp(0, 1),
      0.8,
    );
    return mix(ground, paper, strokes(row, ink, spec.cover));
  })();
  // 黑洞的主星是一片陰影：跟夜色同一個顏色，沒有任何刻線，只用來擋住後面的盤與星
  if (spec.kind === 'blackhole') planetMat.colorNode = ground;
  const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), planetMat);
  body.add(planet);

  // 環與軌道在同一個平面上，這個平面不轉
  const plane = new THREE.Group();
  tilted.add(plane);

  // 環：一圈一圈的同心刷痕，粗細照真實環的結構（RING_SEGMENTS），星球的影子壓在背光那段
  const ringMat = new THREE.MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const ringInk = Fn(() => {
    // RingGeometry 在自己的 xy 平面上；轉平之後 (x, y) 對到環平面的 (x, -z)
    const p = vec3(positionLocal.x, 0, positionLocal.y.negate());
    const r = p.length();
    // 環在轉，而且內圈比外圈快（克卜勒：角速度照半徑的 -1.5 次方，內緣約是外緣的 2.6 倍）。
    // 只轉筆觸（刷痕的斷點），影子跟太陽走、不跟著轉，所以影子那段用原本的 p
    const spin = ringClock.mul(RING_SPIN).mul(r.pow(-1.5));
    const q = vec3(p.x.mul(cos(spin)).sub(p.z.mul(sin(spin))), 0, p.x.mul(sin(spin)).add(p.z.mul(cos(spin))));
    // 環裡面還有更細的小環：一點徑向的雜訊
    const ringlets = mx_noise_float(vec3(r.mul(60), 0, 0))
      .mul(0.22)
      .add(0.9);
    const brush = smoothstep(-0.55, 0.15, mx_noise_float(vec3(q.x.mul(2.4), r.mul(40), q.z.mul(2.4))));
    // 星球的影子：從環上這一點往太陽看會不會被星球擋住
    const sun = normalize(sunInPlane);
    const along = dot(p, sun).negate();
    const closest = p.add(sun.mul(along));
    const shade = select(along.greaterThan(0).and(closest.length().lessThan(1)), float(0.12), float(1));
    if (!ringSpec.brushed) {
      // 細環（海王星）：每一道畫成至少一個像素寬的髮絲。比一個像素還細的照比例變淡，而不是照原寬去取樣——
      // 那樣線有時落在像素上、有時沒有，整圈會斷成虛線（實際發生過）
      const px = fwidth(r).max(0.00001);
      const hairline = (at: number, half: number) => {
        const reach = px.mul(0.5).max(half);
        const cover = reach
          .add(px.mul(0.5))
          .sub(abs(r.sub(at)))
          .div(px)
          .clamp(0, 1);
        return cover.mul(
          float(half * 2)
            .div(px)
            .min(1),
        );
      };
      let thin: FloatNode = float(0);
      for (const [inner, outer, value] of ringSpec.segments)
        thin = thin.add(hairline((inner + outer) / 2, (outer - inner) / 2).mul(value));
      // 環上的弧（Adams 環）：跟著環轉，所以角度用轉過的 q；弧比環亮、也寬一點
      if (ringSpec.arcs.length) {
        const a = atan(q.z, q.x);
        for (const [at, from, to, value] of ringSpec.arcs) {
          const along = smoothstep(from - 0.02, from + 0.02, a).mul(smoothstep(to + 0.02, to - 0.02, a));
          thin = thin.add(along.mul(hairline(at, 0.012)).mul(value));
        }
      }
      return thin.mul(ringSpec.gain).mul(shade).clamp(0, 1);
    }
    // 都卜勒增亮（黑洞的吸積盤）：朝我們轉來的那一側（左邊，x 負）亮、另一側暗。用沒轉過的 p：亮的那側跟著我們看的方向，不跟著盤轉
    const doppler = float(1).sub(p.x.div(r).mul(ringSpec.doppler));
    const ink = ringTone(r)
      .mul(ringlets)
      .mul(mix(float(0.4), float(1), brush))
      .mul(shade)
      .mul(doppler)
      .clamp(0, 1);
    return strokes(r.mul(RING_ROWS), pow(ink, 0.75), spec.kind === 'blackhole' ? DISK_COVER : RING_COVER);
  })();
  /** 環攤開時跟著淡入（0 到 1） */
  const ringFade = uniform(1);
  if (spec.kind === 'blackhole') {
    // 吸積盤是又密又亮、擋得住後面的一層氣體：刻線之間塗夜色而不是留空（同主星的陰影球），
    // 盤的範圍內不透明，後面的星與軌道線被擋掉；內外緣柔和地淡出
    const r = vec3(positionLocal.x, positionLocal.y, 0).length();
    const band = smoothstep(ringSpec.inner, ringSpec.inner + 0.06, r).mul(
      smoothstep(ringSpec.outer, ringSpec.outer - 0.35, r),
    );
    ringMat.colorNode = mix(ground, paper, ringInk);
    ringMat.opacityNode = band.mul(ringFade);
  } else {
    ringMat.colorNode = paper;
    ringMat.opacityNode = ringInk.mul(ringFade);
  }
  const ring = new THREE.Group();
  const ringPart = (from: number, length: number, order: number) => {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(ringSpec.inner, ringSpec.outer, 256, 1, from, length), ringMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = order;
    ring.add(mesh);
  };
  // 黑洞：盤拆成後半圈（RingGeometry 的 0–π 轉平後在遠的那側）與前半圈，中間夾 lens，前半圈橫過陰影前面
  if (spec.kind === 'blackhole') {
    ringPart(0, Math.PI, 1);
    ringPart(Math.PI, Math.PI, 3);
  } else ringPart(0, Math.PI * 2, 0);
  plane.add(ring);

  // 黑洞的 lens：一張永遠面向鏡頭的薄板（在 group 裡、不在俯角那層，所以不跟著傾斜），畫光子環與
  // 被重力彎到陰影上下的盤影。疊的順序是「後半盤 → lens → 前半盤」（renderOrder 1、2、3）
  const lensFade = uniform(0);
  let lens: THREE.Mesh | null = null;
  if (spec.kind === 'blackhole') {
    const lensMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    lensMat.colorNode = paper;
    lensMat.opacityNode = Fn(() => {
      const x = positionLocal.x;
      const y = positionLocal.y;
      const d = vec3(x, y, 0).length();
      const px = fwidth(d).max(0.00001);
      // 光子環：陰影外緣一道至少一個像素寬的髮絲
      const half = 0.012;
      const photon = px
        .mul(0.5)
        .max(half)
        .add(px.mul(0.5))
        .sub(abs(d.sub(1.04)))
        .div(px)
        .clamp(0, 1);
      // 盤影：陰影外面一圈圈刷痕，上方的最亮（盤背面被彎過陰影頂上），下方較淡
      const above = smoothstep(-0.3, 0.85, y.div(d));
      const band = smoothstep(1.08, 1.16, d).mul(smoothstep(1.75, 1.45, d));
      const doppler = float(1).sub(x.div(d).mul(ringSpec.doppler));
      const image = strokes(
        d.mul(RING_ROWS),
        band
          .mul(mix(float(0.25), float(0.9), above))
          .mul(doppler)
          .clamp(0, 1),
        RING_COVER,
      );
      return photon.mul(doppler).mul(0.9).add(image).clamp(0, 1).mul(lensFade);
    })();
    lens = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), lensMat);
    lens.renderOrder = 2;
    group.add(lens);
  }

  // 每條軌道一個容器：S 星的軌道（黑洞）各自傾斜（holder：傾角與升交點），近點的方向與進動放在 apsis。
  // 土星、海王星的軌道沒有這些，容器是單位矩陣，跟直接放在 plane 上一樣
  const stars = spec.stars;
  const apses = ORBITS.map((_, i) => {
    const holder = new THREE.Group();
    const apsis = new THREE.Group();
    const st = stars?.[i];
    if (st) {
      holder.rotation.set((st.incl * Math.PI) / 180, (st.node * Math.PI) / 180, 0, 'YXZ');
      apsis.rotation.y = (st.peri * Math.PI) / 180;
    }
    holder.add(apsis);
    plane.add(holder);
    return apsis;
  });
  /** S 星軌道上真近點角 nu 的位置（焦點在原點：r = a(1 − e²) / (1 + e cos nu)） */
  const ellipseAt = (st: StarOrbit, nu: number, out: THREE.Vector3) => {
    const radius = (st.a * (1 - st.e * st.e)) / (1 + st.e * Math.cos(nu));
    return out.set(Math.cos(nu) * radius, 0, Math.sin(nu) * radius);
  };

  // WebGPU 的渲染器不支援 LineLoop：用 Line，最後一點回到起點把圈閉起來
  const CIRCLE_POINTS = 257;
  const circle = (i: number, radius: number, opacity: number) => {
    const material = new THREE.LineBasicNodeMaterial({ color: INK, transparent: true, opacity, depthWrite: false });
    const st = stars?.[i];
    const points = Array.from({ length: CIRCLE_POINTS }, (_, k) => {
      const a = (k / (CIRCLE_POINTS - 1)) * Math.PI * 2;
      return st
        ? ellipseAt(st, a, new THREE.Vector3())
        : new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
    apses[i].add(line);
    return { material, line };
  };

  // 軌道與衛星。衛星是一個實心的小點，亮起來時變琥珀色、外面多一圈光暈
  const ORBIT_DIM = 0.09;
  const orbitLines = ORBITS.map((r, i) => circle(i, r, ORBIT_DIM));
  const orbits = orbitLines.map((o) => o.material);
  const glowTarget = ORBITS.map(() => 0);
  const satellites = ORBITS.map((r, i) => {
    const g = uniform(0);
    const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
    const d = uv().sub(0.5).length().mul(2.0);
    const core = smoothstep(g.mul(0.1).add(0.26), g.mul(0.1).add(0.16), d);
    const halo = float(1).sub(d).max(0).pow(2).mul(g).mul(0.55);
    mat.colorNode = mix(vec3(INK.r, INK.g, INK.b), vec3(AMBER.r, AMBER.g, AMBER.b), g);
    mat.opacityNode = core.mul(mix(float(0.75), float(1), g)).max(halo);
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(0.24);
    apses[i].add(sprite);
    // 起始角度錯開，越外圈轉得越慢（克卜勒的味道就好，不必真的照比例）
    // 反方向公轉的（海王星的崔頓）：角速度變號，它那條軌道也鏡像，長與收的時候線才會朝它走的方向畫
    const dir = spec.retrograde.includes(i) ? -1 : 1;
    orbitLines[i].line.scale.z = dir;
    return { sprite, g, r, phase: satellitePhase(i), dir };
  });
  /**
   * 每條軌道還在不在（0 到 1）：站台設定關掉的分區，它那條軌道與衛星收起來。乘在長／收的進度上，
   * 所以全部開著時（全是 1）畫面跟沒有這一層完全一樣。開機時直接是定值，之後改才有動畫
   */
  /**
   * 第 i 顆衛星此刻在軌道上的角度。圓軌道就是等速轉的角度；S 星的軌道照克卜勒定律走（近點快、遠點慢）：
   * 平近點角 M 等速增加，解克卜勒方程 E − e sin E = M 得偏近點角，再換成真近點角
   */
  const anomaly = (i: number) => {
    const s = satellites[i];
    const st = stars?.[i];
    const mean = s.phase + clock * satelliteSpeed(st?.a ?? s.r) * s.dir;
    if (!st) return mean;
    let e = mean;
    for (let k = 0; k < 5; k++) e -= (e - st.e * Math.sin(e) - mean) / (1 - st.e * Math.cos(e));
    return 2 * Math.atan2(Math.sqrt(1 + st.e) * Math.sin(e / 2), Math.sqrt(1 - st.e) * Math.cos(e / 2));
  };
  /**
   * 讓第 i 條軌道從它那顆衛星現在的位置開始畫（長與收都從那裡起算）。圓的轉過去就好；
   * 橢圓轉了會整條挪位，所以把點重新從衛星的角度排起
   */
  const alignOrbit = (i: number) => {
    const st = stars?.[i];
    const line = orbitLines[i].line;
    const nu = anomaly(i);
    if (!st) {
      line.rotation.y = -nu;
      return;
    }
    const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < CIRCLE_POINTS; k++) {
      ellipseAt(st, nu + (k / (CIRCLE_POINTS - 1)) * Math.PI * 2 * satellites[i].dir, v);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
  };
  let sectionCount = initialSections;
  const live: number[] = ORBITS.map((_, i) => (i < sectionCount ? 1 : 0));
  const syncSun = () => {
    group.updateWorldMatrix(true, true);
    body.worldToLocal(sunInPlanet.value.copy(sunWorld));
    plane.worldToLocal(sunInPlane.value.copy(sunWorld));
  };

  let clock = 0;
  let autoRot = 0;
  // 捲動帶動的旋轉單獨 lerp：自轉是等速的，不需要 lerp；放進同一個 lerp 的話目標每幀都在前進，
  // lerp 永遠收斂不了，「還在動」就永遠是真的——閒置降幀因此一直沒生效（實測卡在 60fps）。
  let currentScrollRot = 0;
  /** 整組的縮放：長的時候一開始就是原尺寸（各部分自己長），收的最後一段才往那一點縮 */
  let currentScale = 0.0001;
  let fullScale = BASE_SCALE;
  /** 收與長都是一段有起訖的動畫（不是 lerp）：時間固定，轉場那邊才對得上拍子 */
  let stage: { kind: 'grow' | 'collapse'; t: number } | null = null;
  /** 現在要不要顯示（上一次的 animate） */
  let shown = false;
  /** 收進去的那一點（世界座標）；null 是收進中心 */
  let pivot: THREE.Vector3 | null = null;
  /** 收進哪一顆衛星（-1 是中心）：那一顆收的時候不熄 */
  let pivotIndex = -1;
  /** 各部分長到幾成（0 到 1）：星球、環、每條軌道、每顆衛星 */
  let planetK = 0;
  let ringK = 0;
  const orbitK = ORBITS.map(() => 0);
  const satK = ORBITS.map(() => 0);
  /** 開始收的那一刻各部分長到幾成 */
  const collapseFrom = { ring: 0, orbit: [...orbitK], sat: [...satK] };
  /** 環從星球表面攤開：一開始外緣貼著星球 */
  const RING_FROM = 1 / ringSpec.outer;
  const applyParts = () => {
    body.scale.setScalar(Math.max(0.0001, planetK));
    ring.scale.setScalar(RING_FROM + (1 - RING_FROM) * ringK);
    ring.visible = ringK > 0;
    ringFade.value = ringK;
    if (lens) {
      lens.scale.setScalar(Math.max(0.0001, planetK));
      lens.visible = planetK > 0;
      lensFade.value = ringK;
    }
    for (const [i, o] of orbitLines.entries()) {
      const n = Math.round(CIRCLE_POINTS * (orbitK[i] ?? 0) * (live[i] ?? 0));
      o.line.geometry.setDrawRange(0, n);
      o.line.visible = n > 1;
      satellites[i].sprite.scale.setScalar(0.24 * Math.max(0.0001, (satK[i] ?? 0) * (live[i] ?? 0)));
    }
  };
  /** 長／收的這一刻各部分該在哪 */
  const stageAt = (kind: 'grow' | 'collapse', t: number) => {
    if (kind === 'grow') {
      ({ planet: planetK, ring: ringK } = saturnGrowAt(t));
      for (let i = 0; i < orbitK.length; i++) {
        const start = GROW.orbit + GROW.orbitStep * i;
        orbitK[i] = easeInOutCubic(span(t, start, GROW.orbitDur));
        satK[i] = easeOutBack(span(t, start + GROW.sat, GROW.satDur));
      }
      return t >= GROW.orbit + GROW.orbitStep * (orbitK.length - 1) + GROW.sat + GROW.satDur;
    }
    // 收：其他衛星先熄、軌道由內而外收回、環捲回星球；星球不動，跟整組一起收進那一點。
    // 從開始收那一刻的樣子收起（還沒長完就要離開的話，不會先跳回長滿）
    for (let i = 0; i < orbitK.length; i++) {
      if (i !== pivotIndex) satK[i] = (collapseFrom.sat[i] ?? 0) * (1 - easeInCubic(span(t, 0, 0.16)));
      orbitK[i] = (collapseFrom.orbit[i] ?? 0) * (1 - easeInCubic(span(t, 0.02 * i, 0.22)));
    }
    ringK = collapseFrom.ring * (1 - easeInCubic(span(t, 0.08, 0.22)));
    const k = easeInCubic(span(t, COLLAPSE_GROUP_FROM, COLLAPSE_S - COLLAPSE_GROUP_FROM));
    currentScale = THREE.MathUtils.lerp(fullScale, 0.0001, k);
    return t >= COLLAPSE_S;
  };
  const base = new THREE.Vector3();
  const v = new THREE.Vector3();
  /** 摺起來或攤開：從當下的位置與大小滑過去，不是一下跳到另一半（一般的視窗縮放照舊直接套） */
  let glide: { from: THREE.Vector3; scale: number; t: number; k: number } | null = null;
  let lastPose: Fold['pose'] | null = null;
  let viewSet = false;
  const center = new THREE.Vector3();
  const edge = new THREE.Vector3();
  return {
    group,
    update(dt, scrollY, animate) {
      // 約 50 秒一圈。雲帶是橫向的長條，轉的時候是沿著自己滑過去，太慢（原本 125 秒一圈）就看不出在轉
      autoRot += 0.125 * dt;
      ringClock.value += dt;
      const targetScrollRot = scrollY * 0.001;
      currentScrollRot = THREE.MathUtils.lerp(currentScrollRot, targetScrollRot, lerpFactor(0.05, dt));
      body.rotation.y = currentScrollRot + autoRot;
      // 收與長：收的時候縮到極小（非 0，管線才不會重編），長的時候各部分依序長回來
      if (animate !== shown) {
        shown = animate;
        stage = { kind: animate ? 'grow' : 'collapse', t: 0 };
        if (animate) {
          pivot = null;
          pivotIndex = -1;
          currentScale = fullScale;
          // 每條軌道從自己那顆衛星現在的位置開始畫（圈是對稱的，畫完之後轉了多少都一樣）
          for (let i = 0; i < satellites.length; i++) alignOrbit(i);
        } else {
          // 軌道收回各自衛星現在的位置：畫滿的整圈轉到從衛星那裡起算（看不出差別），收的時候尾端追回衛星
          for (let i = 0; i < satellites.length; i++) if ((orbitK[i] ?? 0) >= 1) alignOrbit(i);
          collapseFrom.ring = ringK;
          collapseFrom.orbit = [...orbitK];
          collapseFrom.sat = [...satK];
        }
      }
      const growing = stage?.kind === 'grow';
      // 分區開關：還在／不在的那幾條往目標靠（約 0.4 秒）
      let reshaping = false;
      for (let i = 0; i < live.length; i++) {
        const target = i < sectionCount ? 1 : 0;
        const now = live[i] ?? 0;
        if (now === target) continue;
        const next = now + (target - now) * Math.min(1, dt * 8);
        live[i] = Math.abs(target - next) < 0.002 ? target : next;
        reshaping = true;
      }
      if (stage) {
        stage.t += dt;
        if (stageAt(stage.kind, stage.t)) stage = null;
        applyParts();
      } else if (reshaping) applyParts();
      if (glide && (stage || pivot)) glide = null;
      if (glide) {
        glide.t += dt;
        glide.k = easeInOutCubic(Math.min(1, glide.t / REFOLD_S));
        currentScale = THREE.MathUtils.lerp(glide.scale, fullScale, glide.k);
      }
      group.scale.setScalar(currentScale);
      // 收進一顆衛星：那顆衛星在世界座標裡不動，其他的都往它縮過去
      if (pivot) group.position.copy(pivot).addScaledVector(v.copy(base).sub(pivot), currentScale / fullScale);
      else if (glide) group.position.lerpVectors(glide.from, base, glide.k);
      else group.position.copy(base);
      if (glide && glide.k >= 1) glide = null;
      // 往衛星收的時候衛星停住，不然收進去的那一點會跟著軌道跑掉
      if (!pivot) clock += dt;
      let glowing = false;
      for (const [i, s] of satellites.entries()) {
        const a = anomaly(i);
        const st = stars?.[i];
        if (st) {
          ellipseAt(st, a, s.sprite.position);
          // 軌道進動：整條橢圓繞著黑洞慢慢轉（GRAVITY 2020 年量到 S2 的軌道在進動）
          apses[i].rotation.y = ((st.peri + clock * st.precess) * Math.PI) / 180;
        } else s.sprite.position.set(Math.cos(a) * s.r, 0, Math.sin(a) * s.r);
        const target = glowTarget[i] ?? 0;
        s.g.value += (target - s.g.value) * Math.min(1, dt * 8);
        if (Math.abs(target - s.g.value) > 0.01) glowing = true;
        orbits[i].opacity = ORBIT_DIM + s.g.value * 0.32;
      }
      syncSun();
      const zooming = stage !== null || glide !== null;
      return {
        moving: zooming || glowing || reshaping || Math.abs(targetScrollRot - currentScrollRot) > 0.002,
        zooming,
        grow: growing ? { planet: planetK, ring: ringK } : null,
      };
    },
    setView(width, height, fold) {
      const f = saturnFrame(width, height, fold);
      fullScale = fitScale(f.width, f.height, height) * f.zoom;
      // z = 0 的平面上，畫面半高是 SATURN_VIEW_HALF 個單位、半寬再乘上長寬比
      base.set(
        (f.x / width - 0.5) * 2 * SATURN_VIEW_HALF * (width / height),
        (0.5 - f.y / height) * 2 * SATURN_VIEW_HALF,
        0,
      );
      const pose = fold?.pose ?? null;
      const refold = viewSet && pose !== lastPose;
      lastPose = pose;
      viewSet = true;
      if (!stage) {
        if (refold && shown && !pivot) glide = { from: group.position.clone(), scale: currentScale, t: 0, k: 0 };
        // 滑到一半又收到一次（摺起來時 resize 與 media query 都會通知）：繼續滑，目標已經換成新的
        else if (!glide) {
          if (shown) currentScale = fullScale;
          if (!pivot) group.position.copy(base);
        }
      }
    },
    setGlow(glow) {
      for (let i = 0; i < glowTarget.length; i++) glowTarget[i] = glow[i] ?? 0;
    },
    collapse() {
      currentScale = 0.0001;
      stage = null;
      shown = false;
      pivot = null;
      pivotIndex = -1;
    },
    setSections(count) {
      sectionCount = Math.max(0, Math.min(ORBITS.length, Math.round(count)));
    },
    collapseTo(index) {
      const sat = satellites[index] as (typeof satellites)[number] | undefined;
      group.updateWorldMatrix(true, true);
      pivot = sat ? sat.sprite.getWorldPosition(new THREE.Vector3()) : null;
      pivotIndex = sat ? index : -1;
    },
    lensOnScreen(camera, width, height) {
      if (spec.kind !== 'blackhole' || planetK <= 0.01 || currentScale < 0.02 * fullScale) return null;
      group.getWorldPosition(center);
      const c = center.clone().project(camera);
      edge
        .copy(center)
        .add(new THREE.Vector3(0, currentScale * planetK, 0))
        .project(camera);
      const x = ((c.x + 1) / 2) * width;
      const y = ((1 - c.y) / 2) * height;
      const radius = Math.hypot(((edge.x + 1) / 2) * width - x, ((1 - edge.y) / 2) * height - y);
      return { x, y, r: radius * LENS_EINSTEIN };
    },
    project(camera, width, height) {
      const toScreen = (p: THREE.Vector3) => {
        p.project(camera);
        return [((p.x + 1) / 2) * width, ((1 - p.y) / 2) * height] as const;
      };
      group.getWorldPosition(center);
      const camDist = camera.position.distanceTo(center);
      // 星球在畫面上的半徑：中心與往上一個星球半徑的那一點，投影後的距離
      edge.copy(center).add(new THREE.Vector3(0, currentScale, 0));
      const [ex, ey] = toScreen(edge);
      const [cx, cy] = toScreen(center.clone());
      const radius = Math.hypot(ex - cx, ey - cy);
      // 只回報開著的分區那幾顆：首頁一個分區一張字卡，數目對不上會當成 3D 還沒好、整個退成平面版
      return satellites.slice(0, sectionCount).map((s, i) => {
        s.sprite.getWorldPosition(v);
        const behind = camera.position.distanceTo(v) > camDist;
        const [x, y] = toScreen(v);
        return {
          x,
          y,
          hidden:
            currentScale < 0.05 * fullScale || (satK[i] ?? 0) < 0.3 || (behind && Math.hypot(x - cx, y - cy) < radius),
        };
      });
    },
  };
}

interface AdapterLike {
  isFallbackAdapter?: boolean;
  info?: { isFallbackAdapter?: boolean; architecture?: string; vendor?: string };
}

/**
 * 這台機器的 3D 會不會落在 CPU 上（SwiftShader / WARP / llvmpipe）。
 *
 * 主執行緒另外有 GPU 探測（lib/webglSupport.ts），但 3D 不等它：首頁的土星要等這個 runner 把管線
 * 全部編譯完才開始，等探測做完再建等於多等一輪。所以 runner 自己先查，是軟體渲染就在
 * 編譯任何東西之前退出——不查的話，沒有 GPU 的機器會用 CPU 模擬的 GPU 編譯整套著色器，
 * 把 CPU 吃滿到頁面都載不完（CI 的 e2e 實際逾時過）。
 */
async function softwareRendering(): Promise<boolean> {
  const gpu = (globalThis.navigator as { gpu?: { requestAdapter(): Promise<AdapterLike | null> } }).gpu;
  const adapter = await gpu?.requestAdapter().catch(() => null);
  if (adapter) {
    const fallback = adapter.info?.isFallbackAdapter ?? adapter.isFallbackAdapter ?? false;
    const name = `${adapter.info?.architecture ?? ''} ${adapter.info?.vendor ?? ''}`;
    if (!fallback && !/swiftshader/i.test(name)) return false;
  }
  // 沒有 WebGPU（或只有 CPU 版的）→ three 會走 WebGL2，看 WebGL 的 renderer 字串
  const canvas = typeof OffscreenCanvas === 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(1, 1);
  return inspectWebGL(canvas) !== 'hardware';
}

export async function createStarfieldRunner(
  init: StarfieldInit,
): Promise<{ runner: StarfieldRunner; backend: 'WebGPU' | 'WebGL2'; timing: InitTiming }> {
  let mark = performance.now();
  const lap = () => {
    const now = performance.now();
    const d = Math.round(now - mark);
    mark = now;
    return d;
  };
  if (await softwareRendering()) throw new Error('沒有硬體加速（軟體渲染），不建 3D');
  const probe = lap();
  const renderer = new THREE.WebGPURenderer({
    // 型別只收 HTMLCanvasElement；OffscreenCanvas 在 runtime 相容（官方 worker 範例同款用法）
    canvas: init.canvas as HTMLCanvasElement,
    antialias: true,
    alpha: true,
    // GPU 時間（timestamp query）：品質降級看這個，不看 fps。見下面渲染迴圈的說明。
    trackTimestamp: true,
  });
  renderer.setPixelRatio(Math.min(init.dpr, 2));
  renderer.setSize(init.width, init.height, false);
  // 覆蓋 three 的預設處理（只 console.error 一行），改成回報給呼叫端重建。見 onDeviceLost 的註解。
  // 要在 init() 之前掛：WebGPU 的 device.lost promise 是在 init 裡建 device 時就接上的。
  renderer.onDeviceLost = (info: { api?: string; message?: string; reason?: string | null }) => {
    init.onDeviceLost?.(
      `${info.api ?? 'GPU'} device lost: ${info.message ?? '未知'}${info.reason ? ` (${info.reason})` : ''}`,
    );
  };
  await renderer.init();
  const device = lap();
  const backend: 'WebGPU' | 'WebGL2' =
    (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true ? 'WebGPU' : 'WebGL2';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, init.width / init.height, 0.1, 400);
  camera.position.set(0, 0, 5);

  const layers = LAYERS.map((base) => {
    const cfg = init.lite ? { ...base, count: Math.round(base.count * 0.35) } : base;
    return { points: buildStarLayer(cfg), cfg };
  });
  for (const l of layers) scene.add(l.points);

  // 土星另外一個場景、用視角很窄的鏡頭從很遠的地方看：提案的土星與軌道幾乎沒有透視（前後的軌道一樣寬），
  // 跟星空同一個鏡頭（z=5、視角 75°）的話，最外圈軌道離鏡頭太近，近的那半圈被放大、遠的縮小，形狀就走樣了。
  // 視角 8°、距離讓畫面半高在 z=0 仍是 3.84 個單位：「一個單位幾個像素」跟原本一樣，前後大小只差約 6%。
  // 不用正交鏡頭：點精靈的大小是照透視算的，正交鏡頭下整顆星球的點都縮到看不見。
  const saturnScene = new THREE.Scene();
  const aspect0 = init.width / init.height;
  const saturnCam = new THREE.PerspectiveCamera(SATURN_FOV, aspect0, 1, 200);
  saturnCam.position.set(0, 0, SATURN_CAMERA_Z);
  // 光從左上前方來（跟提案一樣）。只用來算星球上點的亮暗，場景裡沒有真的燈
  let sections = init.sections ?? ORBITS.length;
  const planetFor = (theme: Theme, colors: Palette) =>
    buildSaturn(
      new THREE.Vector3(...SUN).multiplyScalar(10),
      {
        INK: threeColor(colors.paper),
        GROUND: threeColor(colors.ground),
        AMBER: threeColor(colors.amber),
      },
      sections,
      PLANETS[theme],
    );
  let saturn = planetFor(init.theme ?? 'saturn', init.palette ?? DEFAULT_PALETTE);
  saturn.setView(init.width, init.height, init.fold ?? null);
  let viewW = init.width;
  let viewH = init.height;
  let viewFold = init.fold ?? null;
  let glowNow: number[] = [];
  /**
   * 換主題：舊的收成一點之後才建新的（commitTheme）。新的第一次畫到時會同步編譯 shader、停一下，
   * 那一刻畫面上只剩一個點，看不出來。
   * ⚠️ 不要在背景先 saturnPass.compileAsync：畫面還在畫同一個 pass 的時候編它，WebGPU 判定
   *   「output 這張貼圖同時被寫又被讀」，接著整個 device 掉了（實際發生過，3D 被迫重建）
   */
  let pendingTheme: { theme: Theme; palette: Palette } | null = null;
  let saturnVisible = false;
  let saturnAnimate = true;
  let scrollY = 0;
  saturn.group.visible = false; // 僅首頁顯示，等 setSaturn 訊息
  saturnScene.add(saturn.group);

  // selective bloom（BloomNode 官方 MRT 範例同款）：bloom 只吃星星（emissive 通道），土星那層另外畫、不進 bloom。
  // ⚠ 場景 pass 的 MSAA 只在低像素密度開。這個 pass 是兩張半精度浮點的 MRT（output＋bloomIntensity），
  //   開 4× MSAA 的代價很高：內顯（Radeon 780M）實測 DPR 2 時一幀 14.3ms → 關掉後 8.7ms（−40%），
  //   DPR 1 時 8.65 → 7.3ms。星星本來就是柔光的 quad，MSAA 只影響邊緣，而 DPR ≥ 1.5 時
  //   像素已經夠細、看不出差別。
  const dprUsed = Math.min(init.dpr, 2);
  const msaa = dprUsed >= 1.5 ? 0 : 4;
  /** 重力透鏡的中心（畫面 0–1）、愛因斯坦半徑（畫面高度的幾成）、寬高比；半徑 0 是關掉 */
  const lensCenter = uniform(new THREE.Vector2(0.5, 0.5));
  const lensRadius = uniform(0);
  const lensAspect = uniform(init.width / Math.max(1, init.height));
  const scenePass = pass(scene, camera, { samples: msaa });
  scenePass.setMRT(mrt({ output, bloomIntensity: float(0) })); // 全域預設：不進 bloom
  const scenePassColor = scenePass.getTextureNode('output');
  const bloomMask = scenePass.getTextureNode('bloomIntensity');
  // 重力透鏡（黑洞）：星空在「被黑洞偏折過的位置」取樣。點質量透鏡：β = θ − θE²/θ（θE 是愛因斯坦半徑），
  // 越靠近黑洞偏得越多，貼著光子環的星被拉成弧。lensRadius 是 0（別的主題、黑洞沒顯示）時取樣位置跟原本一樣；
  // 三個主題共用這一份 shader，換主題不用重編。光暈也吃偏折過的星空，跟星星本身對得上
  const d = screenUV.sub(lensCenter).mul(vec2(lensAspect, 1));
  const bend = float(1).sub(lensRadius.mul(lensRadius).div(dot(d, d).max(0.000001)));
  const lensedUV = select(lensRadius.greaterThan(0), lensCenter.add(d.mul(bend).div(vec2(lensAspect, 1))), screenUV);
  const starsColor = scenePassColor.sample(lensedUV);
  const bloomPass = bloom(starsColor.mul(bloomMask.sample(lensedUV)), 0.35, 0.35, 0.5); // strength / radius / threshold
  const combined = starsColor.add(bloomPass);
  // 土星那層疊在星空上：它的顏色已經乘過自己的透明度（一般混合畫在透明底上就是這樣），
  // 所以是「星空 × (1 − 土星的 alpha) + 土星」。擋背面的那顆紙色球 alpha 是 1，球後面的星星就被蓋掉。
  // 輸出保留 alpha：canvas 透明疊在頁面的黑紙上，alpha 全變 1 的話底色會被蓋成純黑
  const saturnPass = pass(saturnScene, saturnCam, { samples: msaa });
  const sat = saturnPass.getTextureNode('output');
  const sceneOut = vec4(combined.rgb.mul(float(1).sub(sat.a)).add(sat.rgb), max(starsColor.a, sat.a));
  const pipeline = new THREE.RenderPipeline(renderer, sceneOut);

  // ── 暖機：所有會用到的管線都在 ready 之前編譯完 ──
  // three 預設在「第一次畫到」時才編譯，那會是土星出現的那一刻的一次停頓。
  // 土星此時還是隱藏的（等主執行緒的 setSaturn），暫時打開以極小縮放畫一次，管線就有了。
  saturn.group.visible = true;
  // 用 PassNode 的 compileAsync，不是 renderer.compileAsync(scene, camera)：後者照「畫到 canvas」
  // 的設定編，而場景 pass 是兩張半精度的 MRT，管線不一樣——第一次 render 時會整批同步重編
  // （實測主 pipeline 第一次畫要 100–440ms，換成這個之後剩 70–170ms，剩下的是 bloom 的全螢幕 pass）。
  await scenePass.compileAsync(renderer);
  await saturnPass.compileAsync(renderer);
  const compile = lap();
  pipeline.render();
  saturn.group.visible = false;
  const first = lap();

  // ── 渲染迴圈 ──────────────────────────────────────────────────
  //
  // 閒置時降到 30fps：星空的轉速是 0.01～0.02 rad/s、土星自轉 0.05 rad/s，30fps 跟 60fps 看不出差別，
  // 但 GPU 的工作量減半（筆電的風扇與電池差很多）。
  // 有「動作」的時候（捲動、改尺寸、土星的 lerp 還沒收斂）回到 60fps，捲動跟著土星轉不會頓。
  // rAF 還是每個 vsync 都會進來，只是閒置時隔一幀才畫——跳過的那一幀只花幾微秒。
  //
  // 有動作的時候也不超過約 60fps：rAF 跟著螢幕更新率走，144Hz 的螢幕上工作量是 60Hz 的 2.4 倍，
  // 而背景轉得很慢，多出來的幀看不出差別。怎麼跳格見 framePacer.ts。
  //
  // 例外是土星的收與長：那是畫面上唯一的動作，而且跟 CSS 動畫同時在跑，鎖 60fps 的話
  // 180Hz 螢幕上就是「周圍很順、只有它在頓」。這段跟著螢幕更新率畫，放大收斂後回到上面的規則。
  const IDLE_AFTER_MS = 1500;
  const ACTIVE_FRAME_MS = 1000 / 60;
  const IDLE_FRAME_MS = 1000 / 30;
  const pacer = createFramePacer();
  let lastActive = 0;
  const markActive = () => {
    lastActive = performance.now();
  };
  markActive();
  let lastRender = -1;
  let frames = 0;
  let acc = 0;
  let saturnZooming = false;

  // ── 效能自動降級 ──────────────────────────────────────────────
  // 能力偵測（沒有 WebGPU/WebGL 就不掛 3D）之外，還要處理「有 GPU 但跑很慢」的機器。
  // 連續 3 秒太慢就降一級（減少星數 → 再降就關土星）；**不自動升回**，避免在門檻附近抖動。
  //
  // ⚠ 「太慢」看 GPU 時間（timestamp query），不看 fps。fps 量的是「畫面多久交付一次」，
  //   不是「這一幀多貴」——瀏覽器因為別的原因降低交付頻率時（省電模式、視窗被遮住、某些驅動與
  //   合成器的組合），fps 會掉到 20 而 GPU 其實閒著。實測在 RTX 5060 Ti 的 WebGPU 路徑上就這樣：
  //   每幀固定 50.00ms，3 秒後被判成太慢，土星**永久**被關掉。
  //   瀏覽器不給 timestamp（WebGL2 沒有 EXT_disjoint_timer_query_webgl2）時才退回看 fps。
  const SLOW_GPU_MS = 12;
  const LOW_FPS = 24;
  const LOW_SECONDS_TO_DEGRADE = 3;
  const QUALITY_FACTOR = [1, 0.5, 0.25];
  let quality = 0;
  let lowSeconds = 0;
  let gpuMsPerFrame: number | null = null;
  /** 每幀 GPU 時間的指數移動平均；瀏覽器不給 timestamp 時一直是 null */
  let gpuEma: number | null = null;
  const applyQuality = () => {
    const factor = QUALITY_FACTOR[quality] ?? 1;
    for (const l of layers) l.points.count = Math.max(1, Math.round(l.cfg.count * factor));
    // 最低等級連土星也收掉（它是最貴的一塊）
    saturn.group.visible = saturnVisible && quality < 2;
  };

  let starsOn = true;
  /** 全暗之後已經清過一幀了 */
  let darkDrawn = false;
  /** 畫的時候丟過例外（device 不能用了）：等呼叫端重建，這一組不再重開迴圈 */
  let broken = false;
  const loop = (now: number) => {
    // ⚠ 跟 lastActive 比要用同一個時鐘：lastActive 是 performance.now()，而 rAF 的 now 是
    //   這一幀的時間戳，規格沒保證兩者在 worker 裡同步。now 落後的話「距上次活動」永遠小於門檻，
    //   就永遠不會進閒置。
    const wall = performance.now();
    const active = wall - lastActive < IDLE_AFTER_MS;
    const fullRate = saturnZooming;
    if (!pacer.shouldRender(now, fullRate ? 0 : active ? ACTIVE_FRAME_MS : IDLE_FRAME_MS)) return;
    // delta 是距離上一次「真的畫」的時間：跳幀不會讓動畫變慢；夾住是為了分頁切回時不暴衝
    const delta = lastRender < 0 ? 0.016 : Math.min((now - lastRender) / 1000, 0.05);
    lastRender = now;
    for (const l of layers) {
      l.points.rotation.x += delta * l.cfg.rotX;
      l.points.rotation.y += delta * l.cfg.rotY;
    }
    // 星星淡出淡回；全暗而且沒有土星時畫完這一幀（清空）就不再畫，GPU 歇著
    const starTarget = starsOn ? 1 : 0;
    if (Math.abs(starAlpha.value - starTarget) > 0.001) {
      starAlpha.value += (starTarget - starAlpha.value) * lerpFactor(0.08, delta);
      if (Math.abs(starAlpha.value - starTarget) <= 0.001) starAlpha.value = starTarget;
      markActive();
    }
    const dark = starAlpha.value === 0 && !saturnVisible;
    for (const l of layers) l.points.visible = starAlpha.value > 0;
    if (dark && darkDrawn) return;
    darkDrawn = dark;

    if (saturnVisible) {
      const s = saturn.update(delta, scrollY, saturnAnimate);
      saturnZooming = s.zooming;
      if (s.moving) markActive();
      // 換主題：收成一點了（不再動）才換
      if (pendingTheme && !saturnAnimate && !s.moving) commitTheme();
      const lensAt = saturn.lensOnScreen(saturnCam, viewW, viewH);
      lensRadius.value = lensAt ? lensAt.r / viewH : 0;
      if (lensAt) lensCenter.value.set(lensAt.x / viewW, lensAt.y / viewH);
      // 附上算出位置的時間（跟主執行緒共用的時基），首頁的字照它推算到自己那一幀（store/homeOrbit）
      init.onSatellites?.(saturn.project(saturnCam, viewW, viewH), performance.timeOrigin + performance.now());
      if (s.grow) init.onSaturnGrow?.(s.grow);
    }
    try {
      pipeline.render();
    } catch (err) {
      // iOS 的 App 從背景切回來時，device 可能已經不能用了、lost 卻沒有觸發：畫的時候才丟
      // （createCommandEncoder 的 InvalidStateError、getCurrentTexture 回 null）。three 的動畫迴圈是先排下一幀
      // 才呼叫這裡，所以之後每一幀都會再丟一次，土星就再也不出來。當成 device lost，交給呼叫端整組重建
      broken = true;
      void renderer.setAnimationLoop(null);
      init.onDeviceLost?.(`render failed: ${String(err)}`);
      return;
    }
    // ⚠ 每一幀都要取回：three 的 query pool 格數有限，一秒才取一次的話格子在幾分之一秒內就滿了，
    //   之後的 pass 根本沒量到（實測量出 0.05ms 這種不可能的值）。取回是非同步的，結果晚一兩幀到。
    void renderer
      .resolveTimestampsAsync('render')
      .then((ms) => {
        if (typeof ms === 'number' && ms > 0) gpuEma = gpuEma === null ? ms : gpuEma * 0.9 + ms * 0.1;
      })
      .catch(() => undefined);
    frames += 1;
    acc += delta;
    if (acc >= 1) {
      const fps = frames / acc;
      init.onPerf?.({
        fps,
        avgMs: (acc / frames) * 1000,
        quality,
        gpuMs: gpuMsPerFrame,
        vsyncMs: pacer.vsyncMs,
        idle: !active,
        clockSkewMs: now - wall,
      });
      gpuMsPerFrame = gpuEma;
      const tooSlow = gpuMsPerFrame !== null ? gpuMsPerFrame > SLOW_GPU_MS : fps < LOW_FPS && active;
      if (tooSlow && quality < QUALITY_FACTOR.length - 1) {
        lowSeconds += 1;
        if (lowSeconds >= LOW_SECONDS_TO_DEGRADE) {
          quality += 1;
          lowSeconds = 0;
          applyQuality();
        }
      } else {
        lowSeconds = 0;
      }
      frames = 0;
      acc = 0;
    }
  };
  void renderer.setAnimationLoop(loop);

  /** 拿掉一顆主星：從場景移除、釋放幾何與材質 */
  function disposeRig(rig: SaturnRig) {
    saturnScene.remove(rig.group);
    rig.group.traverse((o) => {
      // Sprite 的 quad geometry 是 three 內部共享的，不能 dispose（同 dispose() 那段），只釋放材質
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) (o.geometry as THREE.BufferGeometry).dispose();
      if (o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Sprite) {
        const mats = o.material as THREE.Material | THREE.Material[];
        for (const m of Array.isArray(mats) ? mats : [mats]) m.dispose();
      }
    });
  }

  /** 拿掉舊的主星，換上 pendingTheme 的，從一點長出來。舊的這時已經收成一點，看不出換的那一下 */
  function commitTheme() {
    const want = pendingTheme;
    if (!want) return;
    pendingTheme = null;
    const visible = saturn.group.visible;
    disposeRig(saturn);
    saturn = planetFor(want.theme, want.palette);
    saturn.setView(viewW, viewH, viewFold);
    saturn.setGlow(glowNow);
    saturn.collapse();
    saturn.group.visible = visible;
    saturnScene.add(saturn.group);
    saturnAnimate = true;
    // 先走一次長的第 0 秒，各部分套上「從一點開始」的大小：不然這一幀畫的是建好時的原尺寸，
    // 整圈環會先閃一下（實際發生過）
    if (saturnVisible) saturn.update(0, scrollY, true);
    markActive();
  }

  return {
    backend,
    timing: { probe, device, compile, first },
    runner: {
      setSize(width, height, fold) {
        markActive();
        viewW = width;
        viewH = height;
        viewFold = fold ?? null;
        saturn.setView(width, height, fold ?? null);
        camera.aspect = width / height;
        lensAspect.value = width / Math.max(1, height);
        saturnCam.aspect = camera.aspect;
        saturnCam.updateProjectionMatrix();
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      },
      setScroll(y) {
        if (y !== scrollY) markActive();
        scrollY = y;
      },
      setSaturn(visible, animate) {
        markActive();
        if (saturnVisible && !visible) init.onSatellites?.([], performance.timeOrigin + performance.now());
        // 每次重新出現都從一點撐開（換頁轉場的「長」）
        if (!saturnVisible && visible) saturn.collapse();
        // 換主題收到一半就離開首頁：不等收完，直接換
        if (pendingTheme && !visible) commitTheme();
        saturnVisible = visible;
        // 主星不在畫面上：重力透鏡關掉（它只在 loop 裡、主星顯示時更新）
        if (!visible) lensRadius.value = 0;
        darkDrawn = false;
        saturnAnimate = animate;
        // 最低品質下即使呼叫顯示也不開（土星最貴）
        saturn.group.visible = visible && quality < 2;
      },
      setSatelliteGlow(glow) {
        markActive();
        glowNow = glow;
        saturn.setGlow(glow);
      },
      setStars(visible) {
        markActive();
        starsOn = visible;
        darkDrawn = false;
      },
      setPan(x, y) {
        // 一個像素是多少弧度：鏡頭的垂直視角攤在畫面高度上。星在球面上，怎麼轉都不會露出邊
        const k = (camera.fov * Math.PI) / 180 / Math.max(1, viewH);
        camera.rotation.set(y * k, x * k, 0);
        markActive();
      },
      collapseSaturnTo(index) {
        markActive();
        saturn.collapseTo(index);
        saturnAnimate = false;
      },
      setSections(count) {
        markActive();
        sections = count;
        saturn.setSections(count);
      },
      setTheme(theme, palette) {
        markActive();
        pendingTheme = { theme, palette };
        // 顯示中：收成一點，loop 看到收完了才換；沒顯示：直接換（下次出現時本來就從一點長）
        if (saturnVisible) saturnAnimate = false;
        else commitTheme();
      },
      setRunning(running) {
        if (running && !broken) {
          lastRender = -1; // 暫停期間的時間不灌進 delta
          pacer.reset();
          markActive();
          void renderer.setAnimationLoop(loop);
        } else {
          void renderer.setAnimationLoop(null);
        }
      },
      dispose() {
        void renderer.setAnimationLoop(null);
        pipeline.dispose();
        for (const l of layers) {
          // Sprite 的 quad geometry 為 three 內部共享，不 dispose；材質是我們的
          (l.points.material as THREE.Material).dispose();
        }
        void renderer.dispose();
      },
    },
  };
}
