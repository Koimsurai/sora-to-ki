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
  thumbHash,
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

  // Reset state when image source changes or it's no longer the current image
  useEffect(() => {
    if (!isCurrentImage) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [src, isCurrentImage]);


  // Preload high-res image
  useEffect(() => {
    setLoaded(false);
    const img = new Image();
    img.src = src;
    img.onload = () => {
      setLoaded(true);
      onLoad?.();
    };
  }, [src, onLoad]);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (!enableZoom || !isCurrentImage) return;
    e.preventDefault();
    e.stopPropagation();

    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    setScale(prevScale => {
        const newScale = Math.max(1, Math.min(prevScale + delta, 5));
        if (newScale === 1) {
            setPosition({ x: 0, y: 0 });
        }
        return newScale;
    });
  }, [enableZoom, isCurrentImage]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!enablePan || scale <= 1 || !isCurrentImage) return;
    e.preventDefault();
    setIsPanning(true);
    setStartPos({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  }, [enablePan, scale, isCurrentImage, position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isPanning || !containerRef.current) return;
    
    const newX = e.clientX - startPos.x;
    const newY = e.clientY - startPos.y;
    
    // Basic boundary checks to prevent panning too far
    const container = containerRef.current;
    const image = imageRef.current;
    if (container && image) {
        const containerRect = container.getBoundingClientRect();
        const imageWidth = image.width * scale;
        const imageHeight = image.height * scale;

        const maxPanX = (imageWidth - containerRect.width) / 2;
        const maxPanY = (imageHeight - containerRect.height) / 2;

        const clampedX = Math.max(-maxPanX, Math.min(newX, maxPanX));
        const clampedY = Math.max(-maxPanY, Math.min(newY, maxPanY));
        
        setPosition({ x: clampedX, y: clampedY });
    } else {
        setPosition({ x: newX, y: newY });
    }

  }, [isPanning, startPos, scale]);

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
    <div
      ref={containerRef}
      className={`progressive-image-wrapper ${className}`}
      onMouseDown={handleMouseDown}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        cursor: isPanning ? 'grabbing' : (isCurrentImage && scale > 1 ? 'grab' : 'default'),
      }}
    >
      <motion.div
        className="progressive-image-panner"
        style={{
          width: '100%',
          height: '100%',
          scale,
          translateX: position.x,
          translateY: position.y,
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
              top: 0,
              left: 0,
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
            width: '100%',
            height: '100%',
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