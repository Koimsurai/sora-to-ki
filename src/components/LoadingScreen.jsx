import React from 'react';
import './LoadingScreen.css';

const LoadingScreen = () => {

  return (
    <div className="loading-screen">
      {/* 星空背景粒子 */}
      <div className="loading-particles">
        {[...Array(50)].map((_, i) => (
          <div 
            key={i} 
            className="particle" 
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 3}s`
            }}
          />
        ))}
      </div>

      {/* 主要內容 */}
      <div className="loading-content">
        {/* 旋轉的太空站圖標 */}
        <div className="loading-spinner-container">
          <div className="spinner-outer-ring"></div>
          <div className="spinner-middle-ring"></div>
          <div className="spinner-inner-ring"></div>
          <div className="spinner-core">
            <div className="core-pulse"></div>
          </div>
        </div>

        {/* 加載文字 */}
        <div className="loading-text-container">
          <div className="loading-text">Loading</div>
          <div className="loading-dots">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;
