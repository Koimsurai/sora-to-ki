/**
 * Photo Builder Configuration
 * 照片構建器配置
 */

export interface BuilderConfig {
  // 照片來源
  source: {
    type: 'local' | 's3';
    path: string; // 本地路徑或 S3 bucket
    excludeRegex?: string;
  };

  // 輸出設定
  output: {
    directory: string; // 生成圖片的輸出目錄
    manifestPath: string; // manifest.json 的路徑
  };

  // 圖片處理設定
  processing: {
    // 縮圖設定
    thumbnail: {
      width: number; // 縮圖寬度
      quality: number; // 壓縮品質 (1-100)
      format: 'webp' | 'jpeg';
    };

    // 高解析度圖片設定
    highRes: {
      maxWidth: number; // 最大寬度
      quality: number; // 壓縮品質
      format: 'webp' | 'jpeg';
    };

    // 功能開關
    enableThumbHash: boolean; // 啟用 ThumbHash
    enableLivePhoto: boolean; // 啟用 Live Photo 處理
  };
}

/**
 * 預設配置
 */
export const defaultConfig: BuilderConfig = {
  source: {
    type: 'local',
    path: './photos',
  },

  output: {
    directory: './public/generated',
    manifestPath: './public/photos-manifest.json',
  },

  processing: {
    thumbnail: {
      width: 600,
      quality: 80,
      format: 'webp',
    },

    highRes: {
      maxWidth: 2400,
      quality: 85,
      format: 'jpeg',
    },

    enableThumbHash: true,
    enableLivePhoto: true,
  },
};

/**
 * 載入配置
 */
export async function loadConfig(): Promise<BuilderConfig> {
  try {
    // 嘗試載入 builder.config.ts
    const userConfig = await import('../../builder.config.js').then(
      (m) => m.default || m
    );
    return { ...defaultConfig, ...userConfig };
  } catch (error) {
    console.log('⚠️  未找到 builder.config.ts，使用預設配置');
    return defaultConfig;
  }
}
