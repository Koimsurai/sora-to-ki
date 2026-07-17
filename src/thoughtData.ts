import { apiUrl } from './api';
import type { Thought } from './components/ThoughtCard';

export interface ThoughtData {
  thought: Thought;
}

// 單則碎念頁的 loader。這條路由原本連 head() 都沒有 → 既沒 SSR 內容、標題也停在站台預設值，
// 等於每一則碎念對 Google 都是「無標題、無內容」的重複頁面。
export async function loadThought(id: string): Promise<ThoughtData | null> {
  try {
    const res = await fetch(apiUrl(`/api/thoughts/${id}`));
    if (!res.ok) return null;
    const data = (await res.json()) as { thought?: Thought };
    return data.thought ? { thought: data.thought } : null;
  } catch {
    return null; // 後端不通：交給元件自己重抓，不要把整頁變 404
  }
}

/** 碎念沒有標題欄位，用內容前段當標題（過長截斷）。 */
export function thoughtTitle(content: string): string {
  const oneLine = content.replace(/\s+/g, ' ').trim();
  return oneLine.length > 32 ? `${oneLine.slice(0, 32)}…` : oneLine;
}
