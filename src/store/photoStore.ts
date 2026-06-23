/**
 * Photo Gallery State Management with Jotai
 * 照片牆全域狀態管理
 */

import { atom } from 'jotai';
import { atomWithReset } from 'jotai/utils';
import type { PhotoManifest } from '../types/photo';

/**
 * 當前選中的照片
 */
export const selectedPhotoAtom = atomWithReset<PhotoManifest | null>(null);

/**
 * 當前選中照片的索引
 */
export const selectedPhotoIndexAtom = atomWithReset<number>(-1);

/**
 * 當前照片索引 (用於 Swiper)
 */
export const currentIndexAtom = atomWithReset<number>(0);

/**
 * 照片查看器開啟狀態
 */
export const viewerOpenAtom = atomWithReset<boolean>(false);

/**
 * 照片清單
 */
export const photosAtom = atomWithReset<PhotoManifest[]>([]);

/**
 * EXIF 面板開啟狀態
 */
export const exifPanelOpenAtom = atomWithReset<boolean>(false);

/**
 * 照片縮放等級
 */
export const zoomLevelAtom = atomWithReset<number>(1);

/**
 * 照片平移位置
 */
export const panPositionAtom = atomWithReset<{ x: number; y: number }>({ x: 0, y: 0 });

/**
 * 載入狀態
 */
export const loadingAtom = atomWithReset<boolean>(false);

/**
 * Derived Atom: 取得下一張照片
 */
export const nextPhotoAtom = atom(
  (get) => {
    const photos = get(photosAtom);
    const currentIndex = get(selectedPhotoIndexAtom);
    if (currentIndex >= 0 && currentIndex < photos.length - 1) {
      return photos[currentIndex + 1];
    }
    return null;
  }
);

/**
 * Derived Atom: 取得上一張照片
 */
export const prevPhotoAtom = atom(
  (get) => {
    const photos = get(photosAtom);
    const currentIndex = get(selectedPhotoIndexAtom);
    if (currentIndex > 0) {
      return photos[currentIndex - 1];
    }
    return null;
  }
);

/**
 * Action: 開啟照片查看器
 */
export const openViewerAtom = atom(
  null,
  (get, set, photo: PhotoManifest) => {
    const photos = get(photosAtom);
    const index = photos.findIndex(p => p.id === photo.id);
    
    set(selectedPhotoAtom, photo);
    set(selectedPhotoIndexAtom, index);
    set(viewerOpenAtom, true);
    set(zoomLevelAtom, 1);
    set(panPositionAtom, { x: 0, y: 0 });
  }
);

/**
 * Action: 關閉照片查看器
 */
export const closeViewerAtom = atom(
  null,
  (_get, set) => {
    set(viewerOpenAtom, false);
    set(selectedPhotoAtom, null);
    set(selectedPhotoIndexAtom, -1);
    set(exifPanelOpenAtom, false);
  }
);

/**
 * Action: 切換到下一張照片
 */
export const nextPhotoActionAtom = atom(
  null,
  (get, set) => {
    const nextPhoto = get(nextPhotoAtom);
    if (nextPhoto) {
      const photos = get(photosAtom);
      const index = photos.findIndex(p => p.id === nextPhoto.id);
      set(selectedPhotoAtom, nextPhoto);
      set(selectedPhotoIndexAtom, index);
      set(zoomLevelAtom, 1);
      set(panPositionAtom, { x: 0, y: 0 });
    }
  }
);

/**
 * Action: 切換到上一張照片
 */
export const prevPhotoActionAtom = atom(
  null,
  (get, set) => {
    const prevPhoto = get(prevPhotoAtom);
    if (prevPhoto) {
      const photos = get(photosAtom);
      const index = photos.findIndex(p => p.id === prevPhoto.id);
      set(selectedPhotoAtom, prevPhoto);
      set(selectedPhotoIndexAtom, index);
      set(zoomLevelAtom, 1);
      set(panPositionAtom, { x: 0, y: 0 });
    }
  }
);
