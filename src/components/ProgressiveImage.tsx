/**
 * ProgressiveImage - 漸進式圖片載入元件
 * 支援縮放、平移和漸進式載入
 */

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import './ProgressiveImage.css';

interface ProgressiveImageProps {
  src: string;
  thumbSrc?: string;
  alt?: string;
  thumbHash?: string;
  onLoad?: () => void;
  className?: string;
}

const ProgressiveImage: React.FC<ProgressiveImageProps> = ({
  src,
  thumbSrc,
  alt = '',
  thumbHash,
  onLoad,
  className = '',
}) => {
  const [loaded, setLoaded] = useState(false);
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const imageRef = useRef<HTMLImageElement>(null);

  // 載入高解析度圖片
  useEffect(() => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      setLoaded(true);
      onLoad?.();
    };
  }, [src, onLoad]);

  // 拖曳開始
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  // 拖曳移動
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  // 拖曳結束
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 雙擊重置
  const handleDoubleClick = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  return (
    <div
      className={`progressive-image-container ${className}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      style={{
        cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
      }}
    >
      {/* ThumbHash 佔位符 */}
      {thumbHash && !thumbLoaded && (
        <canvas
          className="progressive-image-placeholder"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            filter: 'blur(20px)',
            transform: 'scale(1.1)',
          }}
        />
      )}

      {/* 縮圖 (低解析度) */}
      {thumbSrc && (
        <motion.img
          src={thumbSrc}
          alt={alt}
          className="progressive-image-thumb"
          initial={{ opacity: 0 }}
          animate={{ opacity: thumbLoaded && !loaded ? 1 : 0 }}
          transition={{ duration: 0.3 }}
          onLoad={() => setThumbLoaded(true)}
          style={{
            transform: `scale(${scale}) translate(${position.x}px, ${position.y}px)`,
            filter: 'blur(10px)',
          }}
        />
      )}

      {/* 高解析度圖片 */}
      <motion.img
        ref={imageRef}
        src={src}
        alt={alt}
        className="progressive-image-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: loaded ? 1 : 0 }}
        transition={{ duration: 0.5 }}
        style={{
          transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
        }}
        draggable={false}
      />

      {/* 載入中指示器 */}
      {!loaded && (
        <div className="progressive-image-loader">
          <div className="spinner" />
        </div>
      )}
    </div>
  );
};

export default ProgressiveImage;
