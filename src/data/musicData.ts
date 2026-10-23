import { queryOptions } from '@tanstack/react-query';
import { apiUrl } from '@/lib/api';
import type { NowPlayingResponse, RecentPlayItem, SpotifyTrack, TopGenre } from '@koimsurai/api-types';

// Spotify 的型別吃後端 specta 生成的（backend handlers::spotify）；configured / error 是前端自己的
// 載入狀態，不是 API 的形狀
export type NowPlaying = NowPlayingResponse;
export interface RecentlyPlayedState {
  tracks?: RecentPlayItem[];
  configured?: boolean;
  error?: string;
}
export interface TopGenresState {
  genres?: TopGenre[];
  configured?: boolean;
  error?: string;
}
export interface TopTracksState {
  tracks?: SpotifyTrack[];
  configured?: boolean;
  error?: string;
}

// 收藏頁「在聽」那一區的資料（TanStack Query）。
//
// Spotify 端點的 queryFn **不 throw**：{error, configured:false} 是合法的回應狀態
// （例如「未設定 Spotify」），元件會 render 它，所以當作資料回傳、不是失敗。
// 後端不通（catch）也回一份空 error-state，對齊舊 loadMusic 的行為（SSR 不擋頁）。
//
// now-playing 刻意不進 loader 預取：30 秒輪詢的即時狀態，烤進 SSR 只會是過期快照。
const STALE = 5 * 60 * 1000;
const DATA_REFRESH = 10 * 60 * 1000;
const NOW_PLAYING_REFRESH = 30 * 1000;

async function getState<T>(path: string, ok: (d: Record<string, unknown>) => T, bad: (msg: string) => T): Promise<T> {
  try {
    const res = await fetch(apiUrl(path));
    const data = (await res.json()) as Record<string, unknown>;
    if (typeof data.error === 'string') return bad(data.error);
    return ok(data);
  } catch {
    return bad('');
  }
}

export const recentlyPlayedQueryOptions = queryOptions({
  queryKey: ['spotify', 'recently-played'],
  queryFn: () =>
    getState<RecentlyPlayedState>(
      '/api/spotify/recently-played',
      (d) => ({ tracks: (d.items as RecentlyPlayedState['tracks']) ?? [], configured: true }),
      (error) => ({ error, configured: false }),
    ),
  staleTime: STALE,
  refetchInterval: DATA_REFRESH,
});

export const topGenresQueryOptions = queryOptions({
  queryKey: ['spotify', 'top-genres'],
  queryFn: () =>
    getState<TopGenresState>(
      '/api/spotify/top-genres',
      (d) => ({ genres: (d.genres as TopGenresState['genres']) ?? [], configured: true }),
      (error) => ({ error, configured: false }),
    ),
  staleTime: STALE,
  refetchInterval: DATA_REFRESH,
});

export const topTracksQueryOptions = (range: string) =>
  queryOptions({
    queryKey: ['spotify', 'top-tracks', range],
    queryFn: () =>
      getState<TopTracksState>(
        `/api/spotify/top-tracks?time_range=${range}&limit=20`,
        (d) => ({ tracks: (d.items as TopTracksState['tracks']) ?? [], configured: true }),
        (error) => ({ error, configured: false }),
      ),
    staleTime: STALE,
  });

// now-playing：30 秒輪詢；不進 loader。失敗回 { is_playing:false }（對齊舊 fetchNowPlaying catch）。
export const nowPlayingQueryOptions = queryOptions({
  queryKey: ['spotify', 'now-playing'],
  queryFn: async (): Promise<NowPlaying> => {
    try {
      const res = await fetch(apiUrl('/api/spotify/now-playing'));
      return (await res.json()) as NowPlaying;
    } catch {
      // 欄位補齊：後端一律送出這三個 key（item/progress_ms 沒在播時是 null），
      // 前端的 fallback 也要維持同樣形狀，別讓型別分岔。
      return { is_playing: false, item: null, progress_ms: null };
    }
  },
  staleTime: 0,
  refetchInterval: NOW_PLAYING_REFRESH,
});
