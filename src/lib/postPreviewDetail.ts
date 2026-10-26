// 草稿預覽：編輯器交過來的內容（store/postPreview）→ 文章頁要的資料（跟 GET /api/posts/:id 同一個形狀）。
// 文章頁（blog/BlogPost）收到它就照讀者看到的樣子畫，不打 API。
import type { PostDetail } from '@/data/blogList';
import type { PostPreviewSnapshot } from '@/store/postPreview';

/** 有寫東西的語系（標題或內文有字），原稿語系一定在 */
export function previewLocales(s: PostPreviewSnapshot): string[] {
  const has = Object.entries(s.texts)
    .filter(([, t]) => t && (t.title.trim() || t.content.trim()))
    .map(([locale]) => locale);
  return has.includes(s.source_language) ? has : [s.source_language, ...has];
}

/** 後端的時間格式（UTC、`YYYY-MM-DD HH:MM:SS`）；新文章還沒有建立時間，用現在 */
const nowAsServerTime = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export function buildPreviewDetail(
  s: PostPreviewSnapshot,
  locale: string,
  rendered: { compiledMdx?: string; mermaidSvgs?: Record<string, string> } = {},
): PostDetail {
  const text = s.texts[locale] ?? s.texts[s.source_language] ?? { title: '', content: '', excerpt: '' };
  return {
    message: 'success',
    id: s.id ?? 0,
    slug: s.slug,
    title: text.title,
    content: text.content,
    excerpt: text.excerpt,
    // 跟後端 for_locale 一樣：摘要裡找不到的句子不送（摘要改過、連結還沒跟著改）
    excerpt_links: (s.excerpt_links[locale] ?? []).filter((l) => text.excerpt.includes(l.text)),
    category: s.category,
    status: s.status,
    author: s.author,
    view_count: s.view_count,
    likes: 0,
    layout_type: s.layout_type,
    allow_comments: s.allow_comments,
    format: s.format,
    series_name: s.series_name,
    series_order: s.series_order,
    created_at: s.created_at ?? nowAsServerTime(),
    updated_at: s.updated_at,
    locale,
    source_language: s.source_language,
    is_source: locale === s.source_language,
    available_locales: previewLocales(s),
    tags: s.tags,
    ...rendered,
  };
}
