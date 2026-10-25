/**
 * EXIFPanel - EXIF 資訊面板
 * 顯示詳細的照片 EXIF 資訊和元數據
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { ExifValue } from '@koimsurai/api-types';
import { exifDateTimeText } from '@/lib/exifDate';
import type { PhotoManifest } from '@/types/photo';
import './EXIFPanel.css';

interface EXIFPanelProps {
  photo: PhotoManifest;
}

/**
 * 這張照片在目前語系下該顯示哪一組標籤：manifest 有 `tags`（中文）與 `tagsEn`（英文，RAM++ 產的）。
 * 日韓沒有自己的標籤資料，退到英文而不是留中文——中文對日韓讀者是「看得懂字但不是自己的語言」。
 * 沒有英文標籤的照片維持原樣
 */
function tagsFor(photo: PhotoManifest, locale: string): string[] {
  if (locale === 'zh-TW' || locale === 'zh-CN') return photo.tags ?? [];
  const en = photo.tagsEn ?? [];
  return en.length > 0 ? en : (photo.tags ?? []);
}

const EXIFPanel = memo(({ photo }: EXIFPanelProps) => {
  const { t, i18n } = useTranslation();
  const tags = tagsFor(photo, i18n.language);
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // 原本是 `new Date(dateString)` 直接丟進 toLocaleString：manifest 裡多數是 exiftool
  // 的 "2023:04:27 10:56:22"，new Date 給 Invalid Date，而 toLocaleString 對 Invalid Date
  // **不會 throw**（回字串 "Invalid Date"），所以那個 try/catch 從來沒接到過東西。
  const formatDate = (dateString?: string | null): string => exifDateTimeText(dateString) ?? dateString ?? 'N/A';

  // EXIF 數值在 manifest 裡有兩種形狀：舊 Node builder 寫 exiftool 的格式化字串
  // （"1/640"、"f/1.4"、"32 mm"），Rust 的 sync 寫數字。之前型別只標 string，三個
  // formatter 都是照字串寫的，碰到字串反而算錯：
  //   parseFloat("1/640") === 1 → 顯示「1s」（實際是 1/640 秒）
  //   formatAperture("f/1.4")   → 顯示「f/f/1.4」
  //   {FocalLength}mm           → "32 mm" 顯示成「32 mmmm」
  const formatExposureTime = (time?: ExifValue | null): string => {
    if (time === null || time === undefined) return 'N/A';
    if (typeof time === 'string') return time.endsWith('s') ? time : `${time}s`;
    if (time >= 1) return `${time}s`;
    return `1/${Math.round(1 / time)}s`;
  };

  const formatAperture = (aperture?: ExifValue | null): string => {
    if (aperture === null || aperture === undefined) return 'N/A';
    return typeof aperture === 'string' ? aperture : `f/${aperture}`;
  };

  const formatFocalLength = (len?: ExifValue | null): string => {
    if (len === null || len === undefined) return '';
    return typeof len === 'string' ? len : `${len}mm`;
  };

  return (
    <motion.div
      className="exif-panel"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
    >
      <div className="exif-panel-content">
        {/* 標題 */}
        <div className="exif-section">
          <h3 className="exif-section-title">{t('photos.exif.info')}</h3>
          {photo.title && (
            <div className="exif-row">
              <span className="exif-label">{t('photos.exif.title')}</span>
              <span className="exif-value">{photo.title}</span>
            </div>
          )}
          {photo.description && (
            <div className="exif-row">
              <span className="exif-label">{t('photos.exif.description')}</span>
              <span className="exif-value">{photo.description}</span>
            </div>
          )}
        </div>

        {/* 基本資訊 */}
        <div className="exif-section">
          <h3 className="exif-section-title">{t('photos.exif.basic')}</h3>
          <div className="exif-row">
            <span className="exif-label">{t('photos.exif.size')}</span>
            <span className="exif-value">
              {photo.width} × {photo.height}
            </span>
          </div>
          <div className="exif-row">
            <span className="exif-label">{t('photos.exif.fileSize')}</span>
            <span className="exif-value">{formatFileSize(photo.size)}</span>
          </div>
          {photo.format && (
            <div className="exif-row">
              <span className="exif-label">{t('photos.exif.format')}</span>
              <span className="exif-value">{photo.format.toUpperCase()}</span>
            </div>
          )}
          <div className="exif-row">
            <span className="exif-label">{t('photos.exif.ratio')}</span>
            <span className="exif-value">{photo.aspectRatio.toFixed(2)}</span>
          </div>
        </div>

        {/* 相機資訊 */}
        {photo.exif && (
          <div className="exif-section">
            <h3 className="exif-section-title">{t('photos.exif.camera')}</h3>
            {photo.exif.make && (
              <div className="exif-row">
                <span className="exif-label">{t('photos.exif.make')}</span>
                <span className="exif-value">{photo.exif.make}</span>
              </div>
            )}
            {photo.exif.model && (
              <div className="exif-row">
                <span className="exif-label">{t('photos.exif.model')}</span>
                <span className="exif-value">{photo.exif.model}</span>
              </div>
            )}
            {photo.exif.LensModel && (
              <div className="exif-row">
                <span className="exif-label">{t('photos.exif.lens')}</span>
                <span className="exif-value">{photo.exif.LensModel}</span>
              </div>
            )}
          </div>
        )}

        {/* 拍攝參數 */}
        {photo.exif && (
          <div className="exif-section">
            <h3 className="exif-section-title">{t('photos.exif.shooting')}</h3>
            {photo.exif.FocalLength && (
              <div className="exif-row">
                <span className="exif-label">{t('photos.exif.focal')}</span>
                <span className="exif-value">
                  {formatFocalLength(photo.exif.FocalLength)}
                  {photo.exif.FocalLengthIn35mmFormat && ` (${formatFocalLength(photo.exif.FocalLengthIn35mmFormat)})`}
                </span>
              </div>
            )}
            {photo.exif.FNumber && (
              <div className="exif-row">
                <span className="exif-label">{t('photos.exif.aperture')}</span>
                <span className="exif-value">{formatAperture(photo.exif.FNumber)}</span>
              </div>
            )}
            {photo.exif.ExposureTime && (
              <div className="exif-row">
                <span className="exif-label">{t('photos.exif.shutter')}</span>
                <span className="exif-value">{formatExposureTime(photo.exif.ExposureTime)}</span>
              </div>
            )}
            {photo.exif.ISO && (
              <div className="exif-row">
                <span className="exif-label">ISO</span>
                <span className="exif-value">ISO {photo.exif.ISO}</span>
              </div>
            )}
            {photo.exif.Flash && (
              <div className="exif-row">
                <span className="exif-label">{t('photos.exif.flash')}</span>
                <span className="exif-value">{photo.exif.Flash}</span>
              </div>
            )}
            {photo.exif.WhiteBalance && (
              <div className="exif-row">
                <span className="exif-label">{t('photos.exif.whiteBalance')}</span>
                <span className="exif-value">{photo.exif.WhiteBalance}</span>
              </div>
            )}
            {photo.exif.DateTimeOriginal && (
              <div className="exif-row">
                <span className="exif-label">{t('photos.exif.taken')}</span>
                <span className="exif-value">{formatDate(photo.exif.DateTimeOriginal)}</span>
              </div>
            )}
          </div>
        )}

        {/* GPS 資訊 */}
        {photo.gps && (
          <div className="exif-section">
            <h3 className="exif-section-title">{t('photos.exif.location')}</h3>
            <div className="exif-row">
              <span className="exif-label">{t('photos.exif.lat')}</span>
              <span className="exif-value">{photo.gps.latitude.toFixed(6)}°</span>
            </div>
            <div className="exif-row">
              <span className="exif-label">{t('photos.exif.lng')}</span>
              <span className="exif-value">{photo.gps.longitude.toFixed(6)}°</span>
            </div>
            {photo.gps.altitude && (
              <div className="exif-row">
                <span className="exif-label">{t('photos.exif.altitude')}</span>
                <span className="exif-value">{photo.gps.altitude.toFixed(0)}m</span>
              </div>
            )}
          </div>
        )}

        {/* 標籤 */}
        {tags.length > 0 && (
          <div className="exif-section">
            <h3 className="exif-section-title">{t('photos.exif.tags')}</h3>
            <div className="exif-tags">
              {tags.map((tag) => (
                <span key={tag} className="exif-tag">
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
});

EXIFPanel.displayName = 'EXIFPanel';

export default EXIFPanel;
