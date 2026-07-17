import { apiUrl } from './api';
import type { RecentlyPlayedState, TopGenresState, TopTracksState } from './components/Music';

export interface MusicData {
  recentlyPlayed: RecentlyPlayedState;
  topGenres: TopGenresState;
  topTracks: TopTracksState;
}

// 音樂頁 loader：只把「相對穩定」的資料 baked 進 SSR HTML。
//
// 刻意不含 now-playing：那是 30 秒輪詢一次的即時狀態，烤進 HTML 只會是一份過期快照
// （而且 ISR 快取 1 小時的話，爬蟲與首屏看到的「正在播放」永遠是錯的）。它留在 client 端抓，
// 首屏先 render 其餘內容，now-playing 掛載後自己補上。
//
// 回傳形狀對齊元件既有的 state（{ tracks/genres, configured } 或 { error, configured: false }），
// 讓元件可以直接拿來當初始值，不必改 render 邏輯。
export async function loadMusic(): Promise<MusicData> {
  const get = async <T>(path: string, ok: (d: Record<string, unknown>) => T, bad: (msg: string) => T): Promise<T> => {
    try {
      const res = await fetch(apiUrl(path));
      const data = (await res.json()) as Record<string, unknown>;
      if (typeof data.error === 'string') return bad(data.error);
      return ok(data);
    } catch {
      // 後端不通不擋頁面：交給 client 端重抓（元件的 10 分鐘定期刷新也會補）
      return bad('');
    }
  };

  const [recentlyPlayed, topGenres, topTracks] = await Promise.all([
    get<RecentlyPlayedState>(
      '/api/spotify/recently-played',
      (d) => ({ tracks: (d.items as RecentlyPlayedState['tracks']) ?? [], configured: true }),
      (error) => ({ error, configured: false }),
    ),
    get<TopGenresState>(
      '/api/spotify/top-genres',
      (d) => ({ genres: (d.genres as TopGenresState['genres']) ?? [], configured: true }),
      (error) => ({ error, configured: false }),
    ),
    get<TopTracksState>(
      '/api/spotify/top-tracks?time_range=medium_term&limit=20',
      (d) => ({ tracks: (d.items as TopTracksState['tracks']) ?? [], configured: true }),
      (error) => ({ error, configured: false }),
    ),
  ]);

  return { recentlyPlayed, topGenres, topTracks };
}
