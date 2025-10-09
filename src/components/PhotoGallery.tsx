import { useMemo, useCallback, useState, memo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Masonry } from 'masonic';
import { Blurhash } from 'react-blurhash';
import { useInView } from 'react-intersection-observer';
import { useSetAtom } from 'jotai';
import { photosAtom, openViewerAtom } from '../store/photoStore';
import PhotoViewer from './PhotoViewer.tsx';
import { loadPhotosManifest } from '../utils/manifestLoader';
import './PhotoGallery.css';
import type { PhotoManifest, MasonryItemType } from '../types/photo';
import { MasonryHeaderItem } from '../types/photo';

// 照片項目組件
const PhotoItem = memo(({ data, width, onPhotoClick }: { 
  data: PhotoManifest; 
  width: number;
  onPhotoClick: (photo: PhotoManifest) => void;
}) => {
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
  });
  
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const displayDate = data.exif?.DateTimeOriginal?.split(' ')[0].split(':').slice(1).join('/') || '';
  const displayYear = data.exif?.DateTimeOriginal?.split(':')[0] || '';
  const calculatedHeight = width / data.aspectRatio;

  return (
    <motion.div
      ref={ref}
      className="photo-masonry-item group"
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6 }}
      style={{ width }}
      onClick={() => onPhotoClick(data)}
    >
      <div 
        className="photo-card relative overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800 cursor-pointer"
        style={{ height: calculatedHeight }}
      >
        {/* Blurhash 佔位符 */}
        {data.blurhash && !imageLoaded && !imageError && (
          <Blurhash
            hash={data.blurhash}
            width="100%"
            height="100%"
            resolutionX={32}
            resolutionY={32}
            punch={1}
            className="absolute inset-0"
          />
        )}

        {/* 實際圖片 */}
        {inView && !imageError && (
          <img 
            src={data.thumbnailUrl} 
            alt={data.title}
            className={`photo-image absolute inset-0 w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            loading="lazy"
            decoding="async"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        )}

        {/* 錯誤狀態 */}
        {imageError && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">圖片載入失敗</p>
            </div>
          </div>
        )}
        
        {/* 懸停信息層 */}
        <div className="photo-info-overlay absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
            <p className="photo-date text-2xl font-bold">{displayDate}</p>
            <p className="photo-year text-lg opacity-80">{displayYear}</p>
            {data.tags && data.tags.length > 0 && (
              <div className="flex gap-2 mt-2">
                {data.tags.map((tag) => (
                  <span key={tag} className="px-2 py-1 text-xs bg-white/20 rounded-full backdrop-blur-sm">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
});

PhotoItem.displayName = 'PhotoItem';

// 頭部組件
const GalleryHeader = memo(({ style, photoCount }: { style?: React.CSSProperties, photoCount: number }) => (
  <motion.div
    className="gallery-header-card bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8 border border-gray-200 dark:border-gray-800"
    style={style}
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.6 }}
  >
    <div className="text-center">
      <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">攝影作品集錦</h2>
      <p className="text-lg text-gray-600 dark:text-gray-400 italic mb-4">Personal Photography Collection</p>
      <div className="flex items-center justify-center gap-4 text-sm text-gray-500 dark:text-gray-500">
        <span className="flex items-center gap-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {photoCount} 張照片
        </span>
      </div>
    </div>
  </motion.div>
));

GalleryHeader.displayName = 'GalleryHeader';

function PhotoGallery() {
  const setPhotosAtom = useSetAtom(photosAtom);
  const openViewer = useSetAtom(openViewerAtom);
  const [photos, setPhotos] = useState<PhotoManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 載入照片資料
  useEffect(() => {
    async function loadPhotos() {
      try {
        setLoading(true);
        const loadedPhotos = await loadPhotosManifest();
        setPhotos(loadedPhotos);
        setPhotosAtom(loadedPhotos);
        setError(null);
      } catch (err) {
        console.error('載入照片失敗:', err);
        setError('載入照片失敗,請稍後再試');
      } finally {
        setLoading(false);
      }
    }

    loadPhotos();
  }, [setPhotosAtom]);

  // 照片點擊處理
  const handlePhotoClick = useCallback((photo: PhotoManifest) => {
    openViewer(photo);
  }, [openViewer]);

  // 準備 Masonry 數據
  const masonryItems: MasonryItemType[] = useMemo(() => {
    return [MasonryHeaderItem.default, ...photos];
  }, [photos]);

  // Masonry 渲染器
  const renderMasonryItem = useCallback(({ data, width }: { data: MasonryItemType; width: number }) => {
    if (data instanceof MasonryHeaderItem) {
      return <GalleryHeader style={{ width }} photoCount={photos.length} />;
    }
    
    return <PhotoItem data={data as PhotoManifest} width={width} onPhotoClick={handlePhotoClick} />;
  }, [handlePhotoClick, photos.length]);

  // 載入中狀態
  if (loading) {
    return (
      <section className="photo-gallery-section min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="spinner mb-4 mx-auto"></div>
          <p className="text-lg text-gray-600 dark:text-gray-400">載入照片中...</p>
        </div>
      </section>
    );
  }

  // 錯誤狀態
  if (error) {
    return (
      <section className="photo-gallery-section min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">😕</div>
          <p className="text-lg text-red-600 dark:text-red-400">{error}</p>
        </div>
      </section>
    );
  }

  return (
    <section id="photo-gallery" className="photo-gallery-section min-h-screen py-20 px-4 lg:px-8">
      {/* 返回按鈕 */}
      <Link 
        to="/" 
        className="back-button fixed top-24 left-8 z-50 flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 border border-gray-200 dark:border-gray-800"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span className="font-medium">返回主頁</span>
      </Link>

      {/* Masonry 瀑布流佈局 */}
      <div className="masonry-container max-w-7xl mx-auto">
        <Masonry
          items={masonryItems}
          render={renderMasonryItem}
          columnWidth={300}
          columnGutter={16}
          rowGutter={16}
          overscanBy={2}
        />
      </div>

      {/* Instagram 連結 */}
      <motion.div 
        className="instagram-link-container text-center mt-16 mb-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <a
          href="https://www.instagram.com/koimsurai.23/?hl=zh-tw"
          target="_blank"
          rel="noopener noreferrer"
          className="instagram-link inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
          </svg>
          <span>想看更多請點我</span>
        </a>
      </motion.div>

      {/* 照片查看器 */}
      <PhotoViewer />
    </section>
  );
}

export default PhotoGallery;