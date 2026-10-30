import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { loadPhotosManifest } from '@/lib/manifestLoader';
import { exifYmd } from '../../lib/exifDate';
import type { PhotoManifest } from '../../types/photo';
import { toast } from 'sonner';
import { authHeaders, readToken } from '@/lib/authToken';
import { useAdminT } from '@/i18n/admin-i18n';
import AdminLoading from './AdminLoading';
import './AdminPicker.css';

interface PhotoSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (photo: PhotoManifest) => void;
}

const PhotoSelectorModal = ({ isOpen, onClose, onSelect }: PhotoSelectorModalProps) => {
  const { t } = useAdminT();
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // 照片 manifest 改由 TanStack Query 讀（開啟才抓）；同步後 refetch。
  const {
    data: photos = [],
    isFetching: loading,
    refetch,
  } = useQuery({
    queryKey: ['photos', 'manifest'],
    queryFn: loadPhotosManifest,
    enabled: isOpen,
    staleTime: 60 * 1000,
  });

  const handleSync = async () => {
    if (syncing) return;

    if (!readToken()) {
      toast.error(t('photos.picker.loginFirst'));
      return;
    }

    setSyncing(true);
    try {
      const response = await fetch('/api/admin/gallery/sync', {
        method: 'POST',
        headers: authHeaders(),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        processed?: number;
        skipped?: number;
      };
      if (!response.ok) {
        throw new Error(data.error ?? t('photos.picker.syncFailed'));
      }

      toast.success(t('photos.picker.syncComplete', { processed: data.processed ?? 0, skipped: data.skipped ?? 0 }));
      await refetch();
    } catch (err) {
      console.error('NAS sync failed:', err);
      toast.error(
        t('photos.syncFailed', { error: err instanceof Error ? err.message : t('photos.picker.unknownError') }),
      );
    } finally {
      setSyncing(false);
    }
  };

  const filteredPhotos = useMemo(() => {
    if (!searchTerm) return photos;
    const lower = searchTerm.toLowerCase();
    return photos.filter(
      (p) =>
        p.title.toLowerCase().includes(lower) ||
        (p.description?.toLowerCase().includes(lower) ?? false) ||
        (p.tags?.some((t) => t.toLowerCase().includes(lower)) ?? false),
    );
  }, [photos, searchTerm]);

  // Handle click outside to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="adm-picker-scrim fixed inset-0 z-9999 flex items-center justify-center p-4"
        onClick={handleBackdropClick}
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="adm-picker w-full max-w-6xl h-[85vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="adm-picker-head">
            <h3 className="adm-picker-title">
              {t('photos.picker.title')}
              <span className="adm-picker-count">{t('photos.count', { count: photos.length })}</span>
            </h3>
            <button
              type="button"
              onClick={() => {
                void handleSync();
              }}
              disabled={syncing || loading}
              className="adm-btn adm-btn-small"
            >
              {syncing ? t('photos.syncing') : t('photos.picker.syncNas')}
            </button>
            <button type="button" onClick={onClose} className="adm-icon-btn" aria-label={t('photos.picker.close')}>
              <X className="size-3.5" />
            </button>
          </div>

          <div className="adm-picker-search">
            <label className="adm-prompt">
              <Search className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <input
                type="text"
                placeholder={t('photos.picker.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label={t('photos.picker.searchLabel')}
                // modal 打開就是為了搜尋照片，焦點直接進搜尋框
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
            </label>
          </div>

          <div className="adm-picker-body">
            {loading ? (
              <AdminLoading label={t('photos.picker.loading')} />
            ) : filteredPhotos.length === 0 ? (
              <p className="adm-picker-empty">{t('photos.picker.empty')}</p>
            ) : (
              <div className="adm-picker-grid">
                {filteredPhotos.map((photo) => {
                  const dateStr = exifYmd(photo.exif?.DateTimeOriginal);

                  return (
                    <button type="button" key={photo.id} onClick={() => onSelect(photo)} className="adm-picker-photo">
                      <img src={photo.thumbnailUrl} alt={photo.title} loading="lazy" decoding="async" />
                      <span className="adm-picker-photo-caption">
                        <span className="adm-picker-photo-title">{photo.title}</span>
                        {dateStr && <span className="adm-picker-photo-date">{dateStr}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="adm-picker-foot">
            <span>{t('photos.count', { count: filteredPhotos.length })}</span>
            <span>{t('photos.picker.clickToInsert')}</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PhotoSelectorModal;
