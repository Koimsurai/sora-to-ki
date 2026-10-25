import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { loadPhotosManifest } from '@/lib/manifestLoader';
import { exifYmd } from '../../lib/exifDate';
import type { PhotoManifest } from '../../types/photo';
import { toast } from 'sonner';
import { authHeaders, readToken } from '@/lib/authToken';
import AdminLoading from './AdminLoading';
import './AdminPicker.css';

interface PhotoSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (photo: PhotoManifest) => void;
}

const PhotoSelectorModal = ({ isOpen, onClose, onSelect }: PhotoSelectorModalProps) => {
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
      toast.error('請先登入後台再同步');
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
        throw new Error(data.error ?? '同步失敗');
      }

      toast.success(`同步完成：新增 ${data.processed ?? 0}，略過 ${data.skipped ?? 0}`);
      await refetch();
    } catch (err) {
      console.error('NAS sync failed:', err);
      toast.error(`同步失敗：${err instanceof Error ? err.message : '未知錯誤'}`);
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
              從 NAS 選照片
              <span className="adm-picker-count">{photos.length} 張</span>
            </h3>
            <button
              type="button"
              onClick={() => {
                void handleSync();
              }}
              disabled={syncing || loading}
              className="adm-btn adm-btn-small"
            >
              {syncing ? '同步中' : '同步 NAS'}
            </button>
            <button type="button" onClick={onClose} className="adm-icon-btn" aria-label="關閉">
              <X className="size-3.5" />
            </button>
          </div>

          <div className="adm-picker-search">
            <label className="adm-prompt">
              <Search className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <input
                type="text"
                placeholder="搜尋標題、描述或標籤"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="搜尋照片"
                // modal 打開就是為了搜尋照片，焦點直接進搜尋框
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
            </label>
          </div>

          <div className="adm-picker-body">
            {loading ? (
              <AdminLoading label="從 NAS 讀照片" />
            ) : filteredPhotos.length === 0 ? (
              <p className="adm-picker-empty">沒有符合的照片</p>
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
            <span>{filteredPhotos.length} 張</span>
            <span>點一張插入文章</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PhotoSelectorModal;
