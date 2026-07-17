import { apiUrl } from './api';
import type { AnimeRow, FilmRow, TvRow, WatchStats } from './components/Watch';

export interface WatchData {
  animeHistory: AnimeRow[];
  films: FilmRow[];
  series: TvRow[];
  stats: WatchStats | null;
}

// 在看什麼頁 loader：在 server 端先抓好觀看紀錄 baked 進 HTML。
// 元件原本只在 useEffect 抓 → SSR 停在 null（載入中）→ HTML 裡 0 筆紀錄。這頁資料量最大
// （anime/history 就 200 筆），對 SEO 影響也最明顯。
//
// 刻意不含 liveNow（正在看什麼）與 favorites：
//   liveNow 是定期輪詢的即時狀態，baked 進 HTML 只會是一份過期快照；
//   favorites 依 UI 語系抓（?locale=），與路由 locale 不見得一致，留給 client 處理。
export async function loadWatch(): Promise<WatchData> {
  const get = async <T>(path: string, pick: (d: Record<string, unknown>) => T, fallback: T): Promise<T> => {
    try {
      const res = await fetch(apiUrl(path));
      if (!res.ok) return fallback;
      return pick((await res.json()) as Record<string, unknown>);
    } catch {
      return fallback;
    }
  };

  const [animeHistory, films, series, stats] = await Promise.all([
    get<AnimeRow[]>('/api/anime/history?limit=200', (d) => (d.history as AnimeRow[]) ?? [], []),
    get<FilmRow[]>('/api/films/recent?limit=20', (d) => (d.films as FilmRow[]) ?? [], []),
    get<TvRow[]>('/api/tv/recent?limit=20', (d) => (d.series as TvRow[]) ?? [], []),
    get<WatchStats | null>('/api/watch/stats', (d) => d as unknown as WatchStats, null),
  ]);

  return { animeHistory, films, series, stats };
}
