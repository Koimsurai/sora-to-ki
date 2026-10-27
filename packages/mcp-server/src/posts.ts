// 文章讀寫的 MCP 端加工：後端回的是整列（五個語系的全文），直接丟回給 agent 會塞爆 context。
// 這裡負責「只回需要的欄位」「寫入前先驗、寫入後只回摘要」「局部修改」「檢查摘要連結」。
import { readFile } from 'node:fs/promises';

import { chapterNumbers, scanHeadings } from '@koimsurai/mdx-core/headings';

import type { ApiClient } from './api.js';
import { validateContent } from './validate.js';

export type Post = Record<string, unknown>;

/** list_posts 預設只回這些（不含任何內文） */
export const LIST_DEFAULT_FIELDS = [
  'id',
  'title',
  'slug',
  'status',
  'category',
  'format',
  'tags',
  'created_at',
  'updated_at',
  'publish_at',
] as const;

export const LOCALES = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'] as const;
export type Locale = (typeof LOCALES)[number];

/** 內文欄位（會拿去驗 MDX 的那些） */
export const CONTENT_FIELDS = ['content', 'content_en', 'content_ja', 'content_ko', 'content_zh_cn'] as const;

export function project(post: Post, fields: readonly string[]): Post {
  const out: Post = {};
  for (const f of fields) if (f in post) out[f] = post[f];
  return out;
}

export const sourceOf = (post: Post): string =>
  (typeof post.source_language === 'string' && post.source_language) || 'zh-TW';

/**
 * 某語系的 title/content/excerpt 存在哪一欄。來源語言存在不帶後綴的那三欄，其餘是 `_en`、`_zh_cn`…。
 * 不是來源的 zh-TW 沒有欄位（回 null）。
 */
