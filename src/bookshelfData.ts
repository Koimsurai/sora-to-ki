import { apiUrl } from './api';
import type { Book, BookStats } from './components/Bookshelf';

export interface BookshelfData {
  books: Book[];
  stats: BookStats | null;
}

// 書櫃頁 loader：在 server 端先抓好書單 baked 進 HTML。
// 元件原本只在 useEffect 抓，而 useEffect 不在 server 執行 → loading 初始 true → SSR 只吐骨架屏、
// HTML 裡 0 本書（Google 看不到書單，ISR 也只快取到空殼）。
// 兩個端點並行；任一失敗都不擋頁面（退回 client 端自己抓）。
export async function loadBookshelf(): Promise<BookshelfData> {
  const get = async <T>(path: string, pick: (d: Record<string, unknown>) => T, fallback: T): Promise<T> => {
    try {
      const res = await fetch(apiUrl(path));
      if (!res.ok) return fallback;
      const data = (await res.json()) as Record<string, unknown>;
      return data.message === 'success' ? pick(data) : fallback;
    } catch {
      return fallback;
    }
  };

  const [books, stats] = await Promise.all([
    get<Book[]>('/api/books', (d) => (d.books as Book[]) ?? [], []),
    get<BookStats | null>('/api/books/stats/summary', (d) => (d.stats as BookStats) ?? null, null),
  ]);

  return { books, stats };
}
