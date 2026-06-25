import type { ReactNode } from 'react';
import './SpaceHeroBanner.css';

interface SpaceHeroBannerProps {
  children?: ReactNode;
}

const SpaceHeroBanner = ({ children }: SpaceHeroBannerProps) => {
  return (
    <div className="space-hero-banner">
      {children}
      <div className="hero-background">
        <div className="stars-layer"></div>
        <div className="nebula-layer"></div>
      </div>

      <div className="astronaut-silhouette">
        <svg viewBox="0 0 400 300" className="astronaut-svg">
          {/* 太空人剪影 SVG */}
          <defs>
            <linearGradient id="astronautGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(0, 170, 255, 0.8)" />
              <stop offset="50%" stopColor="rgba(138, 43, 226, 0.6)" />
              <stop offset="100%" stopColor="rgba(255, 135, 0, 0.4)" />
            </linearGradient>
          </defs>

          {/* 頭盔 */}
          <circle cx="200" cy="80" r="45" fill="url(#astronautGradient)" opacity="0.9" />
          <circle cx="200" cy="80" r="40" fill="none" stroke="rgba(0, 170, 255, 0.6)" strokeWidth="2" />

          {/* 身體 */}
          <rect x="175" y="120" width="50" height="80" rx="10" fill="url(#astronautGradient)" opacity="0.8" />

          {/* 手臂 */}
          <ellipse cx="155" cy="140" rx="15" ry="25" fill="url(#astronautGradient)" opacity="0.7" />
          <ellipse cx="245" cy="140" rx="15" ry="25" fill="url(#astronautGradient)" opacity="0.7" />

          {/* 腿部 */}
          <ellipse cx="185" cy="220" rx="12" ry="30" fill="url(#astronautGradient)" opacity="0.7" />
          <ellipse cx="215" cy="220" rx="12" ry="30" fill="url(#astronautGradient)" opacity="0.7" />

          {/* 裝備細節 */}
          <rect x="185" y="130" width="30" height="20" rx="5" fill="rgba(0, 170, 255, 0.4)" />
          <circle cx="200" cy="140" r="3" fill="rgba(0, 255, 127, 0.8)" />
        </svg>
      </div>

      <div className="hero-content">
        <h1 className="hero-title">太空探索日誌</h1>
        <p className="hero-subtitle">探索宇宙的奧秘，記錄星際間的故事</p>
        <div className="hero-categories">
          <a href="#space-exploration" className="category-link">太空探索</a>
          <a href="#astronomy" className="category-link">天文學</a>
          <a href="#cosmic-news" className="category-link">宇宙紀聞</a>
          <a href="#technology" className="category-link">太空科技</a>
        </div>
      </div>

      <div className="scroll-indicator">
        <div className="scroll-arrow">↓</div>
        <span>探索更多</span>
      </div>
    </div>
  );
};

export default SpaceHeroBanner;
