/**
 * Photo Builder Configuration
 * 照片構建器配置檔案
 */

import type { BuilderConfig } from './scripts/builder/config';

const config: BuilderConfig = {
  // 照片來源
  source: {
    type: 'local',
    path: './photos', // 請將您的照片放在這個資料夾
    // excludeRegex: '\\.(DS_Store|thumbs.db)$', // 排除系統檔案
  },

  // 輸出設定
  output: {
    directory: './public/generated', // 生成的圖片存放位置
    manifestPath: './public/photos-manifest.json', // manifest 檔案位置
  },

  // 圖片處理設定
  processing: {
    // 縮圖設定 (用於照片牆)
    thumbnail: {
      width: 600, // 縮圖寬度
      quality: 80, // WebP 品質 (1-100)
      format: 'webp', // 使用 WebP 格式以獲得最佳壓縮
    },

    // 高解析度圖片設定 (用於全螢幕查看)
    highRes: {
      maxWidth: 2400, // 最大寬度 2400px
      quality: 85, // JPEG 品質
      format: 'jpeg', // 使用 JPEG 以保持品質
    },

    // 功能開關
    enableThumbHash: true, // 啟用 ThumbHash 佔位符
    enableLivePhoto: true, // 啟用 Live Photo 支援 (未來實現)
  },
};

export default config;
