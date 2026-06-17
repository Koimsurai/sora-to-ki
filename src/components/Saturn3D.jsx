import React, { useRef, Suspense, useEffect, useLayoutEffect, useState } from 'react'; // 引入 useState
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useTexture } from '@react-three/drei';
import * as THREE from 'three';
// 引入 ChromaticAberration
import { EffectComposer, Bloom, ChromaticAberration } from '@react-three/postprocessing';
import { usePageVisibility } from '../contexts/PageVisibilityContext'; // 導入 hook

// 衛星元件
function Satellite({ position, speed, size = 0.05, isVisible }) { // Accept isVisible
  const meshRef = useRef();
  const angleRef = useRef(Math.random() * Math.PI * 2); // Start at a random angle

  useFrame((state, delta) => {
    if (!isVisible) return; // Pause animation when not visible
    if (meshRef.current) {
      // Increment angle based on delta time
      angleRef.current += speed * delta;

      // 簡單的圓周運動
      meshRef.current.position.x = position[0] * Math.cos(angleRef.current);
      meshRef.current.position.z = position[0] * Math.sin(angleRef.current); // 假設在 xz 平面環繞
      meshRef.current.position.y = position[1]; // 保持 y 軸位置
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[size, 8, 8]} />
      <meshStandardMaterial color="#cccccc" emissive="#333333" roughness={0.5} metalness={0.5} />
    </mesh>
  );
}

// Modify SaturnModel to accept the animate, isVisible and isMobile props
function SaturnModel({ animate, isVisible, isMobile }) {
  const groupRef = useRef(); // Restore ref
  const ringsRef = useRef(); // Ref for rings mesh
  const scrollRotationY = useRef(0); // Restore scroll rotation logic
  const currentRotationY = useRef(0); // Store current applied rotation for smoothing
  const currentScale = useRef(0); // Store current applied scale for animation
  const [isRingHovered, setIsRingHovered] = useState(false); // State for ring hover

  // Removed useEffect for logging animate prop

  useLayoutEffect(() => {
    // Initialize scale to 0 regardless of the initial animate prop value.
    // The animation will be handled by useFrame when animate becomes true.
    if (groupRef.current) {
      groupRef.current.scale.set(0, 0, 0); // Start scaled down
    }
    currentScale.current = 0.0001; // 極小起始：預熱渲染管線（見下方 targetScale 註解）

    // Read initial scroll position and set base rotation
    scrollRotationY.current = window.scrollY * 0.001;
  }, []); // 空依賴數組，只在掛載時執行一次

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      // 計算滾動導致的旋轉角度，並存儲在 ref 中
      scrollRotationY.current = scrollY * 0.001; // 滾動越多，基礎旋轉越多
    };

    window.addEventListener('scroll', handleScroll);

    // 清理函數：組件卸載時移除監聽器
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []); // 空依賴數組，確保只在掛載和卸載時執行

  const saturnRotationRef = useRef(0); // Ref to accumulate auto-rotation

  useFrame((state, delta) => {
    if (groupRef.current && isVisible) { // Check isVisible
      // Accumulate auto-rotation based on delta time
      saturnRotationRef.current += 0.05 * delta;

      const targetRotationY = scrollRotationY.current + saturnRotationRef.current;

      currentRotationY.current = THREE.MathUtils.lerp(currentRotationY.current, targetRotationY, 0.05);

      // 3. Apply interpolated rotation
      groupRef.current.rotation.y = currentRotationY.current;

      // Animate scale
      const baseScale = isMobile ? 0.7 : 1; // Scale down on mobile
      // 未 animate 時用極小 epsilon（非 0）：Saturn 仍被繪製→材質/bloom pipeline 在 intro
      // 平靜期就編譯好，explosion 時只是放大，不會在閃光當下才編譯 shader 而頓一下
      const targetScale = animate ? baseScale : 0.0001;
      // Interpolate current scale towards target scale
      const oldScale = currentScale.current; // Log old scale for comparison
      currentScale.current = THREE.MathUtils.lerp(currentScale.current, targetScale, 0.08); // Adjust lerp factor for speed
      // Apply interpolated scale
      groupRef.current.scale.set(currentScale.current, currentScale.current, currentScale.current);

      // Removed scale logging from useFrame
    }
  });

  const [planetMap, ringsMap] = useTexture([
    '/textures/saturn_texture.webp', // 星球紋理 (更新為 webp)
    '/textures/saturn_rings_texture.webp' // 光環紋理 (更新為 webp)
  ]);

  const planetMaterial = new THREE.MeshStandardMaterial({
    map: planetMap, // 應用星球紋理
    roughness: 0.6, // 進一步降低粗糙度，使高光更明顯
    metalness: 0.1, // 保持金屬感較低
  });

  const ringsMaterial = new THREE.MeshStandardMaterial({
    map: ringsMap, // 應用光環紋理
    side: THREE.DoubleSide,
    transparent: true, // 確保透明通道生效
    opacity: isRingHovered ? 0.95 : 0.8, // 懸停時提高透明度
    color: isRingHovered ? '#f0d8b8' : '#e7c8a0', // 懸停時稍微變亮
    roughness: 0.9,
    metalness: 0.1,
  });


  const initialTilt = Math.PI / 24; // Restore initial tilt

  return (
    <group ref={groupRef} rotation={[0, 0, initialTilt]}>
      {/* 星球 */}
      <mesh material={planetMaterial}>
        <sphereGeometry args={[1, 32, 32]} /> {/* 半徑 1 */}
      </mesh>
      {/* 光環 - 保持固定傾斜，但隨 group 一起旋轉 */}
      <group rotation={[Math.PI / 2.5, 0, 0]}>
        <mesh
          ref={ringsRef} // Add ref to rings mesh
          material={ringsMaterial}
          onPointerOver={(event) => {
            event.stopPropagation(); // 阻止事件冒泡到父級
            setIsRingHovered(true);
            document.body.style.cursor = 'pointer'; // 改變鼠標樣式
          }}
          onPointerOut={(event) => {
            setIsRingHovered(false);
            document.body.style.cursor = 'auto'; // 恢復鼠標樣式
          }}
        >
          <ringGeometry args={[1.5, 2.2, 64]} /> {/* 稍微加寬光環 (1.5, 2.2) */}
        </mesh>
      </group>
      {/* 添加衛星 */}
      <Satellite position={[2.5, 0.1, 0]} speed={0.3} size={0.04} isVisible={isVisible} />
      <Satellite position={[3, -0.15, 0]} speed={0.2} size={0.06} isVisible={isVisible} />
    </group>
  );
}

