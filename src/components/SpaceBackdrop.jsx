// 桌面專屬的 Three.js 太空背景（星空 / 碎片 / 土星 / 開場動畫 / 隨機特效）。
// 從 App.jsx 抽出並用 lazy() 載入 —— 手機完全不下載也不執行這支與整包 vendor-three，
// 是手機 Lighthouse 從 40 分起跳的關鍵（TBT 主因是這裡的 useFrame 渲染迴圈）。
import React, { useRef, useMemo, useEffect, Suspense } from 'react';
import { Stars, Points, PointMaterial } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Saturn3D from './Saturn3D';
import TwinklingStars from './TwinklingStars';
import ForegroundStars from './ForegroundStars';
import RandomShootingStars from './RandomShootingStars';
import RandomComets from './RandomComets';
import RandomUFOs from './RandomUFOs';
import CursorTrail from './CursorTrail';

function StarfieldScene({ mainStarsRef, isMobile, isHomePage = true }) {
  const galaxyRef = useRef();
  const scrollSpeedMultiplier = useRef(1);
  const scrollTimeoutRef = useRef(null);
  const boostedSpeedMultiplier = 3;

  useEffect(() => {
    const handleScroll = () => {
      scrollSpeedMultiplier.current = boostedSpeedMultiplier;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => { scrollSpeedMultiplier.current = 1; }, 150);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  useFrame((state, delta) => {
    const m = scrollSpeedMultiplier.current;
    if (mainStarsRef.current) {
      mainStarsRef.current.rotation.x += delta * 0.01 * m;
      mainStarsRef.current.rotation.y += delta * 0.02 * m;
    }
    if (galaxyRef.current) {
      galaxyRef.current.rotation.x += delta * 0.008 * m;
      galaxyRef.current.rotation.y += delta * 0.015 * m;
    }
  });

  return (
    <Suspense fallback={null}>
      <Stars ref={mainStarsRef} radius={100} depth={50}
        count={isMobile ? 3000 : (isHomePage ? 10000 : 4000)}
        factor={3.5} saturation={0.1} fade speed={0.5} />
      <Stars ref={galaxyRef} radius={90} depth={20}
        count={isMobile ? 2000 : (isHomePage ? 8000 : 3000)}
        factor={5} saturation={0.2} fade speed={0.3}
        rotation={[0, Math.PI / 3, Math.PI / 5]} />
    </Suspense>
  );
}

function SpaceDebris({ count = 200 }) {
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

  useFrame((state, delta) => {
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

/**
 * 桌面太空背景總成。isMobile 永遠為 false（App 只在桌面 render 本元件），
 * 保留參數讓 StarfieldScene 的數量邏輯不用改。
 */
export default function SpaceBackdrop({
  isMobile, isOnHomePage, animateSaturn, saturnZIndex, sharedRotationRef,
}) {
  return (
    <>
      <Canvas
        camera={{ position: [0, 0, 5] }}
        dpr={isMobile ? 1 : [1, 2]}
        frameloop="always"
        gl={{ powerPreference: 'high-performance', antialias: !isMobile }}
        style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: saturnZIndex, pointerEvents: 'none' }}
      >
        <Suspense fallback={null}>
          <StarfieldScene mainStarsRef={sharedRotationRef} isMobile={isMobile} isHomePage={isOnHomePage} />
          {isOnHomePage && <SpaceDebris count={isMobile ? 50 : 300} />}
          {isOnHomePage && <Saturn3D animate={animateSaturn} isMobile={isMobile} />}
          <TwinklingStars rotationRef={sharedRotationRef} count={isMobile ? 200 : (isOnHomePage ? 800 : 300)} />
        </Suspense>
      </Canvas>
      {/* 維持原本的 mobile gating，畫面跟改版前一致 */}
      {isOnHomePage && <ForegroundStars count={isMobile ? 5 : 15} />}
      {isOnHomePage && !isMobile && <RandomShootingStars />}
      {isOnHomePage && !isMobile && <RandomComets />}
      {isOnHomePage && <RandomUFOs />}
      {!isMobile && <CursorTrail style={{ position: 'fixed', top: 0, left: 0, zIndex: 50, pointerEvents: 'none' }} />}
    </>
  );
}
