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
  vec3,
  vec4,
  uniform,
  dot,
  normalize,
  max,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { createFramePacer } from './framePacer';
import { inspectWebGL } from './webglRenderer';
import type { SatelliteScreen } from '@/store/homeOrbit';

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

export interface StarfieldRunner {
  setSize(width: number, height: number): void;
  setRunning(running: boolean): void;
  /** 捲動位置（土星的捲動旋轉；worker 無 window，由主執行緒轉發） */
  setScroll(y: number): void;
  /** 土星顯示（僅首頁）；animate 為 false 時收成一點，true 時從一點撐開（換頁的收與長） */
  setSaturn(visible: boolean, animate: boolean): void;
  /** 首頁衛星的亮度（見 store/homeOrbit） */
  setSatelliteGlow(glow: number[]): void;
  dispose(): void;
}

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
   * 土星顯示時，每畫一幀回報一次衛星在畫面上的位置（首頁的字跟著它走，見 store/homeOrbit）。
   * 土星收起來時送一次空陣列。
   */
  onSatellites?: (positions: SatelliteScreen[]) => void;
  /** 手機：星星只畫三分之一左右（手機只在首頁跑 3D，主角是土星與衛星） */
  lite?: boolean;
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
  return sprite;
}

interface SaturnRig {
  group: THREE.Group;
  /**
   * moving：還在追趕目標（收與長的縮放、捲動旋轉、衛星的亮度沒收斂），這段時間不進閒置降幀。
   * zooming：收與長的縮放還沒收斂——這段要跟著螢幕更新率畫，不受 60fps 上限限制。
   */
  update(dt: number, scrollY: number, animate: boolean): { moving: boolean; zooming: boolean };
  /** 視窗的長寬比：窄的視窗要把整組縮小，最外圈的軌道才放得下 */
  setAspect(aspect: number): void;
  /** 每顆衛星該有多亮（0 到 1），實際亮度會慢慢靠過去 */
  setGlow(glow: number[]): void;
  /** 衛星在畫面上的位置（CSS 像素），首頁的字跟著它走 */
  project(camera: THREE.Camera, width: number, height: number): SatelliteScreen[];
  /** 縮回一點：下一次顯示時就從這一點撐開 */
  collapse(): void;
}

/**
 * 「每幀往目標靠近 rate」換算成跟幀率無關的係數（rate 是以 60fps 為準的值）。
 * 直接每幀乘 rate 的話，同一段動畫在 180Hz 上會快 3 倍。
 */
const lerpFactor = (rate: number, dt: number) => 1 - Math.pow(1 - rate, dt * 60);

/** 俯角與側傾，跟提案的示意一樣：從上方 24° 往下看，整組往右下斜 11° */
const TILT = 0.42;
const ROLL = -0.2;
/** 墨色（--paper #f1ece3）。three 的 Color 會自己換成線性空間 */
const INK = new THREE.Color('#f1ece3');
/** 紙色（--ground #0a0a0c）：擋住背面那顆球的顏色，要跟頁面底色一樣才看不出它在那裡 */
const GROUND = new THREE.Color('#0a0a0c');
const PLANET_POINTS = 2400;
/** 環：一圈一條線，[半徑, 不透明度]，跟提案的示意一樣。1.88 到 2.02 之間空著，是卡西尼縫 */
const RINGS: [number, number][] = [
  [1.32, 0.18],
  [1.4, 0.24],
  [1.5, 0.34],
  [1.6, 0.5],
  [1.7, 0.62],
  [1.8, 0.58],
  [1.88, 0.42],
  [2.02, 0.3],
  [2.1, 0.26],
  [2.2, 0.16],
];

