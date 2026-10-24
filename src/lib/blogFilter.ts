// 部落格列表的篩選與分組。從 Blog.tsx 抽出來——它是 e2e 走得到、但單元測試碰不到的那類邏輯，
// 而「篩掉了不該篩的」在畫面上就只是「這篇好像不見了」，沒有任何錯誤訊息。

import { parseServerDate } from '@/lib/serverDate';

export interface PostLike {
  title: string;
  content_preview: string;
  tags: readonly string[];
  category?: string | null;
  created_at: string;
}

export interface PostFilters {
  searchTerm: string;
  /** 空字串 = 不篩 */
  selectedTag: string;
  /** 空字串 = 不篩 */
  selectedCategory: string;
}

/**
 * 搜尋 + 標籤 + 分類，三個條件取**交集**。
 *
 * ⚠ 搜尋只比對 `content_preview`（前 260 字），不是整篇內文——列表 API 本來就沒有
 * 完整的 content。全文搜尋要走後端 `/api/posts?search=`（SQL 對 `p.content LIKE`）。
 * 這不是 bug，但很容易被誤會成「搜不到明明有的字」。
 */
export function filterPosts<T extends PostLike>(posts: readonly T[], f: PostFilters): T[] {
  const term = f.searchTerm.toLowerCase();
  return posts.filter((p) => {
    const matchSearch =
      !f.searchTerm || p.title.toLowerCase().includes(term) || p.content_preview.toLowerCase().includes(term);
    const matchTag = !f.selectedTag || p.tags.includes(f.selectedTag);
    const matchCat = !f.selectedCategory || p.category === f.selectedCategory;
    return matchSearch && matchTag && matchCat;
  });
}

export interface PostGroup<T> {
  year: number;
  posts: T[];
}

/**
 * 依年份分組（手記列表左邊那一欄的年份），新的在前；同一組內保持原本的先後順序。
 *
 * ⚠ 時間用 `parseServerDate` 解析，不是 `new Date()`。後端回的時間戳是 UTC 但沒有
 * 時區標記——直接 `new Date()` 會當成本地時間、整整早八小時，於是**當地時間元旦
 * 凌晨 0~8 點發的文章會被分到去年**。
 */
export function groupPostsByYear<T extends PostLike>(posts: readonly T[]): PostGroup<T>[] {
  const groups = new Map<number, PostGroup<T>>();
  for (const post of posts) {
    const year = parseServerDate(post.created_at).getFullYear();
    let group = groups.get(year);
    if (!group) {
      group = { year, posts: [] };
      groups.set(year, group);
    }
    group.posts.push(post);
  }
  return [...groups.values()].sort((a, b) => b.year - a.year);
}
