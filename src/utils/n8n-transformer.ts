/**
 * N8N 資料轉換工具
 * 處理 N8N 自動匯入的文章資料格式轉換
 */

/**
 * N8N 匯入的原始資料格式
 */
export interface N8NPostData {
  title: string;
  content: string;
  tags?: string[] | Array<{ label: string; value: string }>;
  category?: string;
  slug?: string;
  summary?: string;
  cover?: string;
  status?: 'draft' | 'published' | 'archived';
}

/**
 * 編輯器使用的資料格式
 */
export interface EditorPostData {
  title: string;
  content: string;
  tags: Array<{ label: string; value: string }>;
  category?: string;
  slug?: string;
  summary?: string;
  cover?: string;
  status: 'draft' | 'published' | 'archived';
  allowComments: boolean;
  pin: boolean;
  pinOrder: number;
}

/**
 * 將 N8N 匯入的資料轉換為編輯器格式
 */
export function transformN8NData(n8nData: N8NPostData): EditorPostData {
  // 處理 tags 格式轉換
  let transformedTags: Array<{ label: string; value: string }> = [];

  if (n8nData.tags) {
    if (Array.isArray(n8nData.tags)) {
      // 檢查是字串陣列還是物件陣列
      if (typeof n8nData.tags[0] === 'string') {
        // 字串陣列：["React", "TypeScript"]
        transformedTags = (n8nData.tags as string[]).map((tag, index) => ({
          label: tag,
          value: tag.toLowerCase().replace(/\s+/g, '-'), // 自動生成 value
        }));
      } else {
        // 已經是正確格式的物件陣列
        transformedTags = n8nData.tags as Array<{ label: string; value: string }>;
      }
    }
  }

  // 組合完整的編輯器資料
  return {
    title: n8nData.title || '',
    content: n8nData.content || '',
    tags: transformedTags,
    category: n8nData.category,
    slug: n8nData.slug || generateSlug(n8nData.title),
    summary: n8nData.summary || extractSummary(n8nData.content),
    cover: n8nData.cover,
    status: n8nData.status || 'draft',
    allowComments: true,
    pin: false,
    pinOrder: 0,
  };
}

/**
 * 將編輯器資料轉換為 API 需要的格式
 */
export function transformToAPIData(editorData: EditorPostData): any {
  return {
    title: editorData.title,
    content: editorData.content,
    // 轉換 tags 回字串陣列（如果 API 需要）或保持物件格式
    tags: editorData.tags.map(tag => tag.label), // 或保持完整物件
    tagsObjects: editorData.tags, // 保留完整物件供參考
    category: editorData.category,
    slug: editorData.slug,
    summary: editorData.summary,
    cover: editorData.cover,
    status: editorData.status,
    allowComments: editorData.allowComments,
    pin: editorData.pin,
    pinOrder: editorData.pinOrder,
  };
}

/**
 * 從標題自動生成 slug
 */
function generateSlug(title: string): string {
  if (!title) return '';
  
  return title
    .toLowerCase()
    .trim()
    // 移除特殊字符
    .replace(/[^\w\s\u4e00-\u9fa5-]/g, '')
    // 將空格和底線轉換為連字符
    .replace(/[\s_]+/g, '-')
    // 移除開頭和結尾的連字符
    .replace(/^-+|-+$/g, '');
}

/**
 * 從內容中提取摘要（取前 150 字）
 */
function extractSummary(content: string, maxLength: number = 150): string {
  if (!content) return '';
  
  // 移除 Markdown 標記
  const plainText = content
    .replace(/#{1,6}\s/g, '') // 移除標題
    .replace(/\*\*|\*|__|_/g, '') // 移除粗體斜體
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 移除連結，保留文字
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // 移除圖片
    .replace(/`{1,3}[^`]*`{1,3}/g, '') // 移除程式碼
    .replace(/>\s/g, '') // 移除引用
    .replace(/[-*+]\s/g, '') // 移除列表
    .replace(/\n+/g, ' ') // 換行轉空格
    .trim();

  // 截取指定長度
  if (plainText.length > maxLength) {
    return plainText.substring(0, maxLength) + '...';
  }

  return plainText;
}

/**
 * 驗證 N8N 資料是否完整
 */
export function validateN8NData(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.title || typeof data.title !== 'string' || data.title.trim() === '') {
    errors.push('標題 (title) 為必填欄位');
  }

  if (!data.content || typeof data.content !== 'string' || data.content.trim() === '') {
    errors.push('內容 (content) 為必填欄位');
  }

  if (data.tags && !Array.isArray(data.tags)) {
    errors.push('標籤 (tags) 必須是陣列格式');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 批量處理 N8N 匯入資料
 */
export function batchTransformN8NData(n8nDataArray: N8NPostData[]): EditorPostData[] {
  return n8nDataArray.map(data => transformN8NData(data));
}
