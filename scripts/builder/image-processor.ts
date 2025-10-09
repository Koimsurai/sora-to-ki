/**
 * Image Processor
 * 照片處理器 - 生成縮圖、高解析度圖片、ThumbHash
 */

import sharp from 'sharp';
import { rgbaToThumbHash } from 'thumbhash';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BuilderConfig } from './config';

export interface ProcessedImage {
  thumbnailPath: string;
  thumbnailUrl: string;
  highResPath: string;
  highResUrl: string;
  thumbHash?: string;
  width: number;
  height: number;
  size: number;
  format: string;
}

/**
 * 處理單張照片
 */
export async function processImage(
  inputPath: string,
  outputDir: string,
  config: BuilderConfig
): Promise<ProcessedImage> {
  const fileName = path.basename(inputPath, path.extname(inputPath));
  const stats = await fs.stat(inputPath);

  // 確保輸出目錄存在
  await fs.mkdir(outputDir, { recursive: true });

  // 讀取原始圖片
  let image = sharp(inputPath);
  const metadata = await image.metadata();

  // 處理 HEIC 格式
  if (inputPath.toLowerCase().endsWith('.heic')) {
    // Sharp 本身支援 HEIC,但可能需要額外配置
    console.log(`📸 處理 HEIC 格式: ${fileName}`);
  }

  // 自動旋轉 (根據 EXIF Orientation)
  image = image.rotate();

  const originalWidth = metadata.width || 0;
  const originalHeight = metadata.height || 0;

  // 1. 生成縮圖
  const thumbnailFileName = `${fileName}-thumb.${config.processing.thumbnail.format}`;
  const thumbnailPath = path.join(outputDir, thumbnailFileName);

  await image
    .clone()
    .resize(config.processing.thumbnail.width, null, {
      withoutEnlargement: true,
      fit: 'inside',
    })
    [config.processing.thumbnail.format]({
      quality: config.processing.thumbnail.quality,
    })
    .toFile(thumbnailPath);

  console.log(`✅ 縮圖生成: ${thumbnailFileName}`);

  // 2. 生成高解析度圖片
  const highResFileName = `${fileName}.${config.processing.highRes.format}`;
  const highResPath = path.join(outputDir, highResFileName);

  await image
    .clone()
    .resize(config.processing.highRes.maxWidth, null, {
      withoutEnlargement: true,
      fit: 'inside',
    })
    [config.processing.highRes.format]({
      quality: config.processing.highRes.quality,
    })
    .toFile(highResPath);

  console.log(`✅ 高解析度圖片生成: ${highResFileName}`);

  // 3. 生成 ThumbHash
  let thumbHash: string | undefined;

  if (config.processing.enableThumbHash) {
    try {
      // 生成極小的圖片用於 ThumbHash
      const thumbHashImage = await image
        .clone()
        .resize(100, 100, { fit: 'inside' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const { data, info } = thumbHashImage;
      const hash = rgbaToThumbHash(info.width, info.height, data);
      thumbHash = Buffer.from(hash).toString('base64');

      console.log(`✅ ThumbHash 生成: ${fileName}`);
    } catch (error) {
      console.error(`❌ ThumbHash 生成失敗: ${fileName}`, error);
    }
  }

  return {
    thumbnailPath,
    thumbnailUrl: `/generated/${thumbnailFileName}`,
    highResPath,
    highResUrl: `/generated/${highResFileName}`,
    thumbHash,
    width: originalWidth,
    height: originalHeight,
    size: stats.size,
    format: metadata.format || 'unknown',
  };
}

/**
 * 支援的圖片格式
 */
export const SUPPORTED_FORMATS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.tiff',
  '.tif',
  '.heic',
  '.heif',
];

/**
 * 檢查檔案是否為支援的圖片格式
 */
export function isSupportedImageFormat(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_FORMATS.includes(ext);
}
