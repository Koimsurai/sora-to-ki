import { defineEventHandler, setHeader } from 'nitro/h3';

import { PAGES as ALL_PAGES } from '../../src/data/siteSections';
import { backendSiteConfig, disabledPathsOf } from '../disabledPaths';

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

// 主要頁面：頁面登記表（src/data/siteSections）裡有寫 llms 描述的那幾頁
const PAGES: [string, string][] = ALL_PAGES.flatMap((p) => (p.llms ? [[p.to, p.llms] as [string, string]] : []));

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

  md += '## 主要頁面\n\n';
  const off = disabledPathsOf(site);
  for (const [path, desc] of PAGES) {
    if (off.has(path)) continue;
    md += `- [${SITE_URL}${path}](${SITE_URL}${path}): ${desc}\n`;
  }

  md += '\n## 近期文章\n\n';
  for (const p of posts.slice(0, 20)) {
    if (!p.title) continue;
    md += `- [${p.title}](${SITE_URL}/blog/${p.id})\n`;
  }

  md += '\n## 使用說明\n\n';
  md += '- 歡迎 AI 檢索、摘要與引用；引用時請保留來源連結。\n';
  md += `- 完整網址清單見 [sitemap](${SITE_URL}/sitemap.xml)（含各語系 hreflang）。\n`;
  md += `- 訂閱新文章：[RSS](${SITE_URL}/rss)；各語系加 \`?lang=en|ja|ko|zh-CN\`。\n`;

  setHeader(event, 'content-type', 'text/plain; charset=utf-8');
  setHeader(event, 'cache-control', 'public, max-age=3600');
  return md;
});
