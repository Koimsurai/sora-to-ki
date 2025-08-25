import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import './BlackHole3D.css';

function BlackHoleModel({ isLeftSide = false }) {
  const gltf = useLoader(GLTFLoader, '/blackhole/scene.gltf');
  const meshRef = useRef();

  useFrame((state) => {
    if (meshRef.current) {
      // 讓黑洞緩慢旋轉
      // meshRef.current.rotation.y += isLeftSide ? 0.003 : 0.005;
      // 添加一些微小的浮動效果
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * (isLeftSide ? 0.05 : 0.1);
    }
  });

  useEffect(() => {
    if (gltf.scene) {
      // 設置材質和效果
      gltf.scene.traverse((child) => {
        if (child.isMesh) {
          // 增強發光效果
          if (child.material) {
            child.material.emissiveIntensity = isLeftSide ? 3 : 2;
            child.material.transparent = true;
          }
        }
      });
    }
  }, [gltf, isLeftSide]);

  const scale = isLeftSide ? [1.5, 1.5, 1.5] : [0.8, 0.8, 0.8];
  const position = isLeftSide ? [0, 0, 0] : [0, 0, 0];
  const rotation = [Math.PI / 10, 0, 0]; // 固定傾斜角度

  return (
    <primitive 
      ref={meshRef} 
      object={gltf.scene} 
      scale={scale}
      position={position}
      rotation={rotation}
    />
  );
}

function ParticleField({ isLeftSide = false }) {
  const pointsRef = useRef();
  const particleCount = isLeftSide ? 1200 : 800; // 減少粒子數量

  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i++) {
    // 創建球形分佈的粒子
    const radius = Math.random() * (isLeftSide ? 15 : 10) + (isLeftSide ? 8 : 5);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta) + (isLeftSide ? 1 : 0);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);

    // 設置粒子顏色（橙色到紅色的漸變）
    colors[i * 3] = 1; // R
    colors[i * 3 + 1] = Math.random() * 0.5; // G
    colors[i * 3 + 2] = 0; // B
  }

  useFrame((state) => {
    if (pointsRef.current) {
      // pointsRef.current.rotation.y += isLeftSide ? 0.0005 : 0.001;
      // 創建粒子的脈動效果
      const time = state.clock.elapsedTime;
      const geometry = pointsRef.current.geometry;
      const positions = geometry.attributes.position.array;

      for (let i = 0; i < particleCount; i++) {
        const index = i * 3;
        const originalRadius = Math.sqrt(
          positions[index] ** 2 + 
          positions[index + 1] ** 2 + 
          positions[index + 2] ** 2
        );
        const pulseEffect = 1 + Math.sin(time * 2 + i * 0.1) * 0.1;
        
        positions[index] *= pulseEffect / originalRadius * (originalRadius * 0.1);
        positions[index + 1] *= pulseEffect / originalRadius * (originalRadius * 0.1);
        positions[index + 2] *= pulseEffect / originalRadius * (originalRadius * 0.1);
      }
      
      geometry.attributes.position.needsUpdate = true;
    }
  });

  const rotation = [Math.PI / 10, 0, 0]; // 固定傾斜角度

  return (
    <points ref={pointsRef} rotation={rotation}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={particleCount}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={isLeftSide ? 0.08 : 0.05}
        vertexColors
        transparent
        opacity={isLeftSide ? 0.9 : 0.8}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

const BlackHole3D = ({ className = '', style = {} }) => {
  const [isLoaded, setIsLoaded] = useState(() => {
    try {
      return sessionStorage.getItem('blackHoleLoaded') === 'true';
    } catch (error) {
      return false;
    }
  });
  const isLeftSide = className.includes('blog-blackhole-left');

  const containerStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: -1,
    ...style
  };

  const handleCanvasCreated = () => {
    setIsLoaded(true);
    try {
      sessionStorage.setItem('blackHoleLoaded', 'true');
    } catch (error) {
      console.error("無法寫入 sessionStorage", error);
    }
  };

  return (
    <div className={`blackhole-3d-container ${className}`} style={containerStyle}>
      <Canvas
        camera={{ 
          position: isLeftSide ? [0, 0, 10] : [0, 0, 5], 
          fov: isLeftSide ? 50 : 75 
        }}
        gl={{ antialias: true, alpha: true }}
        onCreated={handleCanvasCreated}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#ff4500" />
        
        <React.Suspense fallback={null}>
          <BlackHoleModel isLeftSide={isLeftSide} />
          <ParticleField isLeftSide={isLeftSide} />
        </React.Suspense>
        
        <OrbitControls 
          enableZoom={false}
          enablePan={false}
          autoRotate={isLeftSide}
          autoRotateSpeed={isLeftSide ? 0.3 : 0.5}
          enableDamping
          dampingFactor={0.05}
        />
      </Canvas>
      
      {!isLoaded && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>載入 3D 黑洞模型中...</p>
        </div>
      )}
    </div>
  );
};

export default BlackHole3D;
