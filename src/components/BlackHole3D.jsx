import React, { useRef } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import './BlackHole3D.css';

// 黑洞模型組件
function BlackHoleModel() {
  const gltf = useLoader(GLTFLoader, '/blackhole/textures/blackhole.glb');
  const meshRef = useRef();

  useFrame(() => {
    if (meshRef.current) {
      // 簡單的旋轉動畫
      meshRef.current.rotation.y += 0.005;
    }
  });

  // 確保材質正確載入
  React.useEffect(() => {
    if (gltf.scene) {
      console.log('=== Black Hole Model Debug ===');
      console.log('Scene:', gltf.scene);
      console.log('Children count:', gltf.scene.children.length);
      
      let meshCount = 0;
      gltf.scene.traverse((child) => {
        console.log('Child type:', child.type, 'Name:', child.name, 'Visible:', child.visible);
        
        if (child.isMesh) {
          meshCount++;
          console.log(`Mesh #${meshCount}:`, child.name);
          console.log('  - Material:', child.material);
          console.log('  - Geometry:', child.geometry);
          
          // 確保材質可見
          if (child.material) {
            // 處理材質陣列
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            
            materials.forEach((mat, index) => {
              console.log(`  - Material ${index}:`, mat.type, 'Color:', mat.color);
              mat.side = 2; // THREE.DoubleSide
              mat.transparent = false;
              mat.opacity = 1;
              mat.visible = true;
              mat.depthWrite = true;
              mat.depthTest = true;
              mat.needsUpdate = true;
              
              // 特別處理吸積盤 (ring)
              if (child.name.includes('ring')) {
                console.log('  🌀 Accretion disk detected! Enhancing...');
                mat.metalness = 0.3;
                mat.roughness = 0.7;
                mat.emissive = new THREE.Color(0xff6600);
                mat.emissiveIntensity = 1.5;
                
                if (mat.color) {
                  mat.color.setRGB(1, 0.6, 0.3); // 橘色
                }
              }
              
              // 增強所有顏色
              if (mat.color && !child.name.includes('ring')) {
                mat.color.multiplyScalar(2);
              }
              
              // 增強發光效果
              if (mat.emissive && !child.name.includes('ring')) {
                mat.emissiveIntensity = 1.5;
              }
              
              // 確保紋理正確載入
              if (mat.map) {
                console.log('  - Has texture map');
                mat.map.needsUpdate = true;
                mat.map.encoding = 3001; // sRGBEncoding
              }
            });
          }
          child.visible = true;
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      
      console.log('Total meshes found:', meshCount);
      console.log('================================');
    }
  }, [gltf]);

  return (
    <primitive 
      ref={meshRef} 
      object={gltf.scene} 
      scale={[1.2, 1.2, 1.2]}
      position={[0, 0, 0]}
    />
  );
}

// 主要組件
const BlackHole3D = ({ className = '', style = {} }) => {
  const containerStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    zIndex: -1,
    overflow: 'hidden',
    ...style
  };

  return (
    <div className={`blackhole-3d-container ${className}`} style={containerStyle}>
      <Canvas
        camera={{ position: [0, 0, 10], fov: 50 }}
        gl={{ 
          antialias: true,
          alpha: true,
          powerPreference: "high-performance"
        }}
        style={{ width: '100%', height: '100%' }}
        onCreated={({ gl }) => {
          gl.physicallyCorrectLights = true;
        }}
      >
        {/* 燈光設置 - 增強照明讓吸積盤可見 */}
        <ambientLight intensity={0.8} />
        <directionalLight position={[5, 5, 5]} intensity={1.5} />
        <directionalLight position={[-5, -5, 5]} intensity={1} color="#ff8844" />
        <pointLight position={[10, 10, 10]} intensity={1.2} />
        <pointLight position={[-10, -10, -10]} intensity={0.8} color="#ff6600" />
        
        {/* 黑洞模型 */}
        <React.Suspense fallback={null}>
          <BlackHoleModel />
        </React.Suspense>
        
        {/* 控制器 */}
        <OrbitControls 
          enableZoom={false}
          enablePan={false}
          autoRotate={true}
          autoRotateSpeed={0.5}
        />
      </Canvas>
    </div>
  );
};

export default BlackHole3D;
