import { queryOptions } from '@tanstack/react-query';
import { apiUrl } from '@/lib/api';
import type { AnimeRow, FilmRow, NowWatching, TvRow, WatchFavoriteRow, WatchStatsResponse } from '@koimsurai/api-types';

type LiveNow = NowWatching;
type WatchFavorite = WatchFavoriteRow;

// 收藏頁「在看」那一區的資料（TanStack Query）。loader 只預取數字（SSR baked）；
// 封面牆的全部紀錄、liveNow（正在看，30 秒輪詢）與 favorites（依 UI 語系）由 client 自己抓。
const STALE = 5 * 60 * 1000;
const LIVE_REFRESH = 30 * 1000;

export const watchStatsQueryOptions = queryOptions({
  queryKey: ['watch', 'stats'],
  queryFn: async (): Promise<WatchStatsResponse> => {
    const res = await fetch(apiUrl('/api/watch/stats'));
    if (!res.ok) throw new Error(`GET /api/watch/stats ${res.status}`);
    return (await res.json()) as WatchStatsResponse;
  },
  staleTime: STALE,
});

// 封面牆要全部的紀錄（跨來源去重在前端做），limit 拉大。
export const animeLibraryQueryOptions = queryOptions({
  queryKey: ['watch', 'anime-library'],
  queryFn: async (): Promise<AnimeRow[]> => {
    const res = await fetch(apiUrl('/api/anime/history?limit=2000'));
    if (!res.ok) throw new Error(`GET /api/anime/history ${res.status}`);
    const data = (await res.json()) as { history?: AnimeRow[] };
    return data.history ?? [];
  },
  staleTime: STALE,
});

export const filmsLibraryQueryOptions = queryOptions({
  queryKey: ['watch', 'films-library'],
  queryFn: async (): Promise<FilmRow[]> => {
    const res = await fetch(apiUrl('/api/films/recent?limit=200'));
    if (!res.ok) throw new Error(`GET /api/films/recent ${res.status}`);
    const data = (await res.json()) as { films?: FilmRow[] };
    return data.films ?? [];
  },
  staleTime: STALE,
});

export const tvLibraryQueryOptions = queryOptions({
  queryKey: ['watch', 'tv-library'],
  queryFn: async (): Promise<TvRow[]> => {
    const res = await fetch(apiUrl('/api/tv/recent?limit=200'));
    if (!res.ok) throw new Error(`GET /api/tv/recent ${res.status}`);
    const data = (await res.json()) as { series?: TvRow[] };
    return data.series ?? [];
  },
  staleTime: STALE,
});

// liveNow：30 秒輪詢；不進 loader。失敗回 null（對齊舊 poll 的 catch）。
export const liveNowQueryOptions = queryOptions({
  queryKey: ['watch', 'now'],
  queryFn: async (): Promise<LiveNow | null> => {
    try {
      const res = await fetch(apiUrl('/api/watch/now'));
      const data = (await res.json()) as { watching?: LiveNow | null };
      return data.watching ?? null;
    } catch {
      return null;
    }
  },
  staleTime: 0,
  refetchInterval: LIVE_REFRESH,
});

// favorites 依 UI 語系抓；編輯後 invalidateQueries(['watch','favorites']) 重抓。
export const watchFavoritesQueryOptions = (locale: string) =>
  queryOptions({
    queryKey: ['watch', 'favorites', locale],
    queryFn: async (): Promise<WatchFavorite[]> => {
      const res = await fetch(apiUrl(`/api/watch/favorites?locale=${encodeURIComponent(locale)}`));
      if (!res.ok) throw new Error(`GET /api/watch/favorites ${res.status}`);
      const data = (await res.json()) as { favorites?: WatchFavorite[] };
      return data.favorites ?? [];
    },
    staleTime: 0,
  });
