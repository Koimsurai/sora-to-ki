import React, { useEffect, useState } from 'react';
import './LoadingScreen.css';

const LoadingScreen = () => {
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('初始化系統');

  useEffect(() => {
    // 模擬加載進度
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + Math.random() * 15;
      });
    }, 200);

    // 切換加載文字
    const textSteps = [
      '初始化系統',
      '連接資料庫',
      '載入書籍資料',
      '渲染 3D 場景',
      '準備完成'
    ];
    let textIndex = 0;
    const textInterval = setInterval(() => {
      textIndex = (textIndex + 1) % textSteps.length;
      setLoadingText(textSteps[textIndex]);
    }, 800);

    return () => {
      clearInterval(progressInterval);
      clearInterval(textInterval);
    };
  }, []);

  return (
    <div className="loading-screen">
      {/* 背景粒子效果 */}
      <div className="loading-particles">
        {[...Array(20)].map((_, i) => (
          <div key={i} className="particle" style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 3}s`,
            animationDuration: `${3 + Math.random() * 4}s`
          }}></div>
        ))}
      </div>

      {/* 主要內容 */}
      <div className="loading-content">
        {/* 全息書籍圖標 */}
        <div className="loading-book-container">
          <div className="loading-book">
            <div className="book-cover"></div>
            <div className="book-page"></div>
            <div className="book-page"></div>
            <div className="book-page"></div>
          </div>
          <div className="hologram-rings">
            <div className="ring ring-1"></div>
            <div className="ring ring-2"></div>
            <div className="ring ring-3"></div>
          </div>
        </div>

        {/* 進度條 */}
        <div className="loading-progress-container">
          <div className="progress-bar-bg">
            <div 
              className="progress-bar-fill"
              style={{ width: `${Math.min(progress, 100)}%` }}
            >
              <div className="progress-glow"></div>
            </div>
          </div>
          <div className="progress-text">
            {Math.floor(Math.min(progress, 100))}%
          </div>
        </div>

        {/* 加載文字 */}
        <div className="loading-text-container">
          <div className="loading-text">{loadingText}</div>
          <div className="loading-dots">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </div>
        </div>

        {/* 數據流效果 */}
        <div className="data-stream">
          {['SYSTEM_INIT', 'DATABASE_CONNECT', 'LOAD_BOOKS', 'RENDER_3D', 'READY'].map((text, i) => (
            <div key={i} className="data-line" style={{
              animationDelay: `${i * 0.3}s`
            }}>
              <span>{'>'} {text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 掃描線效果 */}
      <div className="scan-line"></div>
    </div>
  );
};

export default LoadingScreen;
