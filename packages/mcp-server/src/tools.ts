// MCP 工具定義：每個工具 = 一段對 admin REST 端點的封裝。
// inputSchema 用原始 JSON Schema（不綁 zod，避免 SDK 內建 zod 與 repo zod 版本摩擦）。
import type { ApiClient } from './api.js';

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

const EMPTY = { type: 'object' as const, properties: {}, additionalProperties: false };

/** 從 args 挑出有值的鍵組成 body（省略 undefined/null，''/false/0 保留）。 */
function pick(args: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (args[k] !== undefined && args[k] !== null) out[k] = args[k];
  }
  return out;
}

const POST_WRITE_FIELDS = [
  'title',
  'content',
  'excerpt',
  'category',
  'status',
  'layout_type',
  'tags',
  'series_name',
  'series_order',
  'allow_comments',
  'send_newsletter',
] as const;

const postWriteProps = {
  title: { type: 'string', description: '標題' },
  content: { type: 'string', description: '內文（Markdown）' },
  excerpt: { type: 'string', description: '摘要；省略=NULL' },
  category: { type: 'string', description: '分類名（需已存在於 categories）' },
  status: { type: 'string', enum: ['draft', 'published'], description: '狀態；建立時預設 draft' },
  layout_type: { type: 'string', description: "版面型別，預設 'record'" },
  tags: { type: 'array', items: { type: 'string' }, description: '標籤名陣列（不存在的會自動建立）' },
  series_name: { type: 'string', description: '系列名（可選）' },
  series_order: { type: 'number', description: '系列內排序（可選）' },
  allow_comments: { type: 'boolean', description: '是否開放留言，預設 true' },
  send_newsletter: {
    type: 'boolean',
    description: '⚠️ 若同時 status=published，會寄電子報給所有訂閱者——請先確認再設 true',
  },
};

