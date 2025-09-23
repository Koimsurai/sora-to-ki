import React from 'react';

// 使用 React.lazy 延遲載入重量級組件
export const LazySpaceParticles = React.lazy(() => import('./SpaceParticles'));
export const LazyMeteorShower = React.lazy(() => import('./MeteorShower'));
export const LazyBlackHole3D = React.lazy(() => import('./BlackHole3D'));

// 為不同組件提供專門的載入佔位符
export const SpaceParticlesPlaceholder = () => (
  <div 
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: -2,
      background: 'transparent',
      pointerEvents: 'none'
    }}
  />
);

export const MeteorShowerPlaceholder = () => (
  <div 
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      zIndex: -1,
      background: 'transparent',
      pointerEvents: 'none'
    }}
  />
);

export const BlackHole3DPlaceholder = () => (
  <div 
    style={{
      width: '100%',
      height: '300px',
      background: 'radial-gradient(circle, rgba(138, 43, 226, 0.1) 0%, transparent 70%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'rgba(255, 255, 255, 0.5)',
      fontSize: '14px',
      borderRadius: '8px'
    }}
  >
    <div style={{ textAlign: 'center' }}>
      <div style={{ marginBottom: '8px' }}>🌌</div>
      <div>準備載入 3D 黑洞</div>
    </div>
  </div>
);