import { apiUrl } from './api';
import type { Post } from './components/Blog';

export interface BlogListData {
  posts: Post[];
}

// 列表頁 loader:在 server 端(SSR/ISR)先抓好首屏文章 baked 進 HTML。
// Blog 元件原本只在 useEffect 抓資料,而 useEffect 不在 server 執行 → SSR 只吐骨架屏、
// HTML 裡 0 筆文章(SEO 看不到、ISR 也只快取到空殼)。
// sortBy 用 'newest' 對齊元件的初始排序;切換排序仍由元件自己 refetch。
export async function loadBlogPosts(locale: string): Promise<BlogListData> {
  try {
    const res = await fetch(apiUrl(`/api/posts?sortBy=newest&limit=100&lang=${locale}`));
    if (!res.ok) return { posts: [] };
    const data = (await res.json()) as { posts?: Post[] };
    return { posts: (data.posts ?? []).map((p) => ({ ...p, tags: p.tags ?? [] })) };
  } catch {
    return { posts: [] }; // 後端不通時不擋整頁:退回 client 端自己抓
  }
}