export function makeTools(api: ApiClient): Tool[] {
  return [
    // ── 文章 CRUD ──────────────────────────────────────────────
    {
      name: 'koimsurai_list_posts',
      description: '列出後台文章（含草稿）。可依狀態/關鍵字過濾、分頁。回 AdminPostsResponse。',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['published', 'draft'], description: '省略=全部狀態' },
          search: { type: 'string', description: '標題/內文關鍵字' },
          page: { type: 'number', description: '頁碼，預設 1' },
          limit: { type: 'number', description: '每頁筆數，預設由後端決定' },
        },
        additionalProperties: false,
      },
      handler: (a) =>
        api.request('GET', '/api/admin/posts', {
          query: { status: a.status, search: a.search, page: a.page, limit: a.limit },
        }),
    },
    {
      name: 'koimsurai_get_post',
      description: '讀單篇文章完整內容（含全部 i18n 欄位與 tags）。回 AdminPostDetailResponse。',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number', description: '文章 id' } },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a) => api.request('GET', `/api/admin/posts/${a.id}`),
    },
    {
      name: 'koimsurai_create_post',
      description:
        '建立文章。title/content 必填，其餘可選。預設 status=draft（不會直接公開）。' +
        '注意 send_newsletter=true 且 published 會寄電子報。',
      inputSchema: {
        type: 'object',
        properties: postWriteProps,
        required: ['title', 'content'],
        additionalProperties: false,
      },
      handler: (a) => api.request('POST', '/api/admin/posts', { body: pick(a, [...POST_WRITE_FIELDS]) }),
    },
    {
      name: 'koimsurai_update_post',
      description: '更新文章。只送想改的欄位（其餘不動）。id 必填。',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number', description: '文章 id' }, ...postWriteProps },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a) => api.request('PUT', `/api/admin/posts/${a.id}`, { body: pick(a, [...POST_WRITE_FIELDS]) }),
    },
    {
      name: 'koimsurai_set_post_status',
      description: "只改文章狀態（draft ⇄ published），不動內容。發布請優先用這個。",
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          status: { type: 'string', enum: ['draft', 'published'] },
        },
        required: ['id', 'status'],
        additionalProperties: false,
      },
      handler: (a) => api.request('PATCH', `/api/posts/${a.id}/status`, { body: { status: a.status } }),
    },
    {
      name: 'koimsurai_delete_post',
      description: '⚠️ 刪除文章（連同 post_tags）。不可復原——請先確認。',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a) => api.request('DELETE', `/api/admin/posts/${a.id}`),
    },
    {
      name: 'koimsurai_generate_post_zh_cn',
      description: '由繁體來源自動生成該篇的簡體（zh-CN）欄位（opencc Tw2s）。id 必填。',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a) => api.request('POST', `/api/admin/posts/${a.id}/generate-zh-cn`),
    },

    // ── 統計與健康 ─────────────────────────────────────────────
    {
      name: 'koimsurai_site_stats',
      description: '後台總覽：文章數/已發布/草稿/本月新文/留言數/本週留言/瀏覽數。',
      inputSchema: EMPTY,
      handler: () => api.request('GET', '/api/admin/stats'),
    },
    {
      name: 'koimsurai_vitals_stats',
      description: '前端 Core Web Vitals 聚合（LCP/CLS/INP/FCP/TTFB 的 count/p75/rating 分佈）。',
      inputSchema: {
        type: 'object',
        properties: { days: { type: 'number', description: '回看天數，預設 7' } },
        additionalProperties: false,
      },
      handler: (a) => api.request('GET', '/api/vitals/stats', { query: { days: a.days }, auth: false }),
    },
    {
      name: 'koimsurai_health',
      description: '後端健康檢查（回 OK）。用來確認服務在跑。',
      inputSchema: EMPTY,
      handler: () => api.request('GET', '/api/health', { auth: false }),
    },

    // ── 分類 ──────────────────────────────────────────────────
    {
      name: 'koimsurai_list_categories',
      description: '列出所有分類（含各分類文章數 post_count）。',
      inputSchema: EMPTY,
      handler: () => api.request('GET', '/api/admin/categories'),
    },
    {
      name: 'koimsurai_create_category',
      description: '建立分類。name 必填；slug 省略時由 name 生成。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          slug: { type: 'string' },
          short_description: { type: 'string' },
        },
        required: ['name'],
        additionalProperties: false,
      },
      handler: (a) =>
        api.request('POST', '/api/admin/categories', {
          body: pick(a, ['name', 'description', 'slug', 'short_description']),
        }),
    },
    {
      name: 'koimsurai_update_category',
      description: '更新分類。id 必填，其餘只送要改的。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string' },
          description: { type: 'string' },
          slug: { type: 'string' },
          short_description: { type: 'string' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a) =>
        api.request('PUT', `/api/admin/categories/${a.id}`, {
          body: pick(a, ['name', 'description', 'slug', 'short_description']),
        }),
    },
    {
      name: 'koimsurai_delete_category',
      description: '⚠️ 刪除分類（不影響文章本身的 category 字串）。',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a) => api.request('DELETE', `/api/admin/categories/${a.id}`),
    },

    // ── 標籤 ──────────────────────────────────────────────────
    {
      name: 'koimsurai_list_tags',
      description: '列出所有標籤（含使用篇數 post_count）。',
      inputSchema: EMPTY,
      handler: () => api.request('GET', '/api/admin/tags'),
    },
    {
      name: 'koimsurai_create_tag',
      description: '建立標籤。name 必填。',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
        additionalProperties: false,
      },
      handler: (a) => api.request('POST', '/api/admin/tags', { body: { name: a.name } }),
    },
    {
      name: 'koimsurai_update_tag',
      description: '重新命名標籤。id + name 必填。',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number' }, name: { type: 'string' } },
        required: ['id', 'name'],
        additionalProperties: false,
      },
      handler: (a) => api.request('PUT', `/api/admin/tags/${a.id}`, { body: { name: a.name } }),
    },
    {
      name: 'koimsurai_delete_tag',
      description: '⚠️ 刪除標籤（連同 post_tags 關聯）。',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a) => api.request('DELETE', `/api/admin/tags/${a.id}`),
    },

    // ── 碎念 thoughts ─────────────────────────────────────────
    {
      name: 'koimsurai_create_thought',
      description: '發一則碎念（短想法 feed）。content 必填；refUrl 給連結會自動抓 OG 卡片。',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          refUrl: { type: 'string', description: '附帶連結（可選，會 unfurl）' },
        },
        required: ['content'],
        additionalProperties: false,
      },
      handler: (a) => api.request('POST', '/api/admin/thoughts', { body: pick(a, ['content', 'refUrl']) }),
    },
    {
      name: 'koimsurai_update_thought',
      description: '更新碎念。id 必填；clearRef=true 可清掉原本的連結卡片。',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          content: { type: 'string' },
          refUrl: { type: 'string' },
          clearRef: { type: 'boolean' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a) =>
        api.request('PUT', `/api/admin/thoughts/${a.id}`, { body: pick(a, ['content', 'refUrl', 'clearRef']) }),
    },
    {
      name: 'koimsurai_delete_thought',
      description: '⚠️ 刪除碎念。',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'number' } },
        required: ['id'],
        additionalProperties: false,
      },
      handler: (a) => api.request('DELETE', `/api/admin/thoughts/${a.id}`),
    },

    // ── gallery ───────────────────────────────────────────────
    {
      name: 'koimsurai_gallery_sync',
      description:
        '觸發 NAS 相簿同步：掃來源 → 產 webp（1920/400）+ EXIF + thumbhash → 寫 manifest。' +
        '耗時（視新增照片數），同時只跑一個。',
      inputSchema: EMPTY,
      handler: () => api.request('POST', '/api/admin/gallery/sync'),
    },
  ];
}
