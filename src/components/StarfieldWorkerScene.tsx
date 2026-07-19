// 自包含星空場景 —— 同時用於 OffscreenCanvas worker（spaceWorker）與不支援時的主執行緒 fallback。
// 規則：不可碰 window / document / React context（worker 裡都沒有）。
// 內容對齊原 SpaceBackdrop 的星空（兩層 drei Stars + 太空碎片 + 閃爍星），
// 唯一差別：拿掉 window.scrollY 的捲動加速（worker 無 window），改固定轉速。
import { useRef, useMemo, useState, useEffect, Suspense } from 'react';
import { Stars, Points, PointMaterial } from '@react-three/drei';
import { EffectComposer, Bloom, SMAA } from '@react-three/postprocessing';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import TwinklingStars from './TwinklingStars';
import { DEFAULT_KNOBS, type PerfKnobs } from '../lib/perfKnobs';

function Galaxy() {
  const mainRef = useRef<THREE.Points>(null);
  const galaxyRef = useRef<THREE.Points>(null);
  useFrame((_, delta) => {
    // 夾住 delta：worker 切回前景時 clock 凍結期間的時間會灌進第一幀，不夾星空會瞬間跳轉。
    const dt = Math.min(delta, 0.05);
    if (mainRef.current) {
      mainRef.current.rotation.x += dt * 0.01;
      mainRef.current.rotation.y += dt * 0.02;
    }
    if (galaxyRef.current) {
      galaxyRef.current.rotation.x += dt * 0.008;
      galaxyRef.current.rotation.y += dt * 0.015;
    }
  });
  return (
    <Suspense fallback={null}>
      <Stars ref={mainRef} radius={100} depth={50} count={10000} factor={3.5} saturation={0.1} fade speed={0.5} />
      {/* drei <Stars> 只 render 內部 <points>、不轉發 rotation，故原本的 rotation prop 一直是 no-op；
          遷移階段維持現狀。若日後想真的傾斜這層，需用 <group rotation={[0, Math.PI/3, Math.PI/5]}> 包起來。 */}
      <Stars ref={galaxyRef} radius={90} depth={20} count={8000} factor={5} saturation={0.2} fade speed={0.3} />
    </Suspense>
  );
}

function SpaceDebris({ count = 300 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const particlesPosition = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const distance = 100;
    for (let i = 0; i < count; i++) {
      const theta = THREE.MathUtils.randFloatSpread(360);
      const phi = THREE.MathUtils.randFloatSpread(360);
      const r = THREE.MathUtils.randFloat(distance * 0.5, distance);
      positions.set([
        r * Math.sin(theta) * Math.cos(phi),
        r * Math.sin(theta) * Math.sin(phi),
        r * Math.cos(theta) + THREE.MathUtils.randFloatSpread(20),
      ], i * 3);
    }
    return positions;
  }, [count]);

  const particleData = useMemo(() =>
    Array.from({ length: count }, () => ({
      velocity: new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(0.02),
        THREE.MathUtils.randFloatSpread(0.02),
        THREE.MathUtils.randFloatSpread(0.02),
      ),
    })), [count]);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    const dt = Math.min(delta, 0.05); // 夾住 delta，避免切回前景時碎片一次噴飛
    const positions = pointsRef.current.geometry.attributes.position.array;
    const distance = 100;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] += particleData[i].velocity.x * dt * 50;
      positions[i3 + 1] += particleData[i].velocity.y * dt * 50;
      positions[i3 + 2] += particleData[i].velocity.z * dt * 50;
      if (Math.abs(positions[i3]) > distance) positions[i3] *= -0.99;
      if (Math.abs(positions[i3 + 1]) > distance) positions[i3 + 1] *= -0.99;
      if (positions[i3 + 2] > distance * 1.5) positions[i3 + 2] = -distance * 1.5;
      if (positions[i3 + 2] < -distance * 1.5) positions[i3 + 2] = distance * 1.5;
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <Points ref={pointsRef} positions={particlesPosition} stride={3} frustumCulled={false}>
      <PointMaterial transparent color="#555555" size={0.08} sizeAttenuation
        depthWrite={false} blending={THREE.AdditiveBlending} />
    </Points>
  );
}

/// 是否在 worker 環境——注意 @react-three/offscreen 在 worker 內 shim 了 `self.document = {}`，
/// 不能用 typeof document 判定；改測 createElement（shim 空物件沒有、真 document 有）。
const isWorkerEnv = () => typeof (document as Partial<Document>).createElement !== 'function';

/// 量測探針：每秒回報一次 worker 渲染迴圈的 fps / 平均幀時 + 當前套用的旋鈕（給 ?debug=perf
/// overlay，順便自證旋鈕真的生效了）。fallback 掛主執行緒時走 StatsGl 量測，不重複發。
/// 成本 = 每幀兩個加法，常駐無妨。
function WorkerPerfProbe({ knobs }: { knobs: PerfKnobs }) {
  const acc = useRef({ frames: 0, t: 0 });
  useFrame((_, delta) => {
    const a = acc.current;
    a.frames += 1;
    a.t += delta;
    if (a.t >= 1) {
      if (isWorkerEnv()) {
        self.postMessage({
          type: 'perf',
          fps: a.frames / a.t,
          avgMs: (a.t / a.frames) * 1000,
          msaa: knobs.msaa,
          smaa: knobs.smaa,
        });
      }
      a.frames = 0;
      a.t = 0;
    }
  });
  return null;
}

/// 旋鈕接收：worker 環境聽主執行緒 postMessage 的 {type:'knobs'}（?debug=perf A/B 用）。
/// 主執行緒 fallback 時不收（self=window 會收到不相干訊息），維持預設。
function useKnobs(): PerfKnobs {
  const [knobs, setKnobs] = useState(DEFAULT_KNOBS);
  useEffect(() => {
    if (!isWorkerEnv()) return;
    const h = (e: MessageEvent<{ type?: string; payload?: PerfKnobs }>) => {
      if (e.data?.type === 'knobs' && e.data.payload) setKnobs(e.data.payload);
    };
    self.addEventListener('message', h as EventListener);
    return () => self.removeEventListener('message', h as EventListener);
  }, []);
  return knobs;
}

export default function StarfieldWorkerScene() {
  const knobs = useKnobs();
  // SMAA 在 worker 內必炸：postprocessing 的 SMAAEffect 用 new Image() 載 lookup 貼圖，
  // worker 沒有 Image（實測 worker 直接死給你看）→ smaa 旋鈕只在主執行緒（Saturn canvas
  // 與本場景的 main-thread fallback）生效，worker 星空忽略。
  const smaaApplied = knobs.smaa && !isWorkerEnv();
  return (
    <>
      <Galaxy />
      <SpaceDebris count={300} />
      <TwinklingStars count={800} />
      <WorkerPerfProbe knobs={{ msaa: knobs.msaa, smaa: smaaApplied }} />
      {/* 還原星空光暈：原本星空跟 Saturn 同 canvas 會吃到 bloom，搬進 worker 後要自己加。
          在 worker 執行緒跑，不卡主執行緒。
          multisampling 預設 8（= 套件預設、現行線上行為）；?debug=perf 旋鈕可 A/B。 */}
      <EffectComposer multisampling={knobs.msaa}>
        <Bloom intensity={0.9} luminanceThreshold={0.25} luminanceSmoothing={0.85} mipmapBlur />
        {smaaApplied ? <SMAA /> : <></>}
      </EffectComposer>
    </>
  );
}
