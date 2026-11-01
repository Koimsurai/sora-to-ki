import { defineEventHandler, setHeader } from 'nitro/h3';

import { PAGES as ALL_PAGES } from '../../src/data/siteSections';
import en from '../../src/locales/en/server.json';
import ja from '../../src/locales/ja/server.json';
import ko from '../../src/locales/ko/server.json';
import zhCN from '../../src/locales/zh-CN/server.json';
import zhTW from '../../src/locales/zh-TW/server.json';
import { backendSiteConfig, disabledPathsOf } from '../disabledPaths';

const TEXT: Record<string, typeof zhTW.llms> = {
  'zh-TW': zhTW.llms,
  'zh-CN': zhCN.llms,
  en: en.llms,
  ja: ja.llms,
  ko: ko.llms,
};

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (m, k: string) => vars[k] ?? m);

// /llms.txt —— 給 LLM / AI agent 的網站摘要（llmstxt.org 慣例：Markdown、單一 H1、blockquote 摘要、
// 以 ## 分區列連結）。也是 Lighthouse「Agentic Browsing」稽核檢查的檔案。照 robots/sitemap 走 route
// 而非 public/ 靜態檔：要吃 SITE_URL env、並即時列近期文章。
// `?? ''` 再 `||`：沒設與設成空字串都退回預設（跟 src/lib/postPath.ts 同一個寫法）。
const SITE_URL = (process.env.SITE_URL ?? '') || 'http://localhost';
const BACKEND_URL = (process.env.BACKEND_URL ?? '') || 'http://backend-rs:3002';

interface Post {
  id: number | string;
  title?: string;
  created_at?: string;
}

// 主要頁面：頁面登記表（src/data/siteSections）裡標了 llms 的那幾頁
const PAGES = ALL_PAGES.filter((p) => p.llms);

export default defineEventHandler(async (event) => {
  let posts: Post[] = [];
  try {
    const res = await fetch(`${BACKEND_URL}/api/posts?limit=30`, { signal: AbortSignal.timeout(5000) });
    const data = (await res.json()) as Post[] | { posts?: Post[] };
    posts = Array.isArray(data) ? data : (data.posts ?? []);
  } catch {
    // 後端不通 → 仍回一份只有站點區塊的 llms.txt，不要回 500。
  }

  // 標題與摘要是站台設定的站名、作者、介紹（後端不通就只有網址當標題）
  const site = await backendSiteConfig(BACKEND_URL);
  const name = (site?.name ?? '') || SITE_URL;
  const author = site?.author ?? '';
  let md = `# ${author && author !== name ? `${name} · ${author}` : name}\n\n`;
  if (site?.description) md += `> ${site.description}\n\n`;

  // 用站台的預設語系寫；頁面說明優先用站長在後台寫的介紹
  const locale = site?.default_locale ?? 'zh-TW';
  const text = TEXT[locale] ?? zhTW.llms;
  const pageText: Record<string, string> = text.pages;

  md += `## ${text.heading.pages}\n\n`;
  const off = disabledPathsOf(site);
  for (const p of PAGES) {
    if (off.has(p.to)) continue;
    // 站長寫了（非空字串）就用他的；`?? ''` 再 `||` 跟上面站名同一個寫法
    const desc = (site?.page_descriptions?.[p.key]?.[locale] ?? '') || (pageText[p.key] ?? '');
    md += `- [${SITE_URL}${p.to}](${SITE_URL}${p.to}): ${desc}\n`;
  }

  md += `\n## ${text.heading.recent}\n\n`;
  for (const p of posts.slice(0, 20)) {
    if (!p.title) continue;
    md += `- [${p.title}](${SITE_URL}/blog/${p.id})\n`;
  }

  // 其他語系的 RSS：開著的語系扣掉預設的那個（只開一個就不提）
  const others = (site?.locales ?? []).filter((l) => l !== locale);
  md += `\n## ${text.heading.usage}\n\n`;
  md += `- ${text.welcome}\n`;
  md += `- ${fill(text.sitemap, { url: `${SITE_URL}/sitemap.xml` })}\n`;
  md += `- ${others.length ? fill(text.rssLangs, { url: `${SITE_URL}/rss`, langs: others.join('|') }) : fill(text.rss, { url: `${SITE_URL}/rss` })}\n`;

  setHeader(event, 'content-type', 'text/plain; charset=utf-8');
  setHeader(event, 'cache-control', 'public, max-age=3600');
  return md;
});
