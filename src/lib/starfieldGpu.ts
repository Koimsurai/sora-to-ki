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
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { color } from 'three/tsl';

export const STAR_COUNT = 18000;

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

function buildStars(): THREE.Points {
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    // 球殼分佈（radius 60~100，跟現行星空同構）
    const r = 60 + Math.random() * 40;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions.set([
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi),
    ], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // WebGPU 管線的 PointsNodeMaterial = SpriteNodeMaterial 子類（實例化 billboard quad）
  // → 星星 footprint 與 MSAA 無關，不會像舊棧亞像素點那樣被 rasterizer 丟掉（驗收核心）。
  const mat = new THREE.PointsNodeMaterial();
  mat.colorNode = color(0xffffff);
  mat.size = 1.6;
  mat.sizeAttenuation = true;
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;
  return new THREE.Points(geo, mat);
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

  const stars = buildStars();
  scene.add(stars);

  // TSL bloom：scenePass 顏色 + bloom(顏色) 疊加（BloomNode 官方文件用法）
  const scenePass = pass(scene, camera);
  const scenePassColor = scenePass.getTextureNode('output');
  const bloomPass = bloom(scenePassColor, 0.9, 0.4, 0.25); // strength / radius / threshold
  const pipeline = new THREE.RenderPipeline(renderer, scenePassColor.add(bloomPass));

  // 渲染迴圈：delta 夾住（分頁切回不暴衝，同舊棧慣例）+ perf 累積
  let last = -1;
  let frames = 0;
  let acc = 0;
  const loop = (time: number) => {
    const delta = last < 0 ? 0.016 : Math.min((time - last) / 1000, 0.05);
    last = time;
    stars.rotation.x += delta * 0.01;
    stars.rotation.y += delta * 0.02;
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
        stars.geometry.dispose();
        (stars.material as THREE.Material).dispose();
        void renderer.dispose();
      },
    },
  };
}
