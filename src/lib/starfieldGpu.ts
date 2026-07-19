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
import { pass, instancedBufferAttribute, uv, time, sin, mix, smoothstep, vec3 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

export const STAR_COUNT = 26000; // 14k 主層 + 12k 星系層（≈舊棧全部點數 27.1k；WebGPU 下加星幾乎免費）

export interface StarfieldRunner {
  setSize(width: number, height: number): void;
  setRunning(running: boolean): void;
  dispose(): void;
}

export interface StarfieldInit {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width: number;
  height: number;
  dpr: number;
  /** 每秒回報一次渲染迴圈 fps / 平均幀時（?debug=perf 用） */
  onPerf?: (fps: number, avgMs: number) => void;
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
    positions.set([
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi),
    ], i * 3);
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
  mat.colorNode = mix(vec3(1, 1, 1), starColor, 0.35).mul(1.35); // >1 的 HDR 餘量餵 bloom（HalfFloat 管線）

  // 碟形柔光輪廓（對齊 drei Stars 的 fade 觀感）：d<0.55 全亮平台、0.55→1 柔滑歸零。
  // Sprite 的 quad geometry 有 uv attribute → uv() 兩個 backend 都有值。
  const d = uv().sub(0.5).length().mul(2.0); // 0 = 中心, 1 = 邊
  const falloff = smoothstep(1.0, 0.55, d);
  // 閃爍：溫和呼吸（振幅 ±14%，相位/速率 per-star）——不會像亞像素 pop 那樣硬閃
  const phase = instancedBufferAttribute<'float'>(new THREE.InstancedBufferAttribute(phases, 1), 'float');
  const twinkle = sin(time.mul(phase.mul(0.15).add(0.6)).add(phase)).mul(0.14).add(0.86);
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

export async function createStarfieldRunner(init: StarfieldInit): Promise<{ runner: StarfieldRunner; backend: 'WebGPU' | 'WebGL2' }> {
  const renderer = new THREE.WebGPURenderer({
    // 型別只收 HTMLCanvasElement；OffscreenCanvas 在 runtime 相容（官方 worker 範例同款用法）
    canvas: init.canvas as HTMLCanvasElement,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(init.dpr, 2));
  renderer.setSize(init.width, init.height, false);
  await renderer.init();
  const backend: 'WebGPU' | 'WebGL2' =
    (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true ? 'WebGPU' : 'WebGL2';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, init.width / init.height, 0.1, 400);
  camera.position.set(0, 0, 5);

  const layers = LAYERS.map((cfg) => ({ points: buildStarLayer(cfg), cfg }));
  for (const l of layers) scene.add(l.points);

  // TSL bloom：scenePass 顏色 + bloom(顏色) 疊加（BloomNode 官方文件用法）
  const scenePass = pass(scene, camera);
  const scenePassColor = scenePass.getTextureNode('output');
  const bloomPass = bloom(scenePassColor, 0.8, 0.55, 0.5); // strength / radius / threshold——threshold 壓灰底霧，只讓亮星發暈
  const pipeline = new THREE.RenderPipeline(renderer, scenePassColor.add(bloomPass));

  // 渲染迴圈：delta 夾住（分頁切回不暴衝，同舊棧慣例）+ perf 累積
  let last = -1;
  let frames = 0;
  let acc = 0;
  const loop = (now: number) => {
    const delta = last < 0 ? 0.016 : Math.min((now - last) / 1000, 0.05);
    last = now;
    for (const l of layers) {
      l.points.rotation.x += delta * l.cfg.rotX;
      l.points.rotation.y += delta * l.cfg.rotY;
    }
    pipeline.render();
    frames += 1;
    acc += delta;
    if (acc >= 1) {
      init.onPerf?.(frames / acc, (acc / frames) * 1000);
      frames = 0;
      acc = 0;
    }
  };
  void renderer.setAnimationLoop(loop);

  return {
    backend,
    runner: {
      setSize(width, height) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
      },
      setRunning(running) {
        if (running) {
          last = -1; // 暫停期間的時間不灌進 delta
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
