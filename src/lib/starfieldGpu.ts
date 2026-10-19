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
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

export const STAR_COUNT = 26000; // 14k 主層 + 12k 星系層（≈舊棧全部點數 27.1k；WebGPU 下加星幾乎免費）

export interface StarfieldRunner {
  setSize(width: number, height: number): void;
  setRunning(running: boolean): void;
  /** 捲動位置（土星的捲動旋轉；worker 無 window，由主執行緒轉發） */
  setScroll(y: number): void;
  /** 土星顯示（僅首頁）與 intro 縮放動畫 */
  setSaturn(visible: boolean, animate: boolean): void;
  dispose(): void;
}

export interface StarfieldInit {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width: number;
  height: number;
  dpr: number;
  /**
   * 每秒回報一次渲染迴圈 fps / 平均幀時 / 目前品質等級 / 每幀 GPU 時間（?debug=perf 用）。
   * gpuMs 是 GPU 真的花在這一幀的時間（timestamp query）；瀏覽器不給 timestamp 時是 null。
   */
  onPerf?: (fps: number, avgMs: number, quality?: number, gpuMs?: number | null) => void;
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
  /** 回傳 true＝還在追趕目標（intro 縮放或捲動旋轉的 lerp 沒收斂），這段時間要用全速畫 */
  update(dt: number, scrollY: number, animate: boolean): boolean;
}

/// 土星——對齊舊 Saturn3D：球(r1)+環(1.5-2.2, 傾 π/2.5)+群組傾 π/24+兩衛星，
/// 自轉 0.05 rad/s + 捲動旋轉 scrollY*0.001（lerp 0.05）+ intro 縮放（lerp 0.08）。
/// 環 hover 效果不移植：舊 canvas pointerEvents:none，事件從未觸發過（死碼）。
async function buildSaturn(): Promise<SaturnRig> {
  const [planetMap, ringsMap] = await Promise.all([
    loadTexture('/textures/saturn_texture.webp'),
    loadTexture('/textures/saturn_rings_texture.webp'),
  ]);
  const group = new THREE.Group();
  group.rotation.z = Math.PI / 24;

  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 32),
    new THREE.MeshStandardMaterial({ map: planetMap, roughness: 0.6, metalness: 0.1 }),
  );
  const ringHolder = new THREE.Group();
  ringHolder.rotation.x = Math.PI / 2.5;
  const rings = new THREE.Mesh(
    new THREE.RingGeometry(1.5, 2.2, 64),
    new THREE.MeshStandardMaterial({
      map: ringsMap,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      color: '#e7c8a0',
      roughness: 0.9,
      metalness: 0.1,
    }),
  );
  ringHolder.add(rings);
  group.add(planet, ringHolder);

  const satellites = [
    { baseR: 2.5, y: 0.1, speed: 0.3, size: 0.04, angle: Math.random() * Math.PI * 2 },
    { baseR: 3, y: -0.15, speed: 0.2, size: 0.06, angle: Math.random() * Math.PI * 2 },
  ].map((cfg) => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(cfg.size, 8, 8),
      new THREE.MeshStandardMaterial({ color: '#cccccc', emissive: '#333333', roughness: 0.5, metalness: 0.5 }),
    );
    mesh.position.set(cfg.baseR, cfg.y, 0);
    group.add(mesh);
    return { mesh, cfg };
  });

  let autoRot = 0;
  // 捲動帶動的旋轉單獨 lerp：自轉是等速的，不需要 lerp；放進同一個 lerp 的話目標每幀都在前進，
  // lerp 永遠收斂不了，「還在動」就永遠是真的——閒置降幀因此一直沒生效（實測卡在 60fps）。
  let currentScrollRot = 0;
  let currentScale = 0.0001;
  return {
    group,
    update(dt, scrollY, animate) {
      autoRot += 0.05 * dt;
      const targetScrollRot = scrollY * 0.001;
      currentScrollRot = THREE.MathUtils.lerp(currentScrollRot, targetScrollRot, 0.05);
      group.rotation.y = currentScrollRot + autoRot;
      // intro 縮放：未 animate 用極小 epsilon（非 0）讓管線先編譯好，explosion 時只是放大
      const targetScale = animate ? 1 : 0.0001;
      currentScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.08);
      group.scale.setScalar(currentScale);
      for (const s of satellites) {
        s.cfg.angle += s.cfg.speed * dt;
        s.mesh.position.set(s.cfg.baseR * Math.cos(s.cfg.angle), s.cfg.y, s.cfg.baseR * Math.sin(s.cfg.angle));
      }
      return Math.abs(targetScrollRot - currentScrollRot) > 0.002 || Math.abs(targetScale - currentScale) > 0.005;
    },
  };
}

export async function createStarfieldRunner(
  init: StarfieldInit,
): Promise<{ runner: StarfieldRunner; backend: 'WebGPU' | 'WebGL2' }> {
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
  for (const l of layers) scene.add(l.points);

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
    saturn = await buildSaturn();
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
  const pipeline = new THREE.RenderPipeline(renderer, vec4(combined.rgb, scenePassColor.a));

  // ── 渲染迴圈 ──────────────────────────────────────────────────
  //
  // 閒置時降到 30fps：星空的轉速是 0.01～0.02 rad/s、土星自轉 0.05 rad/s，30fps 跟 60fps 看不出差別，
  // 但 GPU 的工作量減半（筆電的風扇與電池差很多）。
  // 有「動作」的時候（捲動、改尺寸、intro、土星的 lerp 還沒收斂）照常全速，捲動跟著土星轉不會頓。
  // rAF 還是每個 vsync 都會進來，只是閒置時隔一幀才畫——跳過的那一幀只花幾微秒。
  const IDLE_AFTER_MS = 1500;
  const IDLE_FRAME_MS = 1000 / 30;
  let lastActive = 0;
  const markActive = () => {
    lastActive = performance.now();
  };
  markActive();
  let lastRender = -1;
  let frames = 0;
  let acc = 0;

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
    if (saturn) saturn.group.visible = saturnVisible && quality < 2;
  };

  const loop = (now: number) => {
    const active = now - lastActive < IDLE_AFTER_MS;
    if (!active && lastRender >= 0 && now - lastRender < IDLE_FRAME_MS - 2) return;
    // delta 是距離上一次「真的畫」的時間：跳幀不會讓動畫變慢；夾住是為了分頁切回時不暴衝
    const delta = lastRender < 0 ? 0.016 : Math.min((now - lastRender) / 1000, 0.05);
    lastRender = now;
    for (const l of layers) {
      l.points.rotation.x += delta * l.cfg.rotX;
      l.points.rotation.y += delta * l.cfg.rotY;
    }
    if (saturn && saturnVisible && saturn.update(delta, scrollY, saturnAnimate)) markActive();
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
      init.onPerf?.(fps, (acc / frames) * 1000, quality, gpuMsPerFrame);
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
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      },
      setScroll(y) {
        if (y !== scrollY) markActive();
        scrollY = y;
      },
      setSaturn(visible, animate) {
        markActive();
        saturnVisible = visible;
        saturnAnimate = animate;
        // 最低品質下即使呼叫顯示也不開（土星最貴）
        if (saturn) saturn.group.visible = visible && quality < 2;
      },
      setRunning(running) {
        if (running) {
          lastRender = -1; // 暫停期間的時間不灌進 delta
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
