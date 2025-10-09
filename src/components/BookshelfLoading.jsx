import React, { useEffect, useState } from 'react';
import './BookshelfLoading.css';

const BookshelfLoading = () => {
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
    <div className="bookshelf-loading-screen">
      {/* 背景粒子效果 */}
      <div className="bookshelf-loading-particles">
        {[...Array(20)].map((_, i) => (
          <div key={i} className="bookshelf-particle" style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 3}s`,
            animationDuration: `${3 + Math.random() * 4}s`
          }}></div>
        ))}
      </div>

      {/* 主要內容 */}
      <div className="bookshelf-loading-content">
        {/* 全息書籍圖標 */}
        <div className="bookshelf-loading-book-container">
          <div className="bookshelf-loading-book">
            <div className="bookshelf-book-cover"></div>
            <div className="bookshelf-book-page"></div>
            <div className="bookshelf-book-page"></div>
            <div className="bookshelf-book-page"></div>
          </div>
          <div className="bookshelf-hologram-rings">
            <div className="bookshelf-ring bookshelf-ring-1"></div>
            <div className="bookshelf-ring bookshelf-ring-2"></div>
            <div className="bookshelf-ring bookshelf-ring-3"></div>
          </div>
        </div>

        {/* 進度條 */}
        <div className="bookshelf-loading-progress-container">
          <div className="bookshelf-progress-bar-bg">
            <div 
              className="bookshelf-progress-bar-fill"
              style={{ width: `${Math.min(progress, 100)}%` }}
            >
              <div className="bookshelf-progress-glow"></div>
            </div>
          </div>
          <div className="bookshelf-progress-text">
            {Math.floor(Math.min(progress, 100))}%
          </div>
        </div>

        {/* 加載文字 */}
        <div className="bookshelf-loading-text-container">
          <div className="bookshelf-loading-text">{loadingText}</div>
          <div className="bookshelf-loading-dots">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </div>
        </div>

        {/* 數據流效果 */}
        <div className="bookshelf-data-stream">
          {['SYSTEM_INIT', 'DATABASE_CONNECT', 'LOAD_BOOKS', 'RENDER_3D', 'READY'].map((text, i) => (
            <div key={i} className="bookshelf-data-line" style={{
              animationDelay: `${i * 0.3}s`
            }}>
              <span>{'>'} {text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 掃描線效果 */}
      <div className="bookshelf-scan-line"></div>
    </div>
  );
};

export default BookshelfLoading;
