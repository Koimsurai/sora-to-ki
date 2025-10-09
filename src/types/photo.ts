// 照片數據類型定義
export interface PhotoManifest {
  id: string
  title: string
  description?: string
  
  // 圖片 URLs
  urls: {
    full: string        // 原圖
    regular: string     // 一般尺寸
    small: string       // 小尺寸
    thumb: string       // 縮圖
  }
  
  // 原始 URL (向後兼容)
  originalUrl: string
  thumbnailUrl: string
  
  // 尺寸資訊
  width: number
  height: number
  aspectRatio: number
  size: number // 檔案大小 (bytes)
  format?: string // 圖片格式 (jpg, png, etc.)
  
  // 佔位符
  blurhash?: string
  thumbHash?: string
  
  // 標籤
  tags?: string[]
  
  // EXIF 信息
  exif?: {
    make?: string              // 相機製造商
    model?: string             // 相機型號
    FocalLength?: string       // 焦距
    FocalLengthIn35mmFormat?: string // 35mm等效焦距
    ISO?: string               // ISO 值
    ExposureTime?: string      // 快門速度
    FNumber?: string           // 光圈值
    DateTimeOriginal?: string  // 拍攝時間
    LensModel?: string         // 鏡頭型號
    Software?: string          // 軟體
    Flash?: string             // 閃光燈
    WhiteBalance?: string      // 白平衡
    MeteringMode?: string      // 測光模式
  }
  
  // GPS 信息
  gps?: {
    latitude: number
    longitude: number
    altitude?: number
  }
  
  // 拍攝時間
  shootTime?: string | number
  
  // Live Photo 相關
  isLivePhoto?: boolean
  livePhotoVideoUrl?: string
  
  // 其他資訊
  location?: string
  camera?: string
  lens?: string
}

// 瀑布流頭部項目類型
export class MasonryHeaderItem {
  static readonly default = new MasonryHeaderItem()
}

export type MasonryItemType = PhotoManifest | MasonryHeaderItem
