// 收藏頁（media/Collection）的資料整理：三種來源（巴哈的動畫紀錄、TMDb 的電影與影集、書、Spotify）
// 都換成封面牆上的一格。這裡只有資料，不碰 React。
import type { AnimeRow, BookRow, FilmRow, SpotifyTrack, TvRow } from '@koimsurai/api-types';
import { dedupeWatchItems } from '@/lib/mediaLists';

export type WatchKind = 'anime' | 'film' | 'tv';
export type BookStatus = 'read' | 'reading' | 'to-read';

/** 封面牆上的一格 */
export interface Cell {
  id: string;
  title: string;
  cover: string | null;
  href: string | null;
  /** 滑過時標題底下那一行 */
  meta: string;
}

interface WatchItem {
  id: string;
  kind: WatchKind;
  title: string;
  cover: string | null;
  date: string;
  epCount: number;
  tmdbId: number | null;
  href: string | null;
}

/**
 * 封面牆的格子很小：TMDb 換成小尺寸、誠品換成矮一點的版本，不然幾百張原圖要抓幾十 MB。
 * 巴哈與 Google Books 的網址沒有尺寸參數，原樣用
 */
export function thumb(url: string | null | undefined, size: 'wall' | 'fav'): string | null {
  if (!url) return null;
  const tmdb = size === 'wall' ? 'w154' : 'w185';
  return url
    .replace(/^http:\/\//, 'https://')
    .replace(/(image\.tmdb\.org\/t\/p\/)w\d+\//, `$1${tmdb}/`)
    .replace(/(eslite\.com\/unsafe\/fit-in\/)x\d+\//, `$1x${size === 'wall' ? 200 : 300}/`);
}

/** 動畫紀錄是一集一筆：同一部併成一格，取最近看的那一集 */
function animeItems(rows: AnimeRow[]): WatchItem[] {
  const byAnime = new Map<number | string, AnimeRow[]>();
  for (const r of rows) {
    const list = byAnime.get(r.anime_sn);
    if (list) list.push(r);
    else byAnime.set(r.anime_sn, [r]);
  }
  return [...byAnime.values()].map((eps) => {
    const head = eps.reduce((a, b) => ((b.last_watched_at ?? '') > (a.last_watched_at ?? '') ? b : a));
    // 最新那集常是剛同步、還沒對到 TMDb 的：取任一集有對到的
    const tmdbId = head.tmdb_id ?? eps.find((e) => e.tmdb_id != null)?.tmdb_id ?? null;
    return {
      id: `a${head.anime_sn}`,
      kind: 'anime',
      title: head.title ?? '',
      cover: head.cover_url,
      date: (head.last_watched_at ?? '').slice(0, 10),
      epCount: eps.length,
      tmdbId,
      href: tmdbId ? `https://www.themoviedb.org/tv/${tmdbId}` : null,
    };
  });
}

const filmItems = (rows: FilmRow[]): WatchItem[] =>
  rows.map((f) => ({
    id: `f${f.id}`,
    kind: 'film',
    title: f.title,
    cover: f.poster_url,
    date: f.watched_date ?? '',
    epCount: 1,
    tmdbId: f.tmdb_id,
    href: f.tmdb_id ? `https://www.themoviedb.org/movie/${f.tmdb_id}` : null,
  }));

const tvItems = (rows: TvRow[]): WatchItem[] =>
  rows.map((s) => ({
    id: `t${s.series_name}`,
    kind: 'tv',
    title: s.series_name,
    cover: s.poster_url,
    date: s.last_watched ?? '',
    epCount: s.ep_count,
    tmdbId: s.tmdb_id,
    href: s.tmdb_id ? `https://www.themoviedb.org/tv/${s.tmdb_id}` : null,
  }));

const dotDate = (iso: string) => iso.slice(0, 10).replaceAll('-', '.');

/** 看過的全部：三種來源併在一起（同一部在動畫與影集兩邊都有的只留一格），最近看的在前面 */
export function watchCells(
  anime: AnimeRow[],
  films: FilmRow[],
  tv: TvRow[],
  kindLabel: (k: WatchKind) => string,
): { cells: Cell[]; latest: { title: string; date: string } | null } {
  const deduped = dedupeWatchItems(animeItems(anime), tvItems(tv));
  const all = [...deduped.anime, ...filmItems(films), ...deduped.tv].sort((a, b) => b.date.localeCompare(a.date));
  const latest = all.find((it) => it.date);
  return {
    cells: all.map((it) => ({
      id: it.id,
      title: it.title,
      cover: thumb(it.cover, 'wall'),
      href: it.href,
      meta: [kindLabel(it.kind), it.date ? dotDate(it.date) : ''].filter(Boolean).join(' · '),
    })),
    latest: latest ? { title: latest.title, date: dotDate(latest.date) } : null,
  };
}

const statusOf = (b: BookRow): BookStatus =>
  b.reading_status === 'read' || b.reading_status === 'reading' ? b.reading_status : 'to-read';

export const stars = (n: number | null | undefined) => (n ? `★ ${n}` : '');

export function bookCells(books: BookRow[], statusLabel: (s: BookStatus) => string): Cell[] {
  // 讀完的在前（評分高的先），接著在讀、想讀
  const rank = { read: 0, reading: 1, 'to-read': 2 } as const;
  return [...books]
    .sort((a, b) => rank[statusOf(a)] - rank[statusOf(b)] || (b.rating ?? 0) - (a.rating ?? 0))
    .map((b) => ({
      id: `b${b.id}`,
      title: b.title,
      cover: thumb(b.cover_url, 'wall'),
      href: null,
      meta: [b.authors, statusLabel(statusOf(b)), stars(b.rating)].filter(Boolean).join(' · '),
    }));
}

export function bookCounts(books: BookRow[]) {
  const n = (s: BookStatus) => books.filter((b) => statusOf(b) === s).length;
  return { total: books.length, read: n('read'), reading: n('reading'), toRead: n('to-read') };
}

/** 最喜歡的幾本：讀完、有寫心得的，評分高的在前 */
export function favoriteBooks(books: BookRow[], max = 4) {
  return books
    .filter((b) => statusOf(b) === 'read' && b.personal_notes?.trim())
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.date_finished ?? '').localeCompare(a.date_finished ?? ''))
    .slice(0, max);
}

export { statusOf as bookStatus };

/** Spotify 的封面有三種大小（640、300、64）：牆上那格小，用中間那張 */
export function albumCover(t: SpotifyTrack, size: 'wall' | 'fav'): string | null {
  const imgs = t.album.images;
  return (size === 'wall' && imgs.length > 1 ? imgs[1] : imgs.at(0))?.url ?? null;
}

export const artistsOf = (t: SpotifyTrack) => t.artists.map((a) => a.name).join('、');

export const trackCells = (tracks: SpotifyTrack[]): Cell[] =>
  tracks.map((t) => ({
    id: `s${t.id}`,
    title: t.name,
    cover: albumCover(t, 'wall'),
    href: t.external_urls.spotify,
    meta: `${artistsOf(t)} · ${t.album.name}`,
  }));