/** 土星那層的鏡頭：視角 8°，放在讓畫面半高在 z=0 是 3.84 個單位的距離（見 createStarfieldRunner） */
const SATURN_FOV = 8;
const SATURN_VIEW_HALF = 3.84;
const SATURN_CAMERA_Z = SATURN_VIEW_HALF / Math.tan(THREE.MathUtils.degToRad(SATURN_FOV / 2));
/** 琥珀（--amber）：靠近的那顆衛星 */
const AMBER = new THREE.Color('#e9c17a');
/** 五顆衛星的軌道半徑（星球半徑是 1），由內到外對應首頁的五個分區（data/siteSections） */
const ORBITS = [2.9, 3.55, 4.25, 4.95, 5.7];
/**
 * 整組的大小：鏡頭在 z=5、視角 75°，畫面半高是 3.84 個單位。0.63 讓星球半徑約是畫面高度的 8%，
 * 最外圈軌道半徑 5.7 × 0.63 ≈ 3.6，寬螢幕放得下；窄的視窗照長寬比再縮
 */
const BASE_SCALE = 0.63;
const fitScale = (aspect: number) => Math.min(BASE_SCALE, 0.6 * aspect);

/// 土星（2026-10 翻新的 C 畫法）：點的星球、線的環，外面五條軌道各有一顆衛星。
///
/// 星球是球面上均勻鋪開的點（費波那契球面），亮暗跟著太陽：迎光的那一面亮、背光的暗。
/// 背面的點用一顆略小、跟紙同色的實心球擋掉——不然整顆球像透明的網子，而且球後面的星星、
/// 環與軌道的背段、轉到後面的衛星都會透出來。環與軌道是 1px 的線（WebGPU 的線本來就只有 1px，
/// 剛好是要的樣子）。
///
/// 只有星球繞自己的軸自轉（0.05 rad/s，捲動再多轉一點）；環與軌道的平面固定不動，
/// 不然衛星的軌道會跟著晃。換頁時整組從一點撐開、或收回一點（lerp 0.08）。
function buildSaturn(sunWorld: THREE.Vector3): SaturnRig {
  // 外層側傾、內層俯角：跟提案的投影同一個順序（先自轉、再俯、再側傾）。
  // 環與軌道都在內層的水平面（y = 0）上，星球繞內層的 y 軸自轉，軸自然垂直於環
  const group = new THREE.Group();
  group.rotation.z = ROLL;
  const tilted = new THREE.Group();
  tilted.rotation.x = TILT;
  const body = new THREE.Group();
  tilted.add(body);
  group.add(tilted);

  // 星球的點：位置就是單位球面上的方向，亮度用它跟太陽方向的夾角算
  const sunInPlanet = uniform(new THREE.Vector3());
  const positions = new Float32Array(PLANET_POINTS * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  // 每個點在原位附近隨機挪一點：太規則的點陣跟螢幕的像素格子會疊出斜的摩爾紋
  const jitter = 0.35 * Math.sqrt((4 * Math.PI) / PLANET_POINTS);
  for (let i = 0; i < PLANET_POINTS; i++) {
    const y = 1 - (i / (PLANET_POINTS - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const v = new THREE.Vector3(Math.cos(golden * i) * r, y, Math.sin(golden * i) * r);
    v.x += (Math.random() - 0.5) * jitter;
    v.y += (Math.random() - 0.5) * jitter;
    v.z += (Math.random() - 0.5) * jitter;
    v.normalize();
    positions.set([v.x, v.y, v.z], i * 3);
  }
  const dotMat = new THREE.PointsNodeMaterial();
  const at = instancedBufferAttribute<'vec3'>(new THREE.InstancedBufferAttribute(positions, 3), 'vec3');
  dotMat.positionNode = at;
  const lit = smoothstep(-0.25, 0.7, dot(normalize(at), normalize(sunInPlanet)));
  dotMat.colorNode = vec3(INK.r, INK.g, INK.b);
  const soft = smoothstep(1.0, 0.45, uv().sub(0.5).length().mul(2.0));
  // 雲帶：沿緯度一圈一圈的明暗，很淡，只是讓它看得出是土星
  const bands = sin(at.y.mul(13))
    .mul(0.14)
    .add(sin(at.y.mul(31)).mul(0.06))
    .add(0.8);
  dotMat.opacityNode = soft.mul(mix(float(0.14), float(1), lit)).mul(bands);
  // 點的大小只除以離鏡頭的距離、不管視角：土星那層的鏡頭在 z ≈ 55（星空的鏡頭在 z = 5），
  // 所以照距離比例放大回來（衛星用的 SpriteNodeMaterial 會算進視角，不用補）
  dotMat.size = 0.026 * (SATURN_CAMERA_Z / 5);
  dotMat.sizeAttenuation = true;
  dotMat.transparent = true;
  dotMat.depthWrite = false;
  const dots = new THREE.Sprite(dotMat);
  dots.count = PLANET_POINTS;

  // 擋背面的球：比點略小，畫成紙色。不透明物件先畫，點、環、軌道的背段與後面的衛星被它的深度擋掉
  const occluder = new THREE.Mesh(
    new THREE.SphereGeometry(0.985, 48, 32),
    new THREE.MeshBasicNodeMaterial({ color: GROUND }),
  );
  body.add(occluder, dots);

  // 環與軌道在同一個平面上，這個平面不轉
  const plane = new THREE.Group();
  tilted.add(plane);
  // WebGPU 的渲染器不支援 LineLoop：用 Line，最後一點回到起點把圈閉起來
  const circle = (radius: number, opacity: number) => {
    const material = new THREE.LineBasicNodeMaterial({ color: INK, transparent: true, opacity, depthWrite: false });
    const points = Array.from({ length: 257 }, (_, k) => {
      const a = (k / 256) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    });
    plane.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
    return material;
  };
  for (const [radius, alpha] of RINGS) circle(radius, alpha);

  // 軌道與衛星。衛星是一個實心的小點，亮起來時變琥珀色、外面多一圈光暈
  const ORBIT_DIM = 0.09;
  const orbits = ORBITS.map((r) => circle(r, ORBIT_DIM));
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
    plane.add(sprite);
    // 起始角度錯開，越外圈轉得越慢（克卜勒的味道就好，不必真的照比例）
    return { sprite, g, r, phase: 0.7 + i * 1.37 };
  });
  const syncSun = () => {
    group.updateWorldMatrix(true, true);
    body.worldToLocal(sunInPlanet.value.copy(sunWorld));
  };

  let clock = 0;
  let autoRot = 0;
  // 捲動帶動的旋轉單獨 lerp：自轉是等速的，不需要 lerp；放進同一個 lerp 的話目標每幀都在前進，
  // lerp 永遠收斂不了，「還在動」就永遠是真的——閒置降幀因此一直沒生效（實測卡在 60fps）。
  let currentScrollRot = 0;
  let currentScale = 0.0001;
  let fullScale = BASE_SCALE;
  const v = new THREE.Vector3();
  const center = new THREE.Vector3();
  const edge = new THREE.Vector3();
  return {
    group,
    update(dt, scrollY, animate) {
      clock += dt;
      autoRot += 0.05 * dt;
      const targetScrollRot = scrollY * 0.001;
      currentScrollRot = THREE.MathUtils.lerp(currentScrollRot, targetScrollRot, lerpFactor(0.05, dt));
      body.rotation.y = currentScrollRot + autoRot;
      // 收與長：收的時候縮到極小（非 0，管線才不會重編），長的時候撐回原尺寸
      const targetScale = animate ? fullScale : 0.0001;
      currentScale = THREE.MathUtils.lerp(currentScale, targetScale, lerpFactor(0.08, dt));
      group.scale.setScalar(currentScale);
      let glowing = false;
      for (const [i, s] of satellites.entries()) {
        const a = s.phase + clock * (0.16 / Math.sqrt(s.r));
        s.sprite.position.set(Math.cos(a) * s.r, 0, Math.sin(a) * s.r);
        const target = glowTarget[i] ?? 0;
        s.g.value += (target - s.g.value) * Math.min(1, dt * 8);
        if (Math.abs(target - s.g.value) > 0.01) glowing = true;
        orbits[i].opacity = ORBIT_DIM + s.g.value * 0.32;
      }
      syncSun();
      const zooming = Math.abs(targetScale - currentScale) > 0.005 * fullScale;
      return { moving: zooming || glowing || Math.abs(targetScrollRot - currentScrollRot) > 0.002, zooming };
    },
    setAspect(aspect) {
      fullScale = fitScale(aspect);
      // 直的畫面把土星往上提一點（提案是在高度的 46%），下面留給手機的手指
      group.position.y = aspect < 1 ? 0.31 : 0;
    },
    setGlow(glow) {
      for (let i = 0; i < glowTarget.length; i++) glowTarget[i] = glow[i] ?? 0;
    },
    collapse() {
      currentScale = 0.0001;
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
      return satellites.map((s) => {
        s.sprite.getWorldPosition(v);
        const behind = camera.position.distanceTo(v) > camDist;
        const [x, y] = toScreen(v);
        return { x, y, hidden: currentScale < 0.05 * fullScale || (behind && Math.hypot(x - cx, y - cy) < radius) };
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
): Promise<{ runner: StarfieldRunner; backend: 'WebGPU' | 'WebGL2' }> {
  if (await softwareRendering()) throw new Error('沒有硬體加速（軟體渲染），不建 3D');
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
  const saturn = buildSaturn(new THREE.Vector3(-0.55, 0.5, 0.67).multiplyScalar(10));
  saturn.setAspect(aspect0);
  let viewW = init.width;
  let viewH = init.height;
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
  const scenePass = pass(scene, camera, { samples: msaa });
  scenePass.setMRT(mrt({ output, bloomIntensity: float(0) })); // 全域預設：不進 bloom
  const scenePassColor = scenePass.getTextureNode('output');
  const bloomMask = scenePass.getTextureNode('bloomIntensity');
  const bloomPass = bloom(scenePassColor.mul(bloomMask), 0.35, 0.35, 0.5); // strength / radius / threshold
  const combined = scenePassColor.add(bloomPass);
  // 土星那層疊在星空上：它的顏色已經乘過自己的透明度（一般混合畫在透明底上就是這樣），
  // 所以是「星空 × (1 − 土星的 alpha) + 土星」。擋背面的那顆紙色球 alpha 是 1，球後面的星星就被蓋掉。
  // 輸出保留 alpha：canvas 透明疊在頁面的黑紙上，alpha 全變 1 的話底色會被蓋成純黑
  const saturnPass = pass(saturnScene, saturnCam, { samples: msaa });
  const sat = saturnPass.getTextureNode('output');
  const sceneOut = vec4(combined.rgb.mul(float(1).sub(sat.a)).add(sat.rgb), max(scenePassColor.a, sat.a));
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
  pipeline.render();
  saturn.group.visible = false;

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

    if (saturnVisible) {
      const s = saturn.update(delta, scrollY, saturnAnimate);
      saturnZooming = s.zooming;
      if (s.moving) markActive();
      init.onSatellites?.(saturn.project(saturnCam, viewW, viewH));
    }
    pipeline.render();
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

  return {
    backend,
    runner: {
      setSize(width, height) {
        markActive();
        viewW = width;
        viewH = height;
        saturn.setAspect(width / height);
        camera.aspect = width / height;
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
        if (saturnVisible && !visible) init.onSatellites?.([]);
        // 每次重新出現都從一點撐開（換頁轉場的「長」）
        if (!saturnVisible && visible) saturn.collapse();
        saturnVisible = visible;
        saturnAnimate = animate;
        // 最低品質下即使呼叫顯示也不開（土星最貴）
        saturn.group.visible = visible && quality < 2;
      },
      setSatelliteGlow(glow) {
        markActive();
        saturn.setGlow(glow);
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