export function suffixFor(locale: string, source: string): string | null {
  if (locale === source) return '';
  if (locale === 'zh-TW') return null;
  return `_${locale.toLowerCase().replace('-', '_')}`;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** 讀者在這個語系實際看到的欄位：譯文空的話前台退回來源語言 */
export function effective(post: Post, field: 'title' | 'content' | 'excerpt', locale: string): string {
  const suffix = suffixFor(locale, sourceOf(post));
  const own = suffix === null ? '' : str(post[`${field}${suffix}`]);
  return own || str(post[field]);
}

/** get_post 帶 locale 時：共用的中繼資料 + 那個語系的三欄 + 那個語系的摘要連結 */
export function postForLocale(post: Post, locale: string): Post {
  const suffix = suffixFor(locale, sourceOf(post));
  if (suffix === null) throw new Error(`這篇的來源語言是 ${sourceOf(post)}，沒有 ${locale} 的欄位`);
  const meta = project(post, [
    'id',
    'slug',
    'status',
    'category',
    'format',
    'tags',
    'source_language',
    'available_locales',
    'series_name',
    'series_order',
    'created_at',
    'updated_at',
    'publish_at',
  ]);
  const links = (post.excerpt_links as Record<string, unknown> | undefined)?.[locale] ?? [];
  return {
    ...meta,
    locale,
    title: post[`title${suffix}`] ?? null,
    excerpt: post[`excerpt${suffix}`] ?? null,
    excerpt_links: links,
    content: post[`content${suffix}`] ?? null,
  };
}

/** `##`／`###` 的章節編號對標題，excerpt_links 的 `to` 就是這裡的 num */
export function outline(content: string): { num: string; text: string }[] {
  const headings = scanHeadings(content);
  return chapterNumbers(headings).flatMap((num, i) => (num ? [{ num, text: headings[i].text }] : []));
}

interface LinkIssue {
  text: string;
  to: string;
  problem: string;
}

/**
 * 每個語系的摘要連結對不對得上：句子要逐字出現在那個語系的摘要裡、章節編號要存在、
 * 不能跟先出現的另一句重疊（文章頁只畫先出現的那句，另一句會靜靜不見）。
 */
export function checkExcerptLinks(post: Post): Record<string, string | LinkIssue[]> {
  const map = (post.excerpt_links ?? {}) as Record<string, { text: string; to: string }[]>;
  const out: Record<string, string | LinkIssue[]> = {};
  for (const [locale, links] of Object.entries(map)) {
    if (!links.length) continue;
    const excerpt = effective(post, 'excerpt', locale);
    const nums = new Set(outline(effective(post, 'content', locale)).map((c) => c.num));
    const spans = links
      .map((l) => ({ ...l, at: excerpt.indexOf(l.text) }))
      .filter((l) => l.at >= 0)
      .sort((a, b) => a.at - b.at);
    const issues: LinkIssue[] = [];
    for (const l of links) {
      const at = excerpt.indexOf(l.text);
      if (at < 0) issues.push({ ...l, problem: '摘要裡找不到這句（要逐字相同，含標點）' });
      else if (!nums.has(l.to)) issues.push({ ...l, problem: `內文沒有 ${l.to} 這一章` });
      else {
        const clash = spans.find((s) => s.text !== l.text && s.at < at && at < s.at + s.text.length);
        if (clash) issues.push({ ...l, problem: `跟先出現的「${clash.text}」重疊，不會顯示` });
      }
    }
    out[locale] = issues.length ? issues : `${links.length} 條全部對上`;
  }
  return out;
}

export interface Edit {
  field?: string;
  old: string;
  new: string;
}

/** 照順序套用局部修改；每個 old 都要在當下的文字裡剛好出現一次 */
export function applyEdits(post: Post, edits: readonly Edit[]): Record<string, string> {
  const changed: Record<string, string> = {};
  edits.forEach((e, i) => {
    const field = e.field ?? 'content';
    const current = changed[field] ?? post[field];
    if (typeof current !== 'string') throw new Error(`edits[${i}]：欄位 ${field} 目前沒有內容`);
    const count = e.old ? current.split(e.old).length - 1 : 0;
    if (count !== 1) {
      throw new Error(
        `edits[${i}]（${field}）：old 必須剛好出現一次，實際 ${count} 次${count > 1 ? '——多帶一點前後文讓它唯一' : ''}`,
      );
    }
    changed[field] = current.replace(e.old, () => e.new);
  });
  return changed;
}

/** `files: { content: '/path/x.mdx' }` → 讀成字串欄位 */
export async function readFields(files: Record<string, unknown>, allowed: ReadonlySet<string>): Promise<Post> {
  const out: Post = {};
  for (const [field, path] of Object.entries(files)) {
    if (!allowed.has(field)) throw new Error(`files 不能帶 ${field}（只收文字欄位）`);
    if (typeof path !== 'string') throw new Error(`files.${field} 要是檔案路徑`);
    out[field] = await readFile(path, 'utf8');
  }
  return out;
}

/**
 * 寫入前先驗每一個要寫進去的內文欄位。有錯就丟出例外（不寫），沒錯回每欄的一句摘要。
 * markdown 也要驗：用了自訂 block 卻沒設 format=mdx 正是那種「存成功、前台裸標籤」的錯。
 */
export async function validateFields(body: Post, format: string): Promise<Record<string, unknown>> {
  const summaries: Record<string, unknown> = {};
  const failures: string[] = [];
  for (const field of CONTENT_FIELDS) {
    const text = body[field];
    if (typeof text !== 'string' || !text) continue;
    const r = await validateContent(text, format);
    const notes = [...r.warnings, ...r.hints].map((f) => `${f.line ? `第 ${f.line} 行：` : ''}${f.message}`);
    summaries[field] = notes.length ? { summary: r.summary, notes } : r.summary;
    if (!r.ok) {
      const lines = r.errors.map(
        (e) => `  - ${e.line ? `第 ${e.line} 行：` : ''}${e.message}${e.fix ? `（${e.fix}）` : ''}`,
      );
      failures.push(`${field}（format=${format}）：\n${lines.join('\n')}`);
    }
  }
  if (failures.length) {
    throw new Error(`驗證沒過，沒有寫入。要硬寫就帶 validate: false。\n${failures.join('\n')}`);
  }
  return summaries;
}

export async function fetchPost(api: ApiClient, id: string): Promise<Post> {
  return api.request<Post>('GET', `/api/admin/posts/${id}`);
}
