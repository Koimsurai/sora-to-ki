import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes } from 'react-icons/fa';

/**
 * 圖片 Lightbox 組件
 * - 點擊放大圖片（浮動在頁面正中央）
 * - 滾動立即關閉（不 preventDefault，不卡頓）
 * - NAS 圖片 hover 顯示完整 EXIF 資訊（從 manifest 讀取）
 */

/* ── NAS manifest 快取 ── */
let _manifestCache = null;
let _manifestLoading = false;
let _manifestCallbacks = [];

const fetchManifest = () => {
  if (_manifestCache) return Promise.resolve(_manifestCache);
  if (_manifestLoading) {
    return new Promise((resolve) => _manifestCallbacks.push(resolve));
  }
  _manifestLoading = true;
  return fetch('/api/gallery/photos')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data?.photos) {
        // 建立 URL → photo 的快速查詢 map
        const map = new Map();
        data.photos.forEach(p => {
          if (p.thumbnailUrl) map.set(p.thumbnailUrl, p);
          if (p.originalUrl) map.set(p.originalUrl, p);
          if (p.urls?.thumb) map.set(p.urls.thumb, p);
          if (p.urls?.full) map.set(p.urls.full, p);
        });
        _manifestCache = map;
      } else {
        _manifestCache = new Map();
      }
      _manifestCallbacks.forEach(cb => cb(_manifestCache));
      _manifestCallbacks = [];
      return _manifestCache;
    })
    .catch(() => {
      _manifestCache = new Map();
      _manifestCallbacks.forEach(cb => cb(_manifestCache));
      _manifestCallbacks = [];
      return _manifestCache;
    });
};

// 判斷是否為 NAS 圖片
const isNASImage = (src) => src && src.includes('/nas-images/');

// 取得 NAS 高解析度 URL（thumbnail → 原圖）
const getNASHighResUrl = (src) => {
  if (!src) return src;
  // -thumb.webp → .webp (高解析度也是 webp 格式)
  return src.replace(/-thumb\.webp$/, '.webp');
};

// 取得內文用的顯示 URL（thumbnail → 高解析度，讓文章內圖片清晰）
const getNASDisplayUrl = (src) => {
  if (!src || !isNASImage(src)) return src;
  // 如果是 thumbnail，改用高解析度版本
  if (src.includes('-thumb.webp')) {
    return src.replace(/-thumb\.webp$/, '.webp');
  }
  return src;
};

// 獨立的圖片包裝組件
export const BlogImage = ({ src, alt, ...props }) => {
  const [showLightbox, setShowLightbox] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [exifData, setExifData] = useState(null);
  const isNAS = isNASImage(src);

  // 內文顯示用高解析度
  const displaySrc = getNASDisplayUrl(src);
  // 點擊放大用原圖
  const fullSrc = isNAS ? getNASHighResUrl(src) : src;

  // 載入 EXIF 資訊
  useEffect(() => {
    if (!isNAS) return;
    fetchManifest().then(map => {
      // 嘗試用 thumbnail URL 或高解析度 URL 查詢
      const photo = map.get(src) || map.get(getNASHighResUrl(src));
      if (photo?.exif) setExifData(photo.exif);
    });
  }, [src, isNAS]);

  return (
    <>
      <span
        className="blog-image-wrapper"
        onMouseEnter={() => setShowInfo(true)}
        onMouseLeave={() => setShowInfo(false)}
      >
        <img
          src={displaySrc}
          alt={alt || ''}
          onClick={() => setShowLightbox(true)}
          className="blog-image-clickable"
          loading="lazy"
          decoding="async"
          {...props}
        />
        {/* NAS 圖片 hover overlay — 顯示完整 EXIF */}
        {isNAS && showInfo && exifData && (
          <span className="blog-image-exif">
            {(exifData.make || exifData.model || exifData.LensModel) && (
              <span>📷 {exifData.make && exifData.model ? `${exifData.make} ${exifData.model}` : (exifData.model || exifData.LensModel?.split(' back ')[0] || '')}</span>
            )}
            {exifData.FNumber && <span>⊙ {exifData.FNumber}</span>}
            {exifData.ISO != null && <span>◎ ISO {exifData.ISO}</span>}
            {exifData.ExposureTime && <span>⏱ {exifData.ExposureTime}s</span>}
            {(exifData.FocalLength || exifData.FocalLengthIn35mmFormat) && <span>⊕ {exifData.FocalLengthIn35mmFormat ? `${exifData.FocalLengthIn35mmFormat.replace(' mm', 'mm')} (等效)` : exifData.FocalLength}</span>}
            {exifData.DateTimeOriginal && <span>📅 {exifData.DateTimeOriginal.split(' ')[0].replace(/:/g, '-')}</span>}
          </span>
        )}
      </span>
      {showLightbox && (
        <ImageLightbox src={fullSrc} alt={alt} onClose={() => setShowLightbox(false)} />
      )}
    </>
  );
};

// Lightbox 主組件 — 使用 Portal 渲染到 body
function ImageLightbox({ src, alt, onClose }) {
  const closingRef = useRef(false);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose();
  }, [onClose]);

  useEffect(() => {
    // 滾動立即關閉 — 不 preventDefault，不會卡頓
    const handleWheel = () => handleClose();
    const handleScroll = () => handleClose();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleClose();
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleClose]);

  // 用 Portal 渲染到 body，確保 fixed 定位在全頁面正中央
  return ReactDOM.createPortal(
    <AnimatePresence>
      <motion.div
        className="image-lightbox-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={handleClose}
      >
        <motion.img
          src={src}
          alt={alt || ''}
          className="image-lightbox-img"
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.85, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          onClick={(e) => e.stopPropagation()}
        />
        <button className="image-lightbox-close" onClick={handleClose}>
          <FaTimes />
        </button>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

export default ImageLightbox;
