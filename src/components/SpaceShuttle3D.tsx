import type { CSSProperties } from 'react';
import './SpaceShuttle3D.css';

interface SpaceShuttle3DProps {
  className?: string;
  style?: CSSProperties;
}

const SpaceShuttle3D = ({ className = '', style = {} }: SpaceShuttle3DProps) => {
  return (
    <div className={`space-shuttle-silhouette ${className}`} style={style}>
      <svg viewBox="0 0 400 300" className="shuttle-svg">
        {/* 定義漸變色 - 與太空人風格一致 */}
        <defs>
          <linearGradient id="shuttleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(0, 170, 255, 0.8)" />
            <stop offset="50%" stopColor="rgba(138, 43, 226, 0.6)" />
            <stop offset="100%" stopColor="rgba(255, 135, 0, 0.4)" />
          </linearGradient>

          <linearGradient id="flameGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 135, 0, 0.9)" />
            <stop offset="50%" stopColor="rgba(255, 69, 0, 0.7)" />
            <stop offset="100%" stopColor="rgba(255, 0, 0, 0.3)" />
          </linearGradient>

          {/* 光暈效果 */}
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* 火箭主體 */}
        <g className="shuttle-main">
          {/* 火箭頭部（錐形） */}
          <polygon
            points="200,60 220,120 180,120"
            fill="url(#shuttleGradient)"
            opacity="0.9"
          />

          {/* 火箭身體 */}
          <rect
            x="180"
            y="120"
            width="40"
            height="80"
            rx="5"
            fill="url(#shuttleGradient)"
            opacity="0.85"
          />

          {/* 窗戶 */}
          <circle
            cx="200"
            cy="100"
            r="8"
            fill="rgba(0, 170, 255, 0.9)"
            filter="url(#glow)"
          />
          <circle
            cx="200"
            cy="100"
            r="6"
            fill="rgba(135, 206, 250, 0.6)"
          />

          {/* 左側機翼 */}
          <polygon
            points="180,150 140,180 140,200 180,190"
            fill="url(#shuttleGradient)"
            opacity="0.75"
          />

          {/* 右側機翼 */}
          <polygon
            points="220,150 260,180 260,200 220,190"
            fill="url(#shuttleGradient)"
            opacity="0.75"
          />

          {/* 左側尾翼 */}
          <polygon
            points="185,200 175,220 185,220"
            fill="url(#shuttleGradient)"
            opacity="0.7"
          />

          {/* 右側尾翼 */}
          <polygon
            points="215,200 225,220 215,220"
            fill="url(#shuttleGradient)"
            opacity="0.7"
          />

          {/* 中央尾翼 */}
          <polygon
            points="195,200 200,230 205,200"
            fill="url(#shuttleGradient)"
            opacity="0.8"
          />
        </g>

        {/* 引擎噴射火焰 */}
        <g className="shuttle-flames">
          {/* 左側引擎火焰 */}
          <ellipse
            cx="187"
            cy="225"
            rx="8"
            ry="20"
            fill="url(#flameGradient)"
            opacity="0.8"
            className="flame flame-1"
          />

          {/* 右側引擎火焰 */}
          <ellipse
            cx="213"
            cy="225"
            rx="8"
            ry="20"
            fill="url(#flameGradient)"
            opacity="0.8"
            className="flame flame-2"
          />

          {/* 中央主引擎火焰 */}
          <ellipse
            cx="200"
            cy="235"
            rx="10"
            ry="30"
            fill="url(#flameGradient)"
            opacity="0.9"
            filter="url(#glow)"
            className="flame flame-main"
          />
        </g>

        {/* 裝飾性細節 */}
        <g className="shuttle-details">
          {/* 頂部天線 */}
          <line
            x1="200"
            y1="60"
            x2="200"
            y2="45"
            stroke="rgba(0, 170, 255, 0.6)"
            strokeWidth="2"
          />
          <circle
            cx="200"
            cy="43"
            r="3"
            fill="rgba(0, 255, 127, 0.8)"
            filter="url(#glow)"
            className="antenna-light"
          />

          {/* 身體裝飾線條 */}
          <line
            x1="190"
            y1="130"
            x2="190"
            y2="190"
            stroke="rgba(0, 170, 255, 0.4)"
            strokeWidth="1.5"
          />
          <line
            x1="210"
            y1="130"
            x2="210"
            y2="190"
            stroke="rgba(0, 170, 255, 0.4)"
            strokeWidth="1.5"
          />

          {/* 狀態指示燈 */}
          <circle
            cx="195"
            cy="140"
            r="3"
            fill="rgba(0, 255, 127, 0.9)"
            className="status-light light-1"
          />
          <circle
            cx="205"
            cy="140"
            r="3"
            fill="rgba(0, 255, 127, 0.9)"
            className="status-light light-2"
          />
        </g>
      </svg>
    </div>
  );
};

export default SpaceShuttle3D;
