// 自包含星空場景 —— 同時用於 OffscreenCanvas worker（spaceWorker）與不支援時的主執行緒 fallback。
// 規則：不可碰 window / document / React context（worker 裡都沒有）。
// 內容對齊原 SpaceBackdrop 的星空（兩層 drei Stars + 太空碎片 + 閃爍星），
// 唯一差別：拿掉 window.scrollY 的捲動加速（worker 無 window），改固定轉速。
import { useRef, useMemo, Suspense } from 'react';
import { Stars, Points, PointMaterial } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import TwinklingStars from './TwinklingStars';

function Galaxy() {
  const mainRef = useRef();
  const galaxyRef = useRef();
  useFrame((_, delta) => {
    if (mainRef.current) {
      mainRef.current.rotation.x += delta * 0.01;
      mainRef.current.rotation.y += delta * 0.02;
    }
    if (galaxyRef.current) {
      galaxyRef.current.rotation.x += delta * 0.008;
      galaxyRef.current.rotation.y += delta * 0.015;
    }
  });
  return (
    <Suspense fallback={null}>
      <Stars ref={mainRef} radius={100} depth={50} count={10000} factor={3.5} saturation={0.1} fade speed={0.5} />
      <Stars ref={galaxyRef} radius={90} depth={20} count={8000} factor={5} saturation={0.2} fade speed={0.3}
        rotation={[0, Math.PI / 3, Math.PI / 5]} />
    </Suspense>
  );
}

function SpaceDebris({ count = 300 }) {
  const pointsRef = useRef();
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
    const positions = pointsRef.current.geometry.attributes.position.array;
    const distance = 100;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] += particleData[i].velocity.x * delta * 50;
      positions[i3 + 1] += particleData[i].velocity.y * delta * 50;
      positions[i3 + 2] += particleData[i].velocity.z * delta * 50;
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

export default function StarfieldWorkerScene() {
  return (
    <>
      <Galaxy />
      <SpaceDebris count={300} />
      <TwinklingStars count={800} />
      {/* 還原星空光暈：原本星空跟 Saturn 同 canvas 會吃到 bloom，搬進 worker 後要自己加。
          在 worker 執行緒跑，不卡主執行緒。 */}
      <EffectComposer>
        <Bloom intensity={0.9} luminanceThreshold={0.25} luminanceSmoothing={0.85} mipmapBlur />
      </EffectComposer>
    </>
  );
}
