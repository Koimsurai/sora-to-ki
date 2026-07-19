// WebGPU 星空 PoC（?webgpu=1 旗標，lazy chunk，訪客零影響）。
//
// 驗證三件事（WebGPU 重寫的地基，見 vault「web 3D 背景 — WebGPU 重寫決策」）：
//   1. R3F v9 async gl → three/webgpu 的 WebGPURenderer（await init）能在我們的棧上跑
//   2. 無 WebGPU 的環境（如本機 server headless）自動落 WebGL2 backend——同一份 code
//   3. TSL node material 渲染 18k 點。關鍵：WebGPU 的 point primitive 只有 1px，
//      three 的 PointsNodeMaterial 因此實作為 SpriteNodeMaterial 子類（實例化 billboard quad）
//      ——正是驗收要求的 coverage-independent 星星架構（MSAA 0 不掉星）的平台基礎。
//
// 注意：three/webgpu 是完整的另一份 three build，與 classic 'three'（fiber/drei 用）並存
// 會讓 bundle 變胖——PoC 期間可接受（lazy chunk 只有帶旗標才下載）；重寫定版時
// worker 端整條管線只吃 three/webgpu，classic 版隨舊棧退役。
import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { color } from 'three/tsl';

const POC_STAR_COUNT = 18000;

function SpinningStars() {
  const ref = useRef<THREE.Points | null>(null);

  const points = useMemo(() => {
    const positions = new Float32Array(POC_STAR_COUNT * 3);
    for (let i = 0; i < POC_STAR_COUNT; i++) {
      // 球殼分佈（跟現行星空同構：radius 60~100）
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

    const mat = new THREE.PointsNodeMaterial();
    mat.colorNode = color(0xffffff); // TSL 節點路徑驗證（重寫時換成 per-star 閃爍/色溫）
    mat.size = 1.6;
    mat.sizeAttenuation = true;
    mat.transparent = true;
    mat.depthWrite = false;
    mat.blending = THREE.AdditiveBlending;
    return new THREE.Points(geo, mat);
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    if (ref.current) {
      ref.current.rotation.x += dt * 0.01;
      ref.current.rotation.y += dt * 0.02;
    }
  });

  return <primitive ref={ref} object={points} />;
}

export default function StarfieldGpu() {
  const [backend, setBackend] = useState<string>('初始化中…');

  return (
    <>
      <Canvas
        camera={{ position: [0, 0, 5] }}
        dpr={[1, 2]}
        // R3F v9 async gl：WebGPURenderer 需要 await init()。無 WebGPU 環境由 three
        // 自動落 WebGL2 backend（forceWebGL 預設 false = 自動偵測）。
        gl={async (glProps) => {
          const renderer = new THREE.WebGPURenderer({
            ...(glProps as THREE.WebGPURendererParameters),
            antialias: true,
          });
          await renderer.init();
          return renderer;
        }}
        onCreated={({ gl }) => {
          const r = gl as unknown as THREE.WebGPURenderer;
          const isWebGPU = (r.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
          setBackend(isWebGPU ? 'WebGPU' : 'WebGL2 fallback');
        }}
        style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}
      >
        <SpinningStars />
      </Canvas>
      {/* backend 徽章：自證跑在哪條 backend 上 */}
      <div style={{
        position: 'fixed', bottom: 8, right: 8, zIndex: 99999, padding: '6px 10px',
        background: 'rgba(0,0,0,.75)', color: backend === 'WebGPU' ? '#7fdcff' : '#ffd27f',
        font: '12px/1.5 monospace', borderRadius: 6, pointerEvents: 'none',
      }}>
        StarfieldGpu PoC · {backend} · {POC_STAR_COUNT.toLocaleString()} pts
      </div>
    </>
  );
}
