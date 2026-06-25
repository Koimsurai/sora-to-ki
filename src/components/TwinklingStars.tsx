import React, { useRef, useMemo } from 'react';
import { Points } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Vertex Shader
const vertexShader = `
  attribute float aSize;
  attribute float aTwinkleSpeed;
  attribute float aTwinkleOffset;
  attribute float aMinOpacity;
  attribute float aMaxOpacity;
  attribute float aIsGlare; // 0.0 for normal, 1.0 for glare

  varying float vOpacity;
  varying float vIsGlare;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uBaseSize;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    // Calculate twinkle opacity
    float timeFactor = uTime * aTwinkleSpeed + aTwinkleOffset;
    float wave = sin(timeFactor); // -1 to 1
    vOpacity = mix(aMinOpacity, aMaxOpacity, (wave + 1.0) / 2.0); // Map wave to minOpacity to maxOpacity

    // Calculate size
    float size = aSize * uBaseSize;
    if (aIsGlare > 0.5) {
      // Make glare stars bigger, especially when bright
      size *= mix(1.5, 3.0, (wave + 1.0) / 2.0); // Glare stars are 1.5x to 3x bigger
    }

    gl_PointSize = size * (300.0 / -mvPosition.z) * uPixelRatio; // Adjust size based on distance and pixel ratio
    gl_Position = projectionMatrix * mvPosition;

    vIsGlare = aIsGlare; // Pass glare status to fragment shader
  }
`;

// Fragment Shader
const fragmentShader = `
  varying float vOpacity;
  varying float vIsGlare;

  void main() {
    // Create a circular shape
    float distanceToCenter = length(gl_PointCoord - vec2(0.5));
    float strength = 1.0 - smoothstep(0.45, 0.5, distanceToCenter); // Soft edge circle

    vec3 color = vec3(1.0); // Base color white

    if (vIsGlare > 0.5) {
       // Make glare stars slightly bluish or yellowish when bright
       color = mix(vec3(0.8, 0.8, 1.0), vec3(1.0, 1.0, 0.8), vOpacity); // Blend between blueish and yellowish based on opacity
       // Add a stronger core for glare stars
       float coreStrength = 1.0 - smoothstep(0.0, 0.15, distanceToCenter); // Smaller, sharper core
       strength = max(strength, coreStrength * 1.5); // Combine soft edge and sharp core
    }


    gl_FragColor = vec4(color, strength * vOpacity); // Apply calculated opacity and strength
  }
`;

interface TwinklingStarsProps {
  count?: number;
  rotationRef?: React.RefObject<THREE.Object3D | null>;
}

function TwinklingStars({ count = 1500, rotationRef }: TwinklingStarsProps) { // Increased count
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null); // Ref for the geometry

  // Generate particle attributes and geometry
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const twinkleSpeeds = new Float32Array(count);
    const twinkleOffsets = new Float32Array(count);
    const minOpacities = new Float32Array(count);
    const maxOpacities = new Float32Array(count);
    const isGlares = new Float32Array(count); // 0 or 1

    const radius = 100;
    const glareProbability = 0.05; // 5% chance to be a glare star

    for (let i = 0; i < count; i++) {
      // Position (same spherical distribution)
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = radius * Math.cbrt(Math.random());
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      positions.set([x, y, z], i * 3);

      // Size (random variation)
      sizes[i] = THREE.MathUtils.randFloat(0.5, 1.5);

      // Twinkle data
      twinkleOffsets[i] = Math.random() * 2 * Math.PI;
      twinkleSpeeds[i] = THREE.MathUtils.randFloat(0.2, 0.7); // Slightly slower range
      minOpacities[i] = THREE.MathUtils.randFloat(0.1, 0.4); // Lower min opacity for more twinkle
      maxOpacities[i] = THREE.MathUtils.randFloat(0.7, 1.0); // Allow some stars to be fully opaque

      // Glare status
      isGlares[i] = Math.random() < glareProbability ? 1.0 : 0.0;
      if (isGlares[i] > 0.5) {
        // Ensure glare stars are generally brighter
        minOpacities[i] = Math.max(minOpacities[i], 0.4);
        maxOpacities[i] = 1.0;
      }
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geom.setAttribute('aTwinkleSpeed', new THREE.BufferAttribute(twinkleSpeeds, 1));
    geom.setAttribute('aTwinkleOffset', new THREE.BufferAttribute(twinkleOffsets, 1));
    geom.setAttribute('aMinOpacity', new THREE.BufferAttribute(minOpacities, 1));
    geom.setAttribute('aMaxOpacity', new THREE.BufferAttribute(maxOpacities, 1));
    geom.setAttribute('aIsGlare', new THREE.BufferAttribute(isGlares, 1));

    return geom;
  }, [count]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uPixelRatio: { value: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1.5 }, // worker 內無 window
    uBaseSize: { value: 15.0 } // Base size multiplier - adjust this value to change overall star size
  }), []);

  useFrame(({ clock }) => {
    const elapsedTime = clock.getElapsedTime();
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = elapsedTime;
    }

    // Rotation logic remains the same
    if (pointsRef.current && rotationRef?.current) {
        pointsRef.current.rotation.copy(rotationRef.current.rotation);
    } else if (pointsRef.current) {
        pointsRef.current.rotation.x += 0.0001;
        pointsRef.current.rotation.y += 0.0002;
    }
  });

  // Cleanup geometry on unmount
  React.useEffect(() => {
    return () => {
      if (geometryRef.current) {
        geometryRef.current.dispose();
      }
    };
  }, []);


  return (
    <Points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      {/* Geometry is now passed directly, no need for bufferAttribute children */}
      <shaderMaterial
        ref={materialRef}
        key={Date.now()} // Add key to force re-creation if needed, helps with HMR sometimes
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent={true}
        depthWrite={false} // Important for blending
        blending={THREE.AdditiveBlending} // Use AdditiveBlending for a brighter, more "glowy" look
      />
    </Points>
  );
}

export default TwinklingStars;
