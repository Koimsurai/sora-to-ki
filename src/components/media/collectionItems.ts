// 收藏頁（media/Collection）的資料整理：三種來源（巴哈的動畫紀錄、TMDb 的電影與影集、書、Spotify）
// 都換成星雲裡的一顆星（media/nebulaSky）。這裡只有資料，不碰 React。
import type { AnimeRow, BookRow, FilmRow, SpotifyTrack, TvRow, WatchFavoriteRow } from '@koimsurai/api-types';
import { dedupeWatchItems } from '@/lib/mediaLists';
import type { Star } from './nebulaSky';

export type WatchKind = 'anime' | 'film' | 'tv';
export type BookStatus = 'read' | 'reading' | 'to-read';

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
 * 望遠鏡裡的封面只有一百多像素寬：TMDb 換成小尺寸、誠品換成矮一點的版本。
 * 巴哈與 Google Books 的網址沒有尺寸參數，原樣用
 */
function thumb(url: string | null | undefined): string | null {
  if (!url) return null;
  return url
    .replace(/^http:\/\//, 'https://')
    .replace(/(image\.tmdb\.org\/t\/p\/)w\d+\//, '$1w185/')
    .replace(/(eslite\.com\/unsafe\/fit-in\/)x\d+\//, '$1x300/');
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

const log01 = (v: number, max: number) => Math.log2(v + 1) / Math.log2(max + 1 || 2);

/**
 * 看過的全部：三種來源併在一起（同一部在動畫與影集兩邊都有的只留一顆星），由舊到新。
 * 大小是集數、越近期看的越亮；最愛的那幾部是琥珀色，帶著寫的那句話（最愛不在紀錄裡的也補一顆）
 */
export function watchStars(
  anime: AnimeRow[],
  films: FilmRow[],
  tv: TvRow[],
  favorites: WatchFavoriteRow[],
  kindLabel: (k: WatchKind) => string,
): { stars: Star[]; latest: { title: string; date: string } | null } {
  const deduped = dedupeWatchItems(animeItems(anime), tvItems(tv));
  const all = [...deduped.anime, ...filmItems(films), ...deduped.tv].sort((a, b) => a.date.localeCompare(b.date));
  const n = Math.max(1, all.length);
  const maxEp = Math.max(1, ...all.map((it) => it.epCount));
  const fav = new Map(favorites.filter((f) => f.tmdbId != null).map((f) => [f.tmdbId, f]));
  const used = new Set<number>();
  const list: Star[] = all.map((it, i) => {
    const f = it.tmdbId != null ? fav.get(it.tmdbId) : undefined;
    if (f?.tmdbId != null) used.add(f.tmdbId);
    return {
      id: it.id,
      title: f?.title ?? it.title,
      meta: [kindLabel(it.kind), it.date ? dotDate(it.date) : '', f ? stars(f.rating) : ''].filter(Boolean).join(' · '),
      cover: thumb(f?.poster ?? it.cover),
      href: f?.externalUrl ?? it.href,
      size: log01(it.epCount, maxEp),
      light: 0.3 + 0.7 * (i / n),
      amber: Boolean(f),
      quote: f?.quote,
    };
  });
  for (const f of favorites) {
    if (f.tmdbId != null && used.has(f.tmdbId)) continue;
    list.push({
      id: `fav${f.id}`,
      title: f.title,
      meta: [kindLabel(f.kind === 'film' ? 'film' : 'tv'), f.year, stars(f.rating)].filter(Boolean).join(' · '),
      cover: thumb(f.poster),
      href: f.externalUrl,
      size: 0.5,
      light: 1,
      amber: true,
      quote: f.quote,
    });
  }
  const latest = all.at(-1);
  return { stars: list, latest: latest?.date ? { title: latest.title, date: dotDate(latest.date) } : null };
}

const statusOf = (b: BookRow): BookStatus =>
  b.reading_status === 'read' || b.reading_status === 'reading' ? b.reading_status : 'to-read';

const stars = (n: number | null | undefined) => (n ? `★ ${n}` : '');

/** 書：照加進書櫃的時間由舊到新。大小是頁數、亮度是評分；在讀的會呼吸，想讀的是空心圈；寫了心得的是琥珀色 */
export function bookStars(books: BookRow[], statusLabel: (s: BookStatus) => string): Star[] {
  const fav = new Set(favoriteBooks(books).map((b) => b.id));
  const maxPages = Math.max(1, ...books.map((b) => b.page_count ?? 0));
  return [...books]
    .sort((a, b) => (a.date_added ?? '').localeCompare(b.date_added ?? ''))
    .map((b) => ({
      id: `b${b.id}`,
      title: b.title,
      meta: [b.authors, statusLabel(statusOf(b)), stars(b.rating)].filter(Boolean).join(' · '),
      cover: thumb(b.cover_url),
      href: null,
      size: b.page_count ? log01(b.page_count, maxPages) : 0.35,
      light: b.rating ? 0.35 + 0.13 * b.rating : 0.4,
      amber: fav.has(b.id),
      quote: fav.has(b.id) ? b.personal_notes : null,
      hollow: statusOf(b) === 'to-read',
      pulse: statusOf(b) === 'reading',
    }));
}

export function bookCounts(books: BookRow[]) {
  const n = (s: BookStatus) => books.filter((b) => statusOf(b) === s).length;
  return { total: books.length, read: n('read'), reading: n('reading'), toRead: n('to-read') };
}

/** 最喜歡的幾本：讀完、有寫心得的，評分高的在前 */
function favoriteBooks(books: BookRow[], max = 4) {
  return books
    .filter((b) => statusOf(b) === 'read' && b.personal_notes?.trim())
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.date_finished ?? '').localeCompare(a.date_finished ?? ''))
    .slice(0, max);
}

export const artistsOf = (t: SpotifyTrack) => t.artists.map((a) => a.name).join('、');

/** 最常聽的：排名越前越大越亮，排在越內圈（所以由後往前排）；第一名是琥珀色 */
export const trackStars = (tracks: SpotifyTrack[]): Star[] =>
  tracks
    .map((t, rank) => ({
      id: `s${t.id}`,
      title: t.name,
      meta: `${artistsOf(t)} · ${t.album.name}`,
      // Spotify 的封面有三種大小（640、300、64）：望遠鏡裡用中間那張
      cover: (t.album.images.length > 1 ? t.album.images[1] : t.album.images.at(0))?.url ?? null,
      href: t.external_urls.spotify,
      size: 1.2 - (0.7 * rank) / Math.max(1, tracks.length),
      light: 1 - (0.35 * rank) / Math.max(1, tracks.length),
      amber: rank === 0,
    }))
    .reverse();
