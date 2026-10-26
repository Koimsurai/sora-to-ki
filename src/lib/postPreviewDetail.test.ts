import { describe, expect, it } from 'vite-plus/test';
import type { PostPreviewSnapshot } from '@/store/postPreview';
import { buildPreviewDetail, previewLocales } from './postPreviewDetail';

const snap = (over: Partial<PostPreviewSnapshot> = {}): PostPreviewSnapshot => ({
  id: 7,
  slug: 'demo',
  format: 'mdx',
  category: '技術',
  tags: ['Rust'],
  series_name: null,
  series_order: null,
  layout_type: 'record',
  allow_comments: true,
  status: 'draft',
  source_language: 'zh-TW',
  created_at: '2026-10-26 01:00:00',
  updated_at: null,
  view_count: 0,
  author: 'Koimsurai',
  texts: {
    'zh-TW': { title: '標題', content: '## 一\n內文', excerpt: '第一句。第二句。' },
    en: { title: 'Title', content: '## One', excerpt: 'First. Second.' },
    ja: { title: '', content: '', excerpt: '' },
  },
  excerpt_links: {
    'zh-TW': [
      { text: '第二句。', to: '01' },
      { text: '刪掉的句子', to: '01' },
    ],
  },
  ...over,
});

describe('previewLocales', () => {
  it('只算有寫東西的語系', () => {
    expect(previewLocales(snap())).toEqual(['zh-TW', 'en']);
  });

  it('原稿語系就算還空著也在（語言那一排才有它）', () => {
    expect(previewLocales(snap({ texts: { en: { title: 'T', content: '', excerpt: '' } } }))).toEqual(['zh-TW', 'en']);
  });
});

describe('buildPreviewDetail', () => {
  it('取那個語系的字，摘要裡找不到的連結不送（跟後端 for_locale 一樣）', () => {
    const d = buildPreviewDetail(snap(), 'zh-TW');
    expect(d.title).toBe('標題');
    expect(d.excerpt_links).toEqual([{ text: '第二句。', to: '01' }]);
    expect(d.is_source).toBe(true);
  });

  it('譯文語系不是原文', () => {
    const d = buildPreviewDetail(snap(), 'en');
    expect(d.title).toBe('Title');
    expect(d.is_source).toBe(false);
    expect(d.excerpt_links).toEqual([]);
  });

  it('沒寫的語系退回原稿的字（不會整頁空白）', () => {
    expect(buildPreviewDetail(snap(), 'ko').title).toBe('標題');
  });

  it('編譯好的 MDX 與 mermaid 圖帶進去', () => {
    const d = buildPreviewDetail(snap(), 'zh-TW', { compiledMdx: '{"type":"root"}', mermaidSvgs: { a: '<svg/>' } });
    expect(d.compiledMdx).toBe('{"type":"root"}');
    expect(d.mermaidSvgs).toEqual({ a: '<svg/>' });
  });

  it('新文章還沒有建立時間，用現在（後端的格式）', () => {
    expect(buildPreviewDetail(snap({ created_at: null }), 'zh-TW').created_at).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    );
  });
});
