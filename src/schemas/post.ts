import { z } from 'zod';

// 關掉 zod 的 JIT。zod 4 第一次驗證時會用 `Function('')` 試探能不能 eval，能的話把 schema
// 編譯成更快的函式。全站 CSP 沒有 'unsafe-eval'，試探一定失敗、zod 也會自己退回一般模式——
// 功能沒差，但瀏覽器在擋下的那一刻就送出一筆 CSP 報告：GlitchTip 的「Blocked 'script' from ''」
// （blocked_uri 是 eval）有一部分就是後台編輯器每開一次就冒一筆。jitless 就是那個退回模式本身。
z.config({ jitless: true });

export const postSchema = z.object({
  title: z.string().min(1, '標題不能為空'),
  content: z.string().min(1, '內容不能為空'),
  slug: z.string().optional(),
  summary: z.string().optional(),
  category: z.string().optional(),
  tags: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
      }),
    )
    .optional(),
  cover: z.string().optional(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  layout_type: z.enum(['record', 'column']).default('record'),
  allow_comments: z.boolean().default(true),
  send_newsletter: z.boolean().default(false),
  // 系列文（選填）
  series_name: z.string().optional(),
  series_order: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  // i18n：原文語言 + 其他語系的 title/content/summary 複本
  source_language: z.enum(['zh-TW', 'zh-CN', 'en', 'ja', 'ko']).default('zh-TW'),
  title_en: z.string().optional(),
  content_en: z.string().optional(),
  summary_en: z.string().optional(),
  title_zh_cn: z.string().optional(),
  content_zh_cn: z.string().optional(),
  summary_zh_cn: z.string().optional(),
  title_ja: z.string().optional(),
  content_ja: z.string().optional(),
  summary_ja: z.string().optional(),
  title_ko: z.string().optional(),
  content_ko: z.string().optional(),
  summary_ko: z.string().optional(),
});

// 表單值用的是 schema 的「輸入」型別（含 .default() 的欄位在輸入端為選填）
export type PostFormInput = z.input<typeof postSchema>;
