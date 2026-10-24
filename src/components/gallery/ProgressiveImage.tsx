import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import './ProgressiveImage.css';

interface ProgressiveImageProps {
  src: string;
  thumbSrc?: string;
  alt?: string;
  thumbHash?: string;
  onLoad?: () => void;
  className?: string;
  enablePan?: boolean;
  enableZoom?: boolean;
  onScaleChange?: (scale: number) => void;
  isCurrentImage?: boolean; // Only the active slide should have zoom enabled
}

const ProgressiveImage: React.FC<ProgressiveImageProps> = ({
  src,
  thumbSrc,
  alt = '',
  onLoad,
  className = '',
  enablePan = true,
  enableZoom = true,
  onScaleChange,
  isCurrentImage,
}) => {
  const [loaded, setLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  // Report scale change
  useEffect(() => {
    if (onScaleChange) {
      onScaleChange(scale);
    }
  }, [scale, onScaleChange]);

  // Reset state when image source changes or it's no longer the current image.
  // 刻意留在 effect：!isCurrentImage 代表這張已經不是當前 slide（PhotoViewer 只渲染
  // currentIndex ±2），使用者看不到重設前的那一幀，沒有「render 期調整」的必要。
  // 試過改寫成官方的 prev-props 比較法，反而多一個警告（規則會把 render 期的
  // setState 也報成 in-an-effect），程式碼也更繞。
  /* eslint-disable @eslint-react/set-state-in-effect */
  useEffect(() => {
    if (!isCurrentImage) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [src, isCurrentImage]);
  /* eslint-enable @eslint-react/set-state-in-effect */

  // Preload high-res image only when it's the current image
  useEffect(() => {
    // Only start loading if it's the current image and it hasn't loaded yet.
    if (isCurrentImage && !loaded) {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        setLoaded(true);
        onLoad?.();
      };
    }
    // Do not reset 'loaded' state when isCurrentImage becomes false
    // to keep already loaded images in high-res when swiping back.
  }, [src, onLoad, isCurrentImage, loaded]);

  /** 平移夾在圖的邊緣以內：放大後超出框的那一截才能拖，沒超出的那一邊保持置中 */
  const clampPan = useCallback((x: number, y: number, s: number) => {
    const container = containerRef.current;
    const image = imageRef.current;
    if (!container || !image) return { x, y };
    // offsetWidth 是畫面上（transform 之前）的大小，不是原圖的像素
    const excessX = Math.max(0, (image.offsetWidth * s - container.clientWidth) / 2);
    const excessY = Math.max(0, (image.offsetHeight * s - container.clientHeight) / 2);
    return { x: Math.max(-excessX, Math.min(x, excessX)), y: Math.max(-excessY, Math.min(y, excessY)) };
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const container = containerRef.current;
      if (!enableZoom || !isCurrentImage || !container) return;
      e.preventDefault();
      e.stopPropagation();

      const next = Math.max(1, Math.min(scale + (e.deltaY > 0 ? -0.2 : 0.2), 5));
      if (next === scale) return;
      // 往游標那一點放大：游標底下那一點縮放前後都留在游標底下（座標從框的中心算，跟 transform-origin 一樣）
      const r = container.getBoundingClientRect();
      const cx = e.clientX - r.left - r.width / 2;
      const cy = e.clientY - r.top - r.height / 2;
      const k = next / scale;
      setScale(next);
      setPosition(next === 1 ? { x: 0, y: 0 } : clampPan(cx - (cx - position.x) * k, cy - (cy - position.y) * k, next));
    },
    [enableZoom, isCurrentImage, scale, position, clampPan],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!enablePan || scale <= 1 || !isCurrentImage) return;
      e.preventDefault();
      setIsPanning(true);
      setStartPos({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    },
    [enablePan, scale, isCurrentImage, position],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isPanning) return;
      setPosition(clampPan(e.clientX - startPos.x, e.clientY - startPos.y, scale));
    },
    [isPanning, startPos, scale, clampPan],
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container && isCurrentImage) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);

      return () => {
        container.removeEventListener('wheel', handleWheel);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [handleWheel, handleMouseMove, handleMouseUp, isCurrentImage]);

  return (
    // onMouseDown 是「拖曳平移放大後的圖片」，本質是指標手勢；
    // 鍵盤沒有對應的平移概念（要做也是另開方向鍵功能，不是補 onKeyDown）
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={containerRef}
      className={`progressive-image-wrapper ${className}`}
      onMouseDown={handleMouseDown}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        cursor: isPanning ? 'grabbing' : isCurrentImage && scale > 1 ? 'grab' : 'default',
      }}
    >
      <motion.div
        className="progressive-image-panner"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          scale,
          translateX: position.x,
          translateY: position.y,
          transformOrigin: 'center center',
        }}
      >
        {/* Thumbnail */}
        {thumbSrc && (
          <motion.img
            src={thumbSrc}
            alt={alt}
            className="progressive-image-thumb"
            initial={{ opacity: 1 }}
            animate={{ opacity: loaded ? 0 : 1 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'absolute',
              maxWidth: '100%',
              maxHeight: '100%',
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              filter: 'blur(10px)',
            }}
          />
        )}

        {/* Full-res image */}
        <motion.img
          ref={imageRef}
          src={src}
          alt={alt}
          className="progressive-image-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: loaded ? 1 : 0 }}
          transition={{ duration: 0.5 }}
          draggable={false}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
          }}
        />
      </motion.div>

      {/* Loading indicator */}
      {!loaded && (
        <div className="progressive-image-loader">
          <div className="spinner" />
        </div>
      )}
    </div>
  );
};

export default ProgressiveImage;
