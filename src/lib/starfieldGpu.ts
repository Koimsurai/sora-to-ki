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
import type { SkyAnchor } from '@/store/skyAnchor';
import {
  pass,
  mrt,
  output,
  float,
  instancedBufferAttribute,
  uv,
  time,
  sin,
  mix,
  smoothstep,
  vec2,
  vec3,
  vec4,
  uniform,
  texture,
  dot,
  length,
  normalize,
  clamp,
  abs,
  step,
  positionLocal,
  normalLocal,
  normalView,
  positionViewDirection,
  mx_noise_float,
  select,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { createSkyFx } from './skyFx';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { createFramePacer } from './framePacer';
import { createHyperspace, type Hyperspace } from './hyperspace';
import { inspectWebGL } from './webglRenderer';
import { introFrame, phasesCrossed, phaseTimes, type IntroPhase } from './introTimeline';

export const STAR_COUNT = 26000; // 14k 主層 + 12k 星系層（≈舊棧全部點數 27.1k；WebGPU 下加星幾乎免費）

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

export interface StarfieldRunner {
  setSize(width: number, height: number): void;
  setRunning(running: boolean): void;
  /** 捲動位置（土星的捲動旋轉；worker 無 window，由主執行緒轉發） */
  setScroll(y: number): void;
  /** 土星顯示（僅首頁）與 intro 縮放動畫 */
  setSaturn(visible: boolean, animate: boolean): void;
  /** 跳過開場。開場還沒開始的話就直接不播 */
  skipIntro(): void;
  /** 這一頁的天空（見 SkyMode）。換頁時星星會變成下一頁的樣子 */
  setSky(mode: SkyMode): void;
  /** 碎念頁頁首要土星停在哪（見 store/skyAnchor）；null 是頁首不在了 */
  setAnchor(anchor: SkyAnchor | null): void;
  dispose(): void;
}

/**
 * 每個分區一片天空，換頁時是同一批星星在變：
 *   home    土星（離開首頁時碎成星星，回來時聚回去）
 *   notes   星軌：星空繞著天極轉，長曝光的軌跡一點一點累積出來
 *   moments 像素抖動：土星停到頁首、碎成像素，星星吸附到同一個格子上，畫面掉成 1-bit、一格一格跳
 *   default 其他頁：一般星空
 */
export type SkyMode = 'home' | 'notes' | 'moments' | 'about' | 'default';

export interface StarfieldInit {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width: number;
  height: number;
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
   * 播首訪開場（超空間跳躍）。開場畫在同一張 canvas 上，runner 建好、所有管線都編譯過之後
   * 第一幀就開始，時間軸由這條渲染迴圈推進（見 lib/introTimeline.ts）。
   */
  intro?: boolean;
  /** 開場的各個階段，主執行緒靠它切 DOM（解開內容、掛特效、收掉跳過鈕） */
  onIntroPhase?: (phase: IntroPhase) => void;
  /**
   * 除錯用（網址加 ?intro-at=毫秒）：開場照常跑到這個時間點就停住。截圖比對要對準同一刻，
   * 而主執行緒收到階段訊息的時間會被它自己的忙碌拖慢，從外面計時對不準。
   */
  introFreezeAt?: number;
  /**
   * 離開／回到首頁時土星怎麼處理：
   *   travel（預設）鏡頭飛過土星、畫面拉成光線，抵達下一片天空；回首頁時從遠處飛回來
   *   burst          土星迸成星塵、落進背景的星（比較用，網址加 ?transition=burst）
   */
  transition?: 'travel' | 'burst';
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
const LAYERS: StarLayerCfg[] = [
  { count: 14000, rMin: 100, rMax: 150, size: 0.2, rotX: 0.01, rotY: 0.02 },
  { count: 12000, rMin: 90, rMax: 110, size: 0.28, rotX: 0.008, rotY: 0.015 },
];

/// 單層星——官方 WebGPU 點雲模式：THREE.Sprite + instancing（PointsNodeMaterial 文件指定）。
/// 重要：WebGPU 上 THREE.Points 永遠 1px（平台限制、size 無效、也沒有 quad uv）——
/// 一開始用 Points 在 WebGPU 上就是「1px 閃爍細星」慘案（實測）。Sprite+instancing
/// 兩個 backend 都走實例化 quad：size/scaleNode 生效、uv() 有值，單一路徑無分叉。
/// per-star 尺寸/色溫/閃爍相位進 instanced attribute，閃爍與柔光全在 shader（TSL）。
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

  // 色溫：白為主，冷暖微變（±35% 飽和）——貼近真實星野的色彩分佈
  const tint = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(tints, 1), 'float');
  const starColor = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.9, 0.78), tint);
  const finalColor = mix(vec3(1, 1, 1), starColor, 0.35).mul(1.35); // >1 的 HDR 餘量餵 bloom（HalfFloat 管線）
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
  mat.opacityNode = falloff.mul(twinkle);

  // per-star 尺寸（scaleNode 乘在 sprite 縮放上）
  mat.scaleNode = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(scales, 1), 'float');
  mat.size = cfg.size;
  mat.sizeAttenuation = true;
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;

  const sprite = new THREE.Sprite(mat);
  sprite.count = cfg.count; // instanced 數量
  sprite.userData.positions = positions; // 土星散成的星塵要落在這些星上（見 buildSaturn）
  // 手記的星軌從最亮的這些星長出來（見 lib/skyFx.ts）
  sprite.userData.scales = scales;
  sprite.userData.tints = tints;
  return sprite;
}