// Modify Saturn3D to accept isMobile
function Saturn3D({ animate, isMobile }) {
  const { isVisible } = usePageVisibility(); // Use the hook

  // Directly return 3D objects for App.jsx's Canvas to render
  return (
    <>
      {/* 環境光 */}
      <ambientLight intensity={0.15} /> {/* 進一步降低環境光，最大化對比度 */}
      {/* Point light (simulating the sun), reduced intensity */}
      <pointLight position={[4.5, 3.5, 5.5]} intensity={400} castShadow /> {/* Intensity reduced from 800 to 400 */}
      {/* Saturn model - pass the animate and isVisible prop */}
      <SaturnModel animate={animate} isVisible={isVisible} isMobile={isMobile} />
      {/* Optional shadow plane */}
      {/* <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <shadowMaterial opacity={0.3} />
      </mesh> */}
      {/* 移除星座群組渲染 */}
      {/* 移除軌道控制器註解 */}
      {/* 移除隨機流星渲染註解 */}
      {/*
      {/* 移除 HTML 和 RandomShootingStars，它們應該在 App.jsx 中處理 */}

      {/* 添加後處理效果 - 手機版為求效能予以關閉 */}
      {!isMobile && (
        <EffectComposer>
          <Bloom
            intensity={0.15} // 進一步降低光暈強度
            luminanceThreshold={0.7} // 提高亮度閾值，使更亮的區域才產生光暈
            luminanceSmoothing={0.9} // 進一步提高平滑度
            mipmapBlur
          />
          {/* 添加輕微的色差效果模擬透鏡 */}
          <ChromaticAberration
            offset={new THREE.Vector2(0.0005, 0.0005)} // 非常小的偏移量，產生微妙效果
          />
        </EffectComposer>
      )}
    </>
  );
}

export default Saturn3D;
