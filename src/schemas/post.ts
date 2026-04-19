import { z } from 'zod';

export const postSchema = z.object({
  title: z.string().min(1, '標題不能為空'),
  content: z.string().min(1, '內容不能為空'),
  slug: z.string().optional(),
  summary: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.object({
    label: z.string(),
    value: z.string(),
  })).optional(),
  cover: z.string().optional(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  layout_type: z.enum(['record', 'column']).default('record'),
  allowComments: z.boolean().default(true),
  pin: z.boolean().default(false),
  pinOrder: z.number().default(0),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  // i18n：原文語言 + 其他語系的 title/content/summary 複本
  source_language: z.enum(['zh-TW', 'zh-CN', 'en', 'ja']).default('zh-TW'),
  title_en: z.string().optional(),
  content_en: z.string().optional(),
  summary_en: z.string().optional(),
  title_zh_cn: z.string().optional(),
  content_zh_cn: z.string().optional(),
  summary_zh_cn: z.string().optional(),
  title_ja: z.string().optional(),
  content_ja: z.string().optional(),
  summary_ja: z.string().optional(),
});

export type PostFormData = z.infer<typeof postSchema>;