/// 貼圖載入——worker 沒有 Image/TextureLoader，用 fetch + createImageBitmap（主執行緒也通用）。
async function loadTexture(url: string): Promise<THREE.Texture> {
  const resp = await fetch(url);
  const bitmap = await createImageBitmap(await resp.blob(), { imageOrientation: 'flipY' });
  const tex = new THREE.Texture(bitmap as unknown as HTMLImageElement);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

interface SaturnRig {
  group: THREE.Group;
  /**
   * moving：還在追趕目標（intro 縮放或捲動旋轉的 lerp 沒收斂），這段時間不進閒置降幀。
   * zooming：intro 的放大還沒收斂——這段要跟著螢幕更新率畫，不受 60fps 上限限制。
   */
  update(dt: number, scrollY: number, animate: boolean): { moving: boolean; zooming: boolean };
  /** 碎成星星（true）或聚回來（false）。instant＝不播動畫，直接到位 */
  shatter(gone: boolean, instant: boolean): void;
  /** 0 完整、1 全碎（全碎時整組可以藏起來） */
  readonly dissolved: number;
}

/** 散成星塵的時間（秒）：從第一粒剝落到最後一粒落進星空 */
const SHATTER_SECONDS = 3.2;
const PLANET_DUST = 16000;
const RING_DUST = 10000;

/**
 * 「每幀往目標靠近 rate」換算成跟幀率無關的係數（rate 是以 60fps 為準的值）。
 * 直接每幀乘 rate 的話，同一段動畫在 180Hz 上會快 3 倍。
 */
const lerpFactor = (rate: number, dt: number) => 1 - Math.pow(1 - rate, dt * 60);

const RING_INNER = 1.5;
const RING_OUTER = 2.2;
const RING_TILT = Math.PI / 2.5;

/// 土星——對齊舊 Saturn3D：球(r1)+環(1.5-2.2, 傾 π/2.5)+群組傾 π/24+兩衛星，
/// 自轉 0.05 rad/s + 捲動旋轉 scrollY*0.001（lerp 0.05）+ intro 縮放（lerp 0.08）。
/// 環 hover 效果不移植：舊 canvas pointerEvents:none，事件從未觸發過（死碼）。
///
/// 環與陰影都在「局部座標」裡解析計算，不開 shadow map（點光源的 shadow map 是六面 cube，
/// 每幀多畫六次場景）。行星是局部原點上的單位球、環在環自己的 z=0 平面上，所以唯一要每幀
/// 更新的是「太陽在這兩個局部座標裡的位置」——群組在轉、在縮放，太陽不動。
async function buildSaturn(
  sunWorld: THREE.Vector3,
  textures: Promise<[THREE.Texture, THREE.Texture]>,
  /** 背景星空的兩層：星塵的終點是這裡面的星（每層的 userData.positions 是局部座標） */
  starLayers: THREE.Sprite[],
  camera: THREE.Camera,
): Promise<SaturnRig> {
  const [planetMap, ringsMap] = await textures;
  ringsMap.wrapS = THREE.ClampToEdgeWrapping;
  const group = new THREE.Group();
  group.rotation.z = Math.PI / 24;

  const sunInPlanet = uniform(new THREE.Vector3());
  const sunInRing = uniform(new THREE.Vector3());

  // ── 散成星塵 ──
  // dissolve 是整段的時間軸（0 完整、1 散完），倒著播就是聚回來。
  // 表面從亮面那一側開始化成星塵：每一粒帶著那一格的貼圖顏色先往外飄，再各自飛向背景裡
  // 一顆真的星星、在那裡淡掉——散完之後畫面就是原本的星空，不會多出一層貼上去的點。
  // 哪一粒飛向哪一顆星，每次開始散／聚的時候依「當下看得到的星」重新分配（見 assignTargets）。
  const dissolve = uniform(1); // 一開始是藏起來的（等 setSaturn）
  /** 每一粒從迸開到落進星空，佔整段時間軸的多少 */
  const FLIGHT = 0.82;
  const cut = dissolve.mul(1 + FLIGHT);
  const rand = Math.random;
  /**
   * 每一點什麼時候迸開（0 最早）。整顆幾乎同時：只差 0.1 左右，一瞬間全散。
   * 從亮面一路掃到暗面的話，看起來是薩諾斯彈指那種一層一層剝落，不是爆開。
   * 表面與星塵用同一個函式，表面消失的地方剛好是星塵出發的地方。
   */
  const dustTime = (p: Node<'vec3'>, sunLocal: Node<'vec3'>) => {
    const lit = dot(normalize(p), normalize(sunLocal)).mul(0.5).add(0.5);
    const n = mx_noise_float(p.mul(3.1)).mul(0.5).add(0.5);
    return clamp(float(0.1).add(n.mul(0.07)).add(float(1).sub(lit).mul(0.03)), 0, 1);
  };
  /** 迸開前的蓄光（冷白色，不是火）：整顆亮起來、微微鼓起 */
  const charge = smoothstep(0, 0.1, dissolve).mul(float(1).sub(smoothstep(0.1, 0.16, dissolve)));
  const dustProgress = (t: Node<'float'>) => clamp(cut.sub(t).div(FLIGHT), 0, 1);
  /** 正在化開的那一圈邊緣：冷白色的微光（星塵，不是火） */
  const dustEdge = (t: Node<'float'>) =>
    float(1)
      .sub(smoothstep(0, 0.045, t.sub(cut)))
      .mul(step(0.001, dissolve));

  // 環的貼圖是一條「由內到外」的橫向色帶。RingGeometry 的 UV 是平面投影，直接貼會變成
  // 一排平行直條紋而不是同心圓——所以改用半徑當貼圖座標。
  // 貼圖沒有 alpha，直接貼的話黑色的環縫會變成一圈黑帶蓋在行星上，所以用亮度推出透明度。
  const ringAt = (r: ReturnType<typeof length>) => {
    const tex = texture(ringsMap, vec2(r.sub(RING_INNER).div(RING_OUTER - RING_INNER), 0.5));
    const alpha = smoothstep(0.03, 0.22, dot(tex.rgb, vec3(0.299, 0.587, 0.114)));
    return { rgb: tex.rgb, alpha };
  };
  const glint = vec3(0.85, 0.9, 1.0);

  // 行星：被環擋住的地方有影子。從表面點朝太陽打一條射線，交到環的平面上、落在環的範圍內，
  // 就按那一點環的不透明度遮掉陽光。
  const planetMat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 });
  {
    const p = positionLocal;
    const toSun = normalize(sunInPlanet.sub(p));
    const ringN = vec3(0, -Math.sin(RING_TILT), Math.cos(RING_TILT));
    const denom = dot(toSun, ringN);
    const t = dot(p, ringN)
      .negate()
      .div(denom.add(denom.sign().mul(1e-4)));
    const r = length(p.add(toSun.mul(t)));
    const onRing = step(0, t).mul(step(RING_INNER, r)).mul(step(r, RING_OUTER));
    const ringShadow = float(1).sub(onRing.mul(ringAt(r).alpha).mul(0.6));
    planetMat.colorNode = texture(planetMap, uv()).rgb.mul(ringShadow);
    // 大氣的邊緣光：只在受光的那半邊，背光面的邊緣不該亮
    const fresnel = float(1)
      .sub(clamp(dot(normalView, positionViewDirection), 0, 1))
      .pow(3);
    const litSide = smoothstep(-0.15, 0.45, dot(normalLocal, normalize(sunInPlanet)));
    // 已經化成星塵的地方丟掉，正在化開的那一圈微微發光
    const at = dustTime(positionLocal, sunInPlanet);
    planetMat.opacityNode = step(cut, at);
    planetMat.alphaTest = 0.5;
    const edge = dustEdge(at);
    planetMat.emissiveNode = vec3(1.0, 0.86, 0.66)
      .mul(fresnel.mul(litSide).mul(0.35))
      .add(glint.mul(edge.mul(1.4).add(charge.mul(0.35))));
    planetMat.mrtNode = mrt({ bloomIntensity: clamp(edge.mul(0.6).add(charge.mul(0.4)), 0, 1) });
    planetMat.positionNode = positionLocal.mul(float(1).add(charge.mul(0.02)));
  }
  const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), planetMat);

  // 迸開那一瞬間的一團冷白色柔光（不是火球）：很快亮起、很快退掉
  const flashMat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
  flashMat.blending = THREE.AdditiveBlending;
  {
    const flash = smoothstep(0.08, 0.12, dissolve).mul(float(1).sub(smoothstep(0.12, 0.34, dissolve)));
    const d = uv().sub(0.5).length().mul(2);
    const falloff = float(1)
      .sub(smoothstep(0, 1, d))
      .pow(2.5);
    flashMat.colorNode = vec3(0.82, 0.9, 1.0).mul(flash.mul(falloff).mul(1.1));
    flashMat.opacityNode = flash.mul(falloff).mul(0.6);
    flashMat.mrtNode = mrt({ bloomIntensity: float(1) });
    flashMat.scaleNode = float(1.6).add(flash.mul(2.4));
  }
  const burstFlash = new THREE.Sprite(flashMat);
  burstFlash.frustumCulled = false;

  // 環：薄薄一層冰粒，亮度跟入射角的關係很弱——用 Standard 材質的話光從很斜的角度照過來，
  // 整圈環暗到幾乎看不見。這裡自己算光：入射角只影響一半，加上行星投過來的影子。
  const ringMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false });
  {
    const p = positionLocal;
    const ring = ringAt(length(p.xy));
    const toSun = normalize(sunInRing.sub(p));
    // 行星（單位球、在原點）有沒有擋在這一點與太陽之間
    const b = dot(p.negate(), toSun);
    const d2 = dot(p, p).sub(b.mul(b));
    const planetShadow = mix(float(1), smoothstep(0.82, 1.0, d2), step(0, b));
    const lit = mix(0.55, 1.0, abs(toSun.z));
    const at = dustTime(p, sunInRing);
    ringMat.colorNode = ring.rgb
      .mul(vec3(1.0, 0.93, 0.82))
      .mul(lit.mul(planetShadow).mul(1.5))
      .add(glint.mul(dustEdge(at)));
    ringMat.opacityNode = ring.alpha.mul(0.9).mul(step(cut, at));
  }

  // ── 星塵 ──
  // 終點是背景星空裡的星：星塵在這兩個局部座標裡算位置，終點則是「那顆星現在的世界座標」
  // 換回局部座標——星空一直在慢慢轉，用當下的矩陣，落點才會剛好疊在那顆星上。
  const layerM = [uniform(new THREE.Matrix4()), uniform(new THREE.Matrix4())];
  const invPlanet = uniform(new THREE.Matrix4());
  const invRing = uniform(new THREE.Matrix4());
  interface Dust {
    sprite: THREE.Sprite;
    star: THREE.InstancedBufferAttribute;
    layer: THREE.InstancedBufferAttribute;
  }
  const dustMaterial = (
    origin: Node<'vec3'>,
    out: Node<'vec3'>,
    star: Node<'vec3'>,
    layer: Node<'float'>,
    inv: typeof invPlanet,
    t: Node<'float'>,
    color: Node<'vec3'>,
    alpha: Node<'float'>,
  ) => {
    const mat = new THREE.PointsNodeMaterial();
    const k = dustProgress(t);
    const starWorld = select(layer.lessThan(0.5), layerM[0].mul(vec4(star, 1)).xyz, layerM[1].mul(vec4(star, 1)).xyz);
    const target = inv.mul(vec4(starWorld, 1)).xyz;
    // 兩段：先往外飄散成一層星塵（看得到「散開」），再慢慢加速飛向各自的星
    const burst = mx_noise_float(origin.mul(7)).mul(0.5).add(0.5);
    const drift = origin.add(out.mul(burst.mul(1.6).add(0.7)));
    const e1 = float(1).sub(
      float(1)
        .sub(smoothstep(0, 0.28, k))
        .pow(3),
    );
    const e2 = smoothstep(0.24, 1, k).pow(1.7);
    mat.positionNode = mix(mix(origin, drift, e1), target, e2);
    // 一開始是那一格的顏色，飛著飛著變成星光
    mat.colorNode = mix(color, vec3(0.92, 0.95, 1.0).mul(1.3), smoothstep(0.15, 0.7, k));
    const d = uv().sub(0.5).length().mul(2.0);
    // 還黏在表面上的不畫（表面自己還在）；快到星星那裡時淡掉，跟那顆星融在一起
    mat.opacityNode = smoothstep(1.0, 0.4, d)
      .mul(step(0.0001, k))
      .mul(float(1).sub(smoothstep(0.8, 1, k)))
      .mul(alpha);
    mat.mrtNode = mrt({ bloomIntensity: smoothstep(0.2, 0.8, k).mul(0.8) });
    mat.size = 0.022;
    mat.sizeAttenuation = true;
    mat.transparent = true;
    mat.depthWrite = false;
    return mat;
  };
  const dynamic = (arr: Float32Array, size: number) =>
    new THREE.InstancedBufferAttribute(arr, size).setUsage(THREE.DynamicDrawUsage);

  const planetDust: Dust = (() => {
    const origin = new Float32Array(PLANET_DUST * 3);
    const texUv = new Float32Array(PLANET_DUST * 2);
    for (let i = 0; i < PLANET_DUST; i++) {
      // 跟 SphereGeometry 同一套參數化：u 是經度、v 從北極往南；面積均勻取樣
      const u = rand();
      const v = Math.acos(1 - 2 * rand()) / Math.PI;
      const phi = u * Math.PI * 2;
      const theta = v * Math.PI;
      origin.set([-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)], i * 3);
      texUv.set([u, 1 - v], i * 2);
    }
    const star = dynamic(new Float32Array(PLANET_DUST * 3), 3);
    const layer = dynamic(new Float32Array(PLANET_DUST), 1);
    const o = instancedBufferAttribute<'vec3'>(new THREE.InstancedBufferAttribute(origin, 3), 'vec3');
    const tUv = instancedBufferAttribute<'vec2'>(new THREE.InstancedBufferAttribute(texUv, 2), 'vec2');
    const light = clamp(dot(o, normalize(sunInPlanet)), 0, 1)
      .mul(1.15)
      .add(0.1);
    const color = texture(planetMap, tUv).rgb.mul(light);
    const sprite = new THREE.Sprite(
      dustMaterial(
        o,
        o,
        instancedBufferAttribute<'vec3'>(star, 'vec3'),
        instancedBufferAttribute<'float'>(layer, 'float'),
        invPlanet,
        dustTime(o, sunInPlanet),
        color,
        float(1),
      ),
    );
    sprite.count = PLANET_DUST;
    sprite.frustumCulled = false;
    return { sprite, star, layer };
  })();

  const ringDust: Dust = (() => {
    const origin = new Float32Array(RING_DUST * 3);
    const out = new Float32Array(RING_DUST * 3);
    for (let i = 0; i < RING_DUST; i++) {
      const r = Math.sqrt(rand() * (RING_OUTER ** 2 - RING_INNER ** 2) + RING_INNER ** 2);
      const a = rand() * Math.PI * 2;
      origin.set([Math.cos(a) * r, Math.sin(a) * r, 0], i * 3);
      // 沿著環的平面往外飄，帶一點上下的厚度
      out.set([Math.cos(a) * 0.9, Math.sin(a) * 0.9, (rand() - 0.5) * 0.4], i * 3);
    }
    const star = dynamic(new Float32Array(RING_DUST * 3), 3);
    const layer = dynamic(new Float32Array(RING_DUST), 1);
    const o = instancedBufferAttribute<'vec3'>(new THREE.InstancedBufferAttribute(origin, 3), 'vec3');
    const ot = instancedBufferAttribute<'vec3'>(new THREE.InstancedBufferAttribute(out, 3), 'vec3');
    const ring = ringAt(length(o.xy));
    const lit = mix(0.55, 1.0, abs(normalize(sunInRing.sub(o)).z));
    const color = ring.rgb.mul(vec3(1.0, 0.93, 0.82)).mul(lit.mul(1.5));
    const sprite = new THREE.Sprite(
      dustMaterial(
        o,
        ot,
        instancedBufferAttribute<'vec3'>(star, 'vec3'),
        instancedBufferAttribute<'float'>(layer, 'float'),
        invRing,
        dustTime(o, sunInRing),
        color,
        ring.alpha.mul(0.9),
      ),
    );
    sprite.count = RING_DUST;
    sprite.frustumCulled = false;
    return { sprite, star, layer };
  })();

  /**
   * 每一粒星塵分配一顆「現在看得到」的星當終點。背景的星有一半以上在相機後面或畫面外，
   * 隨便配的話星塵會從鏡頭前面糊過去，或是飛出畫面就不見了。
   */
  const visible: [number, number][] = [];
  const v = new THREE.Vector3();
  const assignTargets = () => {
    visible.length = 0;
    starLayers.forEach((layerSprite, li) => {
      layerSprite.updateWorldMatrix(true, false);
      const pos = layerSprite.userData.positions as Float32Array;
      for (let i = 0; i < pos.length / 3; i += 2) {
        v.fromArray(pos, i * 3).applyMatrix4(layerSprite.matrixWorld);
        v.project(camera);
        if (v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1) visible.push([li, i]);
      }
    });
    if (visible.length === 0) return;
    for (const d of [planetDust, ringDust]) {
      const star = d.star.array as Float32Array;
      const layer = d.layer.array as Float32Array;
      for (let j = 0; j < layer.length; j++) {
        const [li, i] = visible[Math.floor(rand() * visible.length)];
        const pos = starLayers[li].userData.positions as Float32Array;
        star[j * 3] = pos[i * 3];
        star[j * 3 + 1] = pos[i * 3 + 1];
        star[j * 3 + 2] = pos[i * 3 + 2];
        layer[j] = li;
      }
      d.star.needsUpdate = true;
      d.layer.needsUpdate = true;
    }
  };

  const ringHolder = new THREE.Group();
  ringHolder.rotation.x = RING_TILT;
  const rings = new THREE.Mesh(new THREE.RingGeometry(RING_INNER, RING_OUTER, 128, 1), ringMat);
  ringHolder.add(rings, ringDust.sprite);
  group.add(planet, burstFlash, ringHolder, planetDust.sprite);

  const syncSun = () => {
    group.updateWorldMatrix(true, true);
    planet.worldToLocal(sunInPlanet.value.copy(sunWorld));
    rings.worldToLocal(sunInRing.value.copy(sunWorld));
  };

  // 衛星：繞在環的平面上（真的衛星繞赤道面轉，以前兩顆各自歪在不同高度，看起來像隨手擺的）。
  // 三顆各有個性：大而偏橘、帶一圈霧狀大氣（像泰坦）、灰色的冰岩、很小很白的冰球。
  // 不自發光：跟土星一樣被太陽照，背光的那一面是暗的，才不會像貼在畫面上的白點。
  // 轉速照克卜勒定律（越外圈越慢）。軌道不能太大：首頁的土星偏右，外圈會繞進左邊的文字區。
  const moonPlane = new THREE.Group(); // 跟環同一個平面（ringHolder 的局部 z=0）
  ringHolder.add(moonPlane);
  const satellites = [
    { r: 2.55, size: 0.075, color: [0.88, 0.6, 0.32], haze: 0.6, seed: 1 },
    { r: 2.9, size: 0.045, color: [0.7, 0.7, 0.72], haze: 0, seed: 2 },
    { r: 3.25, size: 0.03, color: [0.95, 0.96, 1.0], haze: 0, seed: 3 },
  ].map((cfg) => {
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const base = vec3(cfg.color[0], cfg.color[1], cfg.color[2]);
    // 表面的明暗斑：低頻雜訊，近看才有，遠看就是一顆有質感的球
    const mottling = mx_noise_float(positionLocal.mul(6 / cfg.size).add(cfg.seed * 17))
      .mul(0.5)
      .add(0.5);
    mat.colorNode = base.mul(mottling.mul(0.35).add(0.7));
    if (cfg.haze > 0) {
      // 大氣：邊緣一圈（菲涅耳），只在向光的那一側看得清楚就夠了
      const rim = float(1).sub(clamp(dot(normalView, positionViewDirection), 0, 1));
      mat.emissiveNode = vec3(0.85, 0.55, 0.25).mul(rim.mul(rim).mul(rim).mul(cfg.haze));
    }
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(cfg.size, 32, 24), mat);
    moonPlane.add(mesh);
    return { mesh, angle: Math.random() * Math.PI * 2, speed: 0.55 * Math.pow(2.55 / cfg.r, 1.5), r: cfg.r };
  });

  let autoRot = 0;
  // 捲動帶動的旋轉單獨 lerp：自轉是等速的，不需要 lerp；放進同一個 lerp 的話目標每幀都在前進，
  // lerp 永遠收斂不了，「還在動」就永遠是真的——閒置降幀因此一直沒生效（實測卡在 60fps）。
  let currentScrollRot = 0;
  let currentScale = 0.0001;
  let dissolveTarget = 1;
  return {
    group,
    get dissolved() {
      return dissolve.value;
    },
    shatter(gone, instant) {
      dissolveTarget = gone ? 1 : 0;
      if (instant) dissolve.value = dissolveTarget;
      else assignTargets();
    },
    update(dt, scrollY, animate) {
      const step01 = dt / SHATTER_SECONDS;
      dissolve.value =
        dissolveTarget > dissolve.value
          ? Math.min(dissolveTarget, dissolve.value + step01)
          : Math.max(dissolveTarget, dissolve.value - step01);
      const shattering = dissolve.value !== dissolveTarget;
      for (const s of satellites) s.mesh.visible = dissolve.value < 0.2;
      autoRot += 0.05 * dt;
      const targetScrollRot = scrollY * 0.001;
      currentScrollRot = THREE.MathUtils.lerp(currentScrollRot, targetScrollRot, lerpFactor(0.05, dt));
      group.rotation.y = currentScrollRot + autoRot;
      // intro 縮放：未 animate 用極小 epsilon（非 0）讓管線先編譯好，explosion 時只是放大
      const targetScale = animate ? 1 : 0.0001;
      currentScale = THREE.MathUtils.lerp(currentScale, targetScale, lerpFactor(0.08, dt));
      group.scale.setScalar(currentScale);
      for (const s of satellites) {
        s.angle += s.speed * 0.25 * dt;
        s.mesh.position.set(s.r * Math.cos(s.angle), s.r * Math.sin(s.angle), 0);
      }
      syncSun();
      if (dissolve.value > 0) {
        starLayers.forEach((l, i) => layerM[i].value.copy(l.matrixWorld));
        invPlanet.value.copy(planet.matrixWorld).invert();
        invRing.value.copy(rings.matrixWorld).invert();
      }
      const zooming = Math.abs(targetScale - currentScale) > 0.005;
      return {
        moving: zooming || shattering || Math.abs(targetScrollRot - currentScrollRot) > 0.002,
        zooming: zooming || shattering,
      };
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
 * 主執行緒另外有 GPU 探測（lib/webglSupport.ts），但 3D 不等它：開場要等這個 runner 把管線
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
): Promise<{ runner: StarfieldRunner; backend: 'WebGPU' | 'WebGL2' }> {
  if (await softwareRendering()) throw new Error('沒有硬體加速（軟體渲染），不建 3D');
  // 土星貼圖跟下面建 GPU device 同時下載，不要等 init 完才開始（開場要等整個 runner 就緒）。
  // 先掛一個空的 catch：失敗要到 buildSaturn 那裡才處理，這段空檔不該冒出 unhandledrejection。
  const saturnTextures = Promise.all([
    loadTexture('/textures/saturn_texture.webp'),
    loadTexture('/textures/saturn_rings_texture.webp'),
  ]);
  saturnTextures.catch(() => undefined);
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
  const backend: 'WebGPU' | 'WebGL2' =
    (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true ? 'WebGPU' : 'WebGL2';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, init.width / init.height, 0.1, 400);
  camera.position.set(0, 0, 5);

  const layers = LAYERS.map((cfg) => ({ points: buildStarLayer(cfg), cfg }));
  // 星空包一層：星軌那一頁整片繞天極轉（見 lib/skyFx.ts），不動各層自己的慢速自轉
  const skyGroup = new THREE.Group();
  for (const l of layers) skyGroup.add(l.points);
  scene.add(skyGroup);

  // 光源（對齊舊 Saturn canvas：環境光 + 太陽點光）
  scene.add(new THREE.AmbientLight(0xffffff, 0.15));
  const sun = new THREE.PointLight(0xffffff, 400);
  sun.position.set(4.5, 3.5, 5.5);
  scene.add(sun);

  // 土星（貼圖非同步；失敗不擋星空——例如離線快取缺圖）
  let saturn: SaturnRig | null = null;
  let saturnVisible = false;
  let saturnAnimate = true;
  let scrollY = 0;
  try {
    saturn = await buildSaturn(
      sun.position,
      saturnTextures,
      layers.map((l) => l.points),
      camera,
    );
    saturn.group.visible = false; // 僅首頁顯示，等 setSaturn 訊息
    scene.add(saturn.group);
  } catch (e) {
    console.warn('[starfieldGpu] 土星貼圖載入失敗，僅渲染星空:', e);
  }

  // selective bloom（BloomNode 官方 MRT 範例同款）：bloom 只吃 emissive 通道——
  // 星星（emissiveNode=顏色）有光暈；土星/衛星（Standard 材質、emissive≈0）不被星空 bloom 掃到，
  // 對齊舊架構「兩條 canvas 各自 bloom 參數」的觀感（舊土星 bloom 僅 0.15，趨近無）。
  // ⚠ 場景 pass 的 MSAA 只在低像素密度開。這個 pass 是兩張半精度浮點的 MRT（output＋bloomIntensity），
  //   開 4× MSAA 的代價很高：內顯（Radeon 780M）實測 DPR 2 時一幀 14.3ms → 關掉後 8.7ms（−40%），
  //   DPR 1 時 8.65 → 7.3ms。星星本來就是柔光的 quad，MSAA 只影響土星的邊緣，而 DPR ≥ 1.5 時
  //   像素已經夠細、看不出差別。
  const dprUsed = Math.min(init.dpr, 2);
  const scenePass = pass(scene, camera, { samples: dprUsed >= 1.5 ? 0 : 4 });
  scenePass.setMRT(mrt({ output, bloomIntensity: float(0) })); // 全域預設：不進 bloom
  const scenePassColor = scenePass.getTextureNode('output');
  const bloomMask = scenePass.getTextureNode('bloomIntensity');
  const bloomPass = bloom(scenePassColor.mul(bloomMask), 0.55, 0.35, 0.5); // strength / radius / threshold（與 pmndrs 參數不對齊，獨立配平值）
  // 輸出保留場景 alpha：canvas 是透明疊在頁面深紫底上的——bloom 疊加若讓 alpha 全變 1，
  // 頁面底色會被蓋成純黑（「顏色有差」的元兇）。rgb 疊 bloom、alpha 用場景原值。
  const combined = scenePassColor.add(bloomPass);
  const sceneOut = vec4(combined.rgb, scenePassColor.a);
  const skyFx = createSkyFx({
    renderer,
    skyGroup,
    starLayers: layers.map((l) => l.points),
    width: init.width,
    height: init.height,
    dpr: dprUsed,
    sceneColor: scenePassColor,
    // @types/three 寫成 getTexture()，r186 實作的名字是 getTextureNode()
    bloomColor: (bloomPass as unknown as { getTextureNode(): ReturnType<typeof texture> }).getTextureNode(),
    camera,
    canTrail: () => !saturnOnScreen(),
  });
  const pipeline = new THREE.RenderPipeline(renderer, skyFx.output(sceneOut));

  // ── 開場 ──
  // 開場期間另外兩條 pipeline（見 lib/hyperspace.ts）：
  //   stagePipeline：爆炸前，只畫開場層——星空與土星整個被蓋住，場景 pass 與 bloom 都不跑
  //   introPipeline：爆炸後，同一個場景 pass 疊在開場層上
  // 三條都在下面的暖機裡先畫過一次，切換時不會再編譯任何東西。
  let hyperspace: Hyperspace | null = null;
  let stagePipeline: THREE.RenderPipeline | null = null;
  let introPipeline: THREE.RenderPipeline | null = null;
  if (init.intro) {
    hyperspace = createHyperspace(renderer, init.width, init.height, dprUsed);
    stagePipeline = new THREE.RenderPipeline(renderer, hyperspace.composite(null));
    introPipeline = new THREE.RenderPipeline(renderer, hyperspace.composite(sceneOut));
  }
  let introStart = -1;
  let introPrev = -1;
  let skippedAt: number | null = null;
  // 跳過的時間點取「下一幀」的時間：取上一幀的話，被提前到那一刻的階段剛好落在
  // phasesCrossed 的 (prev, now] 左端外面，一個都不會送出去
  let skipRequested = false;
  let sceneShown = false;
  const finishIntro = () => {
    hyperspace?.dispose();
    stagePipeline?.dispose();
    introPipeline?.dispose();
    hyperspace = null;
    stagePipeline = null;
    introPipeline = null;
  };

  // ── 暖機：所有會用到的管線都在 ready 之前編譯完 ──
  // three 預設在「第一次畫到」時才編譯，那會是開場頭幾幀、或土星出現的那一刻的一次停頓。
  // 土星此時還是隱藏的（等主執行緒的 setSaturn），暫時打開以極小縮放畫一次，管線就有了。
  if (saturn) saturn.group.visible = true;
  // 用 PassNode 的 compileAsync，不是 renderer.compileAsync(scene, camera)：後者照「畫到 canvas」
  // 的設定編，而場景 pass 是兩張半精度的 MRT，管線不一樣——第一次 render 時會整批同步重編
  // （實測主 pipeline 第一次畫要 100–440ms，換成這個之後剩 70–170ms，剩下的是 bloom 的全螢幕 pass）。
  await scenePass.compileAsync(renderer);
  pipeline.render();
  skyFx.warm();
  if (hyperspace && stagePipeline && introPipeline) {
    hyperspace.update(introFrame(0, null), 0, 0);
    introPipeline.render();
    stagePipeline.render(); // 最後畫開場的第 0 幀：主執行緒一顯示 canvas，看到的就是開場的底色
  }
  if (saturn) saturn.group.visible = false;

  // ── 渲染迴圈 ──────────────────────────────────────────────────
  //
  // 閒置時降到 30fps：星空的轉速是 0.01～0.02 rad/s、土星自轉 0.05 rad/s，30fps 跟 60fps 看不出差別，
  // 但 GPU 的工作量減半（筆電的風扇與電池差很多）。
  // 有「動作」的時候（捲動、改尺寸、intro、土星的 lerp 還沒收斂）回到 60fps，捲動跟著土星轉不會頓。
  // rAF 還是每個 vsync 都會進來，只是閒置時隔一幀才畫——跳過的那一幀只花幾微秒。
  //
  // 有動作的時候也不超過約 60fps：rAF 跟著螢幕更新率走，144Hz 的螢幕上工作量是 60Hz 的 2.4 倍，
  // 而背景轉得很慢，多出來的幀看不出差別。怎麼跳格見 framePacer.ts。
  //
  // 例外是開場與土星放大：那是畫面上唯一的動作，而且跟 CSS 動畫同時在跑，鎖 60fps 的話
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
    if (saturn) saturn.group.visible = saturnOnScreen() && quality < 2;
  };
  /** 土星在畫面上：要顯示，或還在碎裂／聚合的途中 */
  const saturnOnScreen = () => saturn !== null && (saturnVisible || saturn.dissolved < 1);
  // 第一次決定要不要顯示時直接到位：一進站就在首頁的話，土星不該從碎片聚合起來
  let saturnSettled = false;
  const transition = init.transition ?? 'travel';
  /**
   * 換頁的飛行。鏡頭從首頁（土星前面）沿著一條曲線飛到「外面」，有兩條路線：
   *   away：往前飛過土星（手記、碎念與其他頁）
   *   fall：往下墜、低頭往下看，土星從畫面上方升走（關於頁——那一頁本身就是一段下墜）
   * 離開首頁是沿著曲線往前，回首頁是同一條曲線倒著飛——方向相反、路線連續，中途沒有瞬移，
   * 土星回來時從它消失的那一側出現。兩個「外面」之間（例如手記 → 關於）鏡頭直接從一個終點
   * 移到另一個終點，不繞回首頁。
   * pathPos 是鏡頭在目前路線上的位置（0 首頁、1 外面）。
   */
  type Route = 'away' | 'fall';
  let travel:
    | { kind: 'path'; from: number; to: number; t: number }
    | { kind: 'cross'; from: Route; to: Route; t: number }
    | null = null;
  let pathPos = 0;
  let route: Route = 'away';
  /** 最新的天空對應的路線（setSky 先到，setSaturn 起飛時照它選） */
  let wantRoute: Route = 'away';
  const routeFor = (mode: SkyMode): Route => (mode === 'about' ? 'fall' : 'away');
  /** 單程的時間（秒） */
  const TRAVEL_SECONDS = 2.2;
  const PATHS: Record<Route, THREE.Vector3[]> = {
    away: [
      new THREE.Vector3(0, 0, 5),
      new THREE.Vector3(0.4, 0.25, 0.5),
      new THREE.Vector3(5.5, 1.6, -4),
      new THREE.Vector3(6.5, 1.8, -13),
    ],
    fall: [
      new THREE.Vector3(0, 0, 5),
      new THREE.Vector3(0, -1.2, 5.3),
      new THREE.Vector3(0.3, -6.5, 4.8),
      new THREE.Vector3(0.5, -15, 3.5),
    ],
  };
  const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const bez = (p: number, out: THREE.Vector3, r: Route = route) => {
    const P = PATHS[r];
    const q = 1 - p;
    return out
      .copy(P[0])
      .multiplyScalar(q * q * q)
      .addScaledVector(P[1], 3 * q * q * p)
      .addScaledVector(P[2], 3 * q * p * p)
      .addScaledVector(P[3], p * p * p);
  };
  /** 路線上 p 處的姿態：away 轉彎時略往右偏、帶一點側傾；fall 一路低頭，像往下掉時看著腳下 */
  const routeRotation = (r: Route, p: number, out: THREE.Euler) => {
    const bend = Math.sin(Math.PI * p);
    if (r === 'away') return out.set(0.04 * bend, -0.16 * bend, -0.1 * bend);
    const down = p * p * (3 - 2 * p);
    return out.set(-0.55 * down, 0.03 * bend, 0.06 * bend);
  };
  const crossA = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  const crossB = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  const euler = new THREE.Euler();
  const poseAtEnd = (r: Route, out: typeof crossA) => {
    bez(1, out.pos, r);
    out.quat.setFromEuler(routeRotation(r, 1, euler));
  };
  /**
   * 首頁的構圖：土星偏右，左邊留給文字。用鏡頭的 film offset（整個畫面平移）而不是挪鏡頭，
   * 飛行路線不用改；離首頁越遠（p 越大）位移越小，飛出去時土星自然回到正中央再被穿過。
   * 開場播放時不位移（開場的構圖以畫面中心為準），播完土星才往右讓開。
   * 往下捲時鏡頭往下、往後退：土星升上天空、變遠，底下的內容接手畫面。
   */
  let viewAspect = init.width / init.height;
  let viewH = Math.max(1, init.height);
  let compose = 0;
  let homeLift = 0;
  const HOME_SHIFT = 0.4;
  const TAN_HALF_FOV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  /**
   * 碎念頁：土星停在頁面那張點陣畫布指定的位置（store/skyAnchor），碎成跟畫布同一個格子、
   * 同一組顏色的像素——接手的不是另一顆畫好的土星。鏡頭退到「星球半徑剛好是 anchor.r」的距離，
   * 再用 view offset 把整個畫面平移到位（純平移，土星的樣子跟在畫面正中央時一樣）。
   * 點陣天空是固定在視窗上的背景，往下捲時不跟著走，只是慢慢退暗。
   */
  let anchor: SkyAnchor | null = null;
  let perched = false;
  let placedScroll = 0;
  /**
   * 停的位置換了（碎念列表 ↔ 單則頁、畫布晚一點才量好）：從原本的位置滑過去，不是瞬移
   */
  let anchorFrom: SkyAnchor | null = null;
  let anchorT = 1;
  const ANCHOR_SECONDS = 1.2;
  /** 現在土星該停在哪（視窗座標）。畫布還沒量好（資料還在載）時先停在右上方 */
  const viewAnchor = (): SkyAnchor => {
    const target = anchor ?? {
      x: viewAspect * viewH * 0.74,
      y: viewH * 0.34,
      r: viewH * 0.12,
      gx: 0,
      gy: 0,
    };
    if (!anchorFrom || anchorT >= 1) return target;
    const k = easeInOut(anchorT);
    const from = anchorFrom;
    const at = (a: number, b: number) => a + (b - a) * k;
    return {
      x: at(from.x, target.x),
      y: at(from.y, target.y),
      r: at(from.r, target.r),
      gx: at(from.gx, target.gx),
      gy: at(from.gy, target.gy),
    };
  };

  /** 鏡頭在曲線上 p 處的位置與姿態：位置、朝向都只看 p，所以倒著飛就是正著飛的完整倒帶 */
  const placeCamera = (p: number) => {
    placedScroll = scrollY;
    if (perched) {
      const a = viewAnchor();
      const w = viewAspect * viewH;
      camera.position.set(0, 0, viewH / 2 / (Math.max(8, a.r) * TAN_HALF_FOV));
      camera.quaternion.identity();
      camera.filmOffset = 0;
      // setViewOffset 自己會更新投影矩陣
      camera.setViewOffset(w, viewH, w / 2 - a.x, viewH / 2 - a.y, w, viewH);
      skyFx.setGrid(a.gx, a.gy);
      // 往下捲時背景退暗：讀到下面的碎念時，點陣天空只剩底紋
      skyFx.setInk(1 - 0.6 * Math.min(1, scrollY / (viewH * 0.8)));
      return;
    }
    skyFx.setInk(1);
    camera.clearViewOffset();
    bez(p, camera.position);
    const atHome = 1 - p;
    camera.position.y -= homeLift * 1.6 * atHome;
    camera.position.z += homeLift * 1.4 * atHome;
    camera.rotation.copy(routeRotation(route, p, euler));
    const shift = viewAspect > 1.25 ? HOME_SHIFT : 0;
    camera.filmOffset = -shift * (camera.getFilmWidth() / 2) * atHome * compose;
    camera.updateProjectionMatrix();
  };
  const stepAnchor = (dt: number) => {
    if (anchorT >= 1) return;
    anchorT = Math.min(1, anchorT + dt / ANCHOR_SECONDS);
    if (perched && !blink) placeCamera(pathPos);
    markActive();
  };

  /**
   * 進出碎念頁的轉場（跟手記的「飛過去」、關於頁的「往下墜」都不一樣）：整個畫面碎成越來越大的
   * 方塊（格子一級一級跳到 48 px），最粗的那一刻鏡頭直接換到下一頁的位置，再從大方塊收回細格子。
   * 一個動作做完，中間沒有一段慢慢滑過去的鏡頭——位置的改變藏在最粗的那一格裡。
   */
  type Stop = 'home' | 'moments' | 'out';
  const BLINK_SECONDS = 1.1;
  const MOSAIC = [1, 2, 3, 4, 5, 6, 8, 12, 16, 24, 32, 48];
  let blink: { t: number; from: Stop; to: Stop; landed: boolean } | null = null;
  const stopOf = (mode: SkyMode): Stop => (mode === 'home' ? 'home' : mode === 'moments' ? 'moments' : 'out');
  /** 鏡頭現在停在（或正要去）哪一種地方 */
  const stopNow = (): Stop => {
    if (blink) return blink.landed ? blink.to : blink.from;
    if (perched) return 'moments';
    if (travel?.kind === 'path') return travel.to === 1 ? 'out' : 'home';
    return pathPos === 1 ? 'out' : 'home';
  };
  /** 最粗的那一刻：直接換到下一頁的位置 */
  const land = (to: Stop) => {
    travel = null;
    skyFx.setFlight(0);
    travelDust.sprite.visible = false;
    perched = to === 'moments';
    pathPos = to === 'out' ? 1 : 0;
    if (to === 'out') route = wantRoute;
    homeLift = to === 'home' ? Math.min(1, scrollY / viewH) : 0;
    saturnVisible = to !== 'out';
    saturn?.shatter(to === 'out', true);
    if (saturn) saturn.group.visible = saturnOnScreen() && quality < 2;
    anchorFrom = null;
    anchorT = 1;
    placeCamera(pathPos);
    skyFx.jump();
  };
  const stepBlink = (dt: number) => {
    if (!blink) return;
    blink.t = Math.min(1, blink.t + dt / BLINK_SECONDS);
    if (!blink.landed && blink.t >= 0.5) {
      land(blink.to);
      blink.landed = true;
    }
    // 往最粗的那一刻是越來越快，收回來是越來越慢：最後幾級細格子停得久一點，像對焦
    const x = blink.landed ? (1 - blink.t) / 0.5 : blink.t / 0.5;
    const m = x * x;
    const side = blink.landed ? blink.to : blink.from;
    const base = side === 'moments' ? 5 : 1;
    const want = base + (48 - base) * m;
    skyFx.setMosaic(MOSAIC.filter((c) => c >= base && c <= want).at(-1) ?? base);
    const pix = side === 'moments' ? 1 : 0;
    skyFx.setPixel(pix + (1 - pix) * Math.min(1, m * 6));
    if (blink.t >= 1) {
      skyFx.setMosaic(null);
      skyFx.setPixel(blink.to === 'moments' ? 1 : 0);
      blink = null;
    }
    markActive();
  };

  // 近處的太空塵埃：只在飛行時看得到。背景的星都在一百單位外，鏡頭移動十幾個單位幾乎沒有視差，
  // 飛起來會很「乾」；這層離路線很近，飛過時從身邊掠過，才有速度感
  const travelDust = (() => {
    const N = 2200;
    const pos = new Float32Array(N * 3);
    const c = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      bez(Math.random() * 1.2 - 0.1, c, i % 2 ? 'fall' : 'away');
      pos.set(
        [c.x + (Math.random() - 0.5) * 16, c.y + (Math.random() - 0.5) * 10, c.z + (Math.random() - 0.5) * 8],
        i * 3,
      );
    }
    const amount = uniform(0);
    const mat = new THREE.PointsNodeMaterial();
    mat.positionNode = instancedBufferAttribute<'vec3'>(new THREE.InstancedBufferAttribute(pos, 3), 'vec3');
    const d = uv().sub(0.5).length().mul(2.0);
    mat.colorNode = vec3(0.85, 0.88, 1.0).mul(1.2);
    mat.opacityNode = smoothstep(1, 0.3, d).mul(amount);
    mat.mrtNode = mrt({ bloomIntensity: float(0.5) });
    mat.size = 0.035;
    mat.sizeAttenuation = true;
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;
    const sprite = new THREE.Sprite(mat);
    sprite.count = N;
    sprite.frustumCulled = false;
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, amount };
  })();

  const stepTravel = (dt: number) => {
    if (!travel) return;
    travel.t = Math.min(1, travel.t + dt / TRAVEL_SECONDS);
    const k = easeInOut(travel.t);
    if (travel.kind === 'path') {
      pathPos = travel.from + (travel.to - travel.from) * k;
      placeCamera(pathPos);
    } else {
      // 兩個「外面」之間：位置直線移過去、姿態球面內插
      poseAtEnd(travel.from, crossA);
      poseAtEnd(travel.to, crossB);
      camera.position.lerpVectors(crossA.pos, crossB.pos, k);
      camera.quaternion.slerpQuaternions(crossA.quat, crossB.quat, k);
      if (travel.t >= 1) route = travel.to;
    }
    // 速度（0–1）：拉成光線與塵埃都跟著速度走，起步與停下都是零，不會有突然的一閃。
    // 往下墜的路線，光線從畫面下方往上拉（星星往上掠過），不是從中央往外
    const speed = Math.sin(Math.PI * travel.t);
    const falling = travel.kind === 'path' ? route === 'fall' : travel.to === 'fall';
    skyFx.setFlight(speed, falling ? 'up' : 'out');
    travelDust.amount.value = speed;
    travelDust.sprite.visible = speed > 0.01;
    if (travel.t >= 1) {
      // 抵達外面：土星在鏡頭後方、看不到了，收起來省 GPU
      if (travel.kind === 'path' && travel.to === 1 && saturn) saturn.shatter(true, true);
      travel = null;
      skyFx.setFlight(0);
      travelDust.sprite.visible = false;
    }
    markActive();
  };
  /**
   * 關於頁：往下捲就是往下掉，整片星空跟著往上掠過（繞鏡頭的水平軸轉），捲得越快拖得越長。
   * 不做的話，墜落轉場一結束星星就停住了，只剩前景的星塵在動
   */
  let skyMode: SkyMode = 'default';
  let lastScrollAt = 0;
  let fallScroll: number | null = null;
  let fallSpeed = 0;
  const FALL_TURN = 0.00008; // 每捲一個像素，星空轉多少弧度
  const X_AXIS = new THREE.Vector3(1, 0, 0);
  const stepFall = (delta: number) => {
    if (skyMode !== 'about' || travel) {
      if (fallScroll !== null || fallSpeed > 0) skyFx.setDrift(0);
      fallScroll = null;
      fallSpeed = 0;
      return;
    }
    fallScroll ??= scrollY;
    const dy = scrollY - fallScroll;
    fallScroll = scrollY;
    if (dy !== 0) skyGroup.rotateOnWorldAxis(X_AXIS, dy * FALL_TURN);
    fallSpeed += (Math.abs(dy) / Math.max(delta, 1e-3) - fallSpeed) * Math.min(1, delta * 8);
    if (fallSpeed < 5) fallSpeed = 0;
    skyFx.setDrift(Math.min(1, fallSpeed / 2500));
  };

  const loop = (now: number) => {
    // ⚠ 跟 lastActive 比要用同一個時鐘：lastActive 是 performance.now()，而 rAF 的 now 是
    //   這一幀的時間戳，規格沒保證兩者在 worker 裡同步。now 落後的話「距上次活動」永遠小於門檻，
    //   就永遠不會進閒置。
    const wall = performance.now();
    const active = wall - lastActive < IDLE_AFTER_MS;
    // 碎念頁往下捲時背景跟著退暗，那段時間照螢幕更新率畫
    const perchScrolling = perched && wall - lastScrollAt < 300;
    const fullRate =
      hyperspace !== null || saturnZooming || travel !== null || blink !== null || anchorT < 1 || perchScrolling;
    const frameMs = fullRate ? 0 : active ? ACTIVE_FRAME_MS : IDLE_FRAME_MS;
    if (!pacer.shouldRender(now, frameMs)) return;
    // delta 是距離上一次「真的畫」的時間：跳幀不會讓動畫變慢；夾住是為了分頁切回時不暴衝
    const delta = lastRender < 0 ? 0.016 : Math.min((now - lastRender) / 1000, 0.05);
    lastRender = now;
    // 星軌那一頁只留繞天極的旋轉（理由見 skyFx 的 trailing）
    const spin = 1 - skyFx.trailing();
    for (const l of layers) {
      l.points.rotation.x += delta * l.cfg.rotX * spin;
      l.points.rotation.y += delta * l.cfg.rotY * spin;
    }

    // 開場：時間軸從第一幀算起
    let introAllowsZoom = true;
    if (hyperspace) {
      if (introStart < 0) introStart = now;
      const t = Math.min(now - introStart, init.introFreezeAt ?? Infinity);
      if (skipRequested) skippedAt ??= t;
      const frame = introFrame(t, skippedAt);
      hyperspace.update(frame, t, introPrev < 0 ? 0 : t - introPrev);
      introAllowsZoom = frame.saturnAnimate;
      sceneShown = frame.sceneOpacity > 0;
      for (const phase of phasesCrossed(introPrev, t, skippedAt)) init.onIntroPhase?.(phase);
      introPrev = t;
      markActive();
    }

    stepBlink(delta);
    stepAnchor(delta);
    stepTravel(delta);
    stepFall(delta);
    if (perched && scrollY !== placedScroll) placeCamera(pathPos);
    // 首頁構圖與捲動：開場播完才讓開；捲動的目標值平滑追上，不跟著滾輪一格一格跳
    const composeTarget = hyperspace ? 0 : 1;
    const liftTarget = Math.min(1, scrollY / viewH);
    if (compose !== composeTarget || Math.abs(homeLift - liftTarget) > 1e-4) {
      compose += (composeTarget - compose) * Math.min(1, delta * 2.5);
      if (Math.abs(compose - composeTarget) < 1e-3) compose = composeTarget;
      homeLift += (liftTarget - homeLift) * Math.min(1, delta * 5);
      if (Math.abs(homeLift - liftTarget) < 1e-4) homeLift = liftTarget;
      if (!travel) placeCamera(pathPos);
      markActive();
    }
    if (saturn && saturnOnScreen()) {
      const s = saturn.update(delta, scrollY, saturnAnimate && introAllowsZoom);
      saturnZooming = s.zooming;
      if (s.moving) markActive();
      saturn.group.visible = saturnOnScreen() && quality < 2;
    } else {
      saturnZooming = false;
    }
    // 天空效果要在畫主畫面之前推進：星軌的累積 pass 得先把這一幀的星星疊進去
    const sky = skyFx.update(delta);
    if (sky.busy) markActive();
    if (stagePipeline && !sceneShown) stagePipeline.render();
    else if (introPipeline) introPipeline.render();
    else pipeline.render();
    // 開場層已經完全淡出：換回主 pipeline（畫出來一模一樣），收掉開場的資源
    if (hyperspace && introPrev >= phaseTimes(skippedAt).done) finishIntro();
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
      // 開場期間不算：那幾秒多畫一層全螢幕的星芒，GPU 時間本來就高，而降級是永久的
      const tooSlow =
        hyperspace === null && (gpuMsPerFrame !== null ? gpuMsPerFrame > SLOW_GPU_MS : fps < LOW_FPS && active);
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

  return {
    backend,
    runner: {
      setSize(width, height) {
        markActive();
        camera.aspect = width / height;
        viewAspect = camera.aspect;
        viewH = Math.max(1, height);
        if (travel) camera.updateProjectionMatrix();
        else placeCamera(pathPos);
        renderer.setSize(width, height, false);
        hyperspace?.setSize(width, height, dprUsed);
        skyFx.setSize(width, height);
      },
      setSky(mode) {
        markActive();
        skyMode = mode;
        skyFx.setMode(mode);
        wantRoute = routeFor(mode);
        // 進出碎念頁：碎成大方塊、換位置、再收回來（見 blink）。飛到一半就換目的地的話，
        // 還沒換位置就直接改去新的地方；已經換過了就從現在的粗細再碎一次
        const from = stopNow();
        const to = stopOf(mode);
        if (
          transition === 'travel' &&
          saturnSettled &&
          saturn &&
          from !== to &&
          (from === 'moments' || to === 'moments')
        ) {
          if (blink && !blink.landed) blink.to = to;
          else blink = { t: blink ? 1 - blink.t : 0, from, to, landed: false };
          return;
        }
        // 已經在外面、換到另一種「外面」（手記 ↔ 關於）：直接移到另一條路線的終點
        if (transition === 'travel' && saturnSettled && mode !== 'home' && !travel && pathPos === 1) {
          if (route !== wantRoute) travel = { kind: 'cross', from: route, to: wantRoute, t: 0 };
        }
      },
      setScroll(y) {
        if (y !== scrollY) {
          markActive();
          lastScrollAt = performance.now();
        }
        scrollY = y;
      },
      setAnchor(a) {
        if (a && perched && !blink) {
          const now = viewAnchor();
          if (Math.abs(now.x - a.x) + Math.abs(now.y - a.y) + Math.abs(now.r - a.r) > 2) {
            anchorFrom = now;
            anchorT = 0;
          }
        }
        anchor = a;
        if (perched && !blink) placeCamera(pathPos);
        markActive();
      },
      setSaturn(visible, animate) {
        markActive();
        saturnAnimate = animate;
        // 碎念頁的轉場自己決定土星在不在（換位置的那一刻一起換），這裡不另外飛
        if (blink) return;
        saturnVisible = visible;
        if (saturn) {
          if (transition === 'travel') {
            const to = visible ? 0 : 1;
            // 兩個「外面」之間的移動做到一半就要回首頁：直接當作已經到了，從那條路線倒著飛回去
            if (travel?.kind === 'cross') {
              route = travel.to;
              travel = null;
            }
            const target = travel ? travel.to : pathPos;
            if (!saturnSettled) {
              // 剛載入：直接放在對應的位置，不飛（直接打開碎念頁的話，土星已經停在頁首、碎成像素）
              route = wantRoute;
              pathPos = to;
              perched = skyMode === 'moments';
              skyFx.setPixel(perched ? 1 : 0);
              placeCamera(to);
              saturn.shatter(!visible, true);
            } else if (to !== target) {
              // 從目前的位置（可能正飛到一半）出發，飛向另一端；從首頁出發時照目的地選路線
              if (visible) saturn.shatter(false, true);
              if (!visible && pathPos === 0) route = wantRoute;
              travel = { kind: 'path', from: pathPos, to, t: 0 };
            }
          } else {
            // 爆炸版（?transition=burst）：離開首頁時散成星塵、回來時聚回去；第一次（剛載入）直接到位
            saturn.shatter(!visible, !saturnSettled);
          }
          saturnSettled = true;
          // 最低品質下即使呼叫顯示也不開（土星最貴）
          saturn.group.visible = saturnOnScreen() && quality < 2;
        }
      },
      setRunning(running) {
        if (running) {
          lastRender = -1; // 暫停期間的時間不灌進 delta
          pacer.reset();
          markActive();
          void renderer.setAnimationLoop(loop);
        } else {
          void renderer.setAnimationLoop(null);
        }
      },
      skipIntro() {
        if (!hyperspace) return;
        if (introStart < 0) {
          // 還沒開始：直接不播，一個階段都不送（呼叫端已經自己收尾）
          finishIntro();
          return;
        }
        skipRequested = true;
      },
      dispose() {
        void renderer.setAnimationLoop(null);
        finishIntro();
        skyFx.dispose();
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
