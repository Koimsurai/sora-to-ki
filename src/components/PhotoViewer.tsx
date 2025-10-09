/**
 * PhotoViewer - 全螢幕照片查看器 (Afilmory 風格)
 * 支援 Swiper 輪播、模糊背景、底部縮圖導覽、右側 EXIF 面板
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { motion, AnimatePresence } from 'framer-motion';
import { useKey } from 'react-use';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Keyboard, Zoom, Thumbs } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
import {
  selectedPhotoAtom,
  viewerOpenAtom,
  closeViewerAtom,
  photosAtom,
  currentIndexAtom,
} from '../store/photoStore';
import ProgressiveImage from './ProgressiveImage';
import GalleryThumbnail from './GalleryThumbnail';
import EXIFPanel from './EXIFPanel';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/zoom';
import './PhotoViewer.css';

const PhotoViewer: React.FC = () => {
  const isOpen = useAtomValue(viewerOpenAtom);
  const selectedPhoto = useAtomValue(selectedPhotoAtom);
  const photos = useAtomValue(photosAtom);
  const [currentIndex, setCurrentIndex] = useAtom(currentIndexAtom);
  const closeViewer = useSetAtom(closeViewerAtom);
  
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);
  const [mainSwiper, setMainSwiper] = useState<SwiperType | null>(null);
  const [currentPhoto, setCurrentPhoto] = useState(selectedPhoto);
  const mainContainerRef = useRef<HTMLDivElement>(null);

  // 鍵盤快捷鍵
  useKey('Escape', closeViewer);

  // 滾輪縮放處理
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (mainSwiper && mainSwiper.zoom) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.2 : 0.2;
        const currentZoom = mainSwiper.zoom.scale || 1;
        const newZoom = Math.max(1, Math.min(5, currentZoom + delta));
        mainSwiper.zoom.in(newZoom);
      }
    };

    const container = mainContainerRef.current;
    if (container && isOpen) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [isOpen, mainSwiper]);

  // 重置狀態當檢視器關閉
  useEffect(() => {
    if (!isOpen) {
      setThumbsSwiper(null);
      setMainSwiper(null);
    }
  }, [isOpen]);

  // 更新當前照片
  useEffect(() => {
    if (photos.length > 0 && currentIndex >= 0 && currentIndex < photos.length) {
      setCurrentPhoto(photos[currentIndex]);
    }
  }, [currentIndex, photos]);

  // 初始化 Swiper 索引
  useEffect(() => {
    if (isOpen && mainSwiper && selectedPhoto) {
      const index = photos.findIndex((p) => p.id === selectedPhoto.id);
      if (index !== -1) {
        mainSwiper.slideTo(index, 0);
        setCurrentIndex(index);
      }
    }
  }, [isOpen, mainSwiper, selectedPhoto, photos, setCurrentIndex]);

  if (!isOpen || !currentPhoto) return null;

  // 處理 Swiper 滑動
  const handleSlideChange = (swiper: SwiperType) => {
    setCurrentIndex(swiper.activeIndex);
  };

  // 處理縮圖點擊
  const handleThumbnailClick = (index: number) => {
    mainSwiper?.slideTo(index);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="photo-viewer-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* 模糊背景 */}
        <div
          className="photo-viewer-background"
          style={{
            backgroundImage: `url(${currentPhoto.urls.thumb || currentPhoto.urls.small})`,
          }}
        />

        {/* 頂部照片資訊 */}
        <div className="photo-viewer-info" onClick={(e) => e.stopPropagation()}>
          <div className="photo-title">
            照片 {currentPhoto.exif?.DateTimeOriginal || currentPhoto.title || currentPhoto.id}
          </div>
        </div>

        {/* 主圖輪播區域 */}
        <div className="photo-viewer-main" ref={mainContainerRef}>
          {/* 圖片區域右上方按鈕組 */}
          <div className="image-action-buttons" onClick={(e) => e.stopPropagation()}>
            {/* 分享按鈕 */}
            <button
              className="action-btn action-btn-share"
              onClick={(e) => {
                e.stopPropagation();
                // TODO: 實現分享功能
                if (navigator.share) {
                  navigator.share({
                    title: currentPhoto.title || '照片分享',
                    text: `查看我的照片作品`,
                    url: window.location.href,
                  }).catch(() => {});
                }
              }}
              title="分享"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>

            {/* 關閉按鈕 */}
            <button
              className="action-btn action-btn-close"
              onClick={(e) => {
                e.stopPropagation();
                closeViewer();
              }}
              title="關閉 (ESC)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* 自定義導航按鈕 */}
          <button className="custom-swiper-button-prev" onClick={(e) => e.stopPropagation()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button className="custom-swiper-button-next" onClick={(e) => e.stopPropagation()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          <Swiper
            onSwiper={setMainSwiper}
            spaceBetween={10}
            navigation={{
              prevEl: '.custom-swiper-button-prev',
              nextEl: '.custom-swiper-button-next',
            }}
            keyboard={{
              enabled: true,
            }}
            zoom={{
              maxRatio: 5,
              minRatio: 1,
            }}
            thumbs={thumbsSwiper && !thumbsSwiper.destroyed ? { swiper: thumbsSwiper } : undefined}
            modules={[Navigation, Keyboard, Zoom, Thumbs]}
            onSlideChange={handleSlideChange}
            className="main-swiper"
          >
            {photos.map((photo) => (
              <SwiperSlide key={photo.id}>
                <div className="swiper-zoom-container">
                  <ProgressiveImage
                    src={photo.urls.regular || photo.urls.full}
                    thumbSrc={photo.urls.thumb || photo.urls.small}
                    alt={photo.title || ''}
                    thumbHash={photo.thumbHash}
                  />
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>

        {/* 底部縮圖導覽列 */}
        <GalleryThumbnail
          photos={photos}
          activeIndex={currentIndex}
          onThumbnailClick={handleThumbnailClick}
          thumbsSwiper={thumbsSwiper}
          onSwiper={setThumbsSwiper}
        />

        {/* 右側 EXIF 資訊面板 - 常駐顯示 */}
        <EXIFPanel photo={currentPhoto} />
      </motion.div>
    </AnimatePresence>
  );
};

export default PhotoViewer;
