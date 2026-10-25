// 收藏頁（media/Collection）的資料整理：四種來源（巴哈的動畫紀錄、TMDb 的電影與影集、書、Spotify）
// 都換成一道從地球發出的訊號（media/signalSky）：看完、讀完、聽完的那一刻發出，到現在飛了多遠
// 就是離現在多久。這裡只有資料，不碰 React。
import type {
  AnimeRow,
  BookRow,
  FilmRow,
  RecentPlayItem,
  SpotifyTrack,
  TvRow,
  WatchFavoriteRow,
} from '@koimsurai/api-types';
import { proxiedImage } from '@/lib/api';
import { dedupeWatchItems } from '@/lib/mediaLists';
import type { Signal } from './signalSky';

export type WatchKind = 'anime' | 'film' | 'tv';
export type BookStatus = 'read' | 'reading' | 'to-read';

interface WatchItem {
  id: string;
  kind: WatchKind;
  title: string;
  cover: string | null;
  /** 紀錄上的時間（巴哈的帶時分秒，其他只有日期） */
  date: string;
  epCount: number;
  tmdbId: number | null;
  href: string | null;
}

/**
 * 接收畫面裡的封面只有一百多像素高：TMDb 換成小尺寸、誠品換成矮一點的版本。
 * 巴哈與 Google Books 的網址沒有尺寸參數，原樣用
 */
function thumb(url: string | null | undefined): string | null {
  if (!url) return null;
  return url
    .replace(/^http:\/\//, 'https://')
    .replace(/(image\.tmdb\.org\/t\/p\/)w\d+\//, '$1w185/')
    .replace(/(eslite\.com\/unsafe\/fit-in\/)x\d+\//, '$1x300/');
}

/** 紀錄的時間換成毫秒：只有日期的當作那天中午，沒帶時區的當作台灣時間（巴哈給的是本地時間） */
function timeOf(s: string | null | undefined): number | null {
  if (!s) return null;
  const iso = s.length <= 10 ? `${s}T12:00:00` : s.replace(' ', 'T');
  const ms = Date.parse(/(?:Z|[+-]\d\d:?\d\d)$/i.test(iso) ? iso : `${iso}+08:00`);
  return Number.isNaN(ms) ? null : ms;
}

/** 動畫紀錄是一集一筆：同一部併成一道訊號，取最近看的那一集 */
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
      date: head.last_watched_at ?? '',
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

export const dotDate = (iso: string) => iso.slice(0, 10).replaceAll('-', '.');

const log01 = (v: number, max: number) => Math.log2(v + 1) / Math.log2(max + 1 || 2);

const stars = (n: number | null | undefined) => (n ? `★ ${n}` : '');

/**
 * 看過的全部：三種來源併在一起（同一部在動畫與影集兩邊都有的只留一道），每部在最後看的那一刻發出。
 * 大小是集數；最愛的那幾部是琥珀色，帶著寫的那句話。最愛卻不在紀錄裡的（紀錄開始之前看的）
 * 沒有時間，排在紀錄的外緣
 */
export function watchSignals(
  anime: AnimeRow[],
  films: FilmRow[],
  tv: TvRow[],
  favorites: WatchFavoriteRow[],
  kindLabel: (k: WatchKind) => string,
): { signals: Signal[]; latest: { title: string; date: string } | null } {
  const deduped = dedupeWatchItems(animeItems(anime), tvItems(tv));
  const all = [...deduped.anime, ...filmItems(films), ...deduped.tv].sort((a, b) => a.date.localeCompare(b.date));
  const maxEp = Math.max(1, ...all.map((it) => it.epCount));
  const fav = new Map(favorites.filter((f) => f.tmdbId != null).map((f) => [f.tmdbId, f]));
  const used = new Set<number>();
  const list: Signal[] = [];
  for (const it of all) {
    const at = timeOf(it.date);
    if (at === null) continue;
    const f = it.tmdbId != null ? fav.get(it.tmdbId) : undefined;
    if (f?.tmdbId != null) used.add(f.tmdbId);
    list.push({
      id: it.id,
      kind: 'watch',
      title: f?.title ?? it.title,
      meta: [kindLabel(it.kind), f ? stars(f.rating) : ''].filter(Boolean).join(' · '),
      cover: thumb(f?.poster ?? it.cover),
      href: f?.externalUrl ?? it.href,
      at,
      size: log01(it.epCount, maxEp),
      amber: Boolean(f),
      quote: f?.quote,
    });
  }
  for (const f of favorites) {
    if (f.tmdbId != null && used.has(f.tmdbId)) continue;
    list.push({
      id: `fav${f.id}`,
      kind: 'watch',
      title: f.title,
      meta: [kindLabel(f.kind === 'film' ? 'film' : 'tv'), f.year, stars(f.rating)].filter(Boolean).join(' · '),
      cover: thumb(f.poster),
      href: f.externalUrl,
      at: null,
      size: 0.5,
      amber: true,
      quote: f.quote,
      beyond: true,
    });
  }
  const latest = all.at(-1);
  return { signals: list, latest: latest?.date ? { title: latest.title, date: dotDate(latest.date) } : null };
}

const statusOf = (b: BookRow): BookStatus =>
  b.reading_status === 'read' || b.reading_status === 'reading' ? b.reading_status : 'to-read';

/**
 * 書：讀完的在讀完那天發出（沒記讀完日期的用加進書櫃那天）。大小是頁數；寫了心得的是琥珀色。
 * 在讀的、想讀的還在地球上
 */
export function bookSignals(books: BookRow[], statusLabel: (s: BookStatus) => string): Signal[] {
  const fav = new Set(favoriteBooks(books).map((b) => b.id));
  const maxPages = Math.max(1, ...books.map((b) => b.page_count ?? 0));
  return books.map((b) => {
    const status = statusOf(b);
    return {
      id: `b${b.id}`,
      kind: 'book',
      title: b.title,
      meta: [b.authors, statusLabel(status), stars(b.rating)].filter(Boolean).join(' · '),
      // 書封來自各家書店（Google Books、誠品、博客來…），一家一家放進 CSP 的 img-src 放不完：
      // 走後端的 image-proxy 變成同源（順便縮成 webp）。影劇與 Spotify 的 CDN 在白名單裡，照舊直連
      cover: b.cover_url ? proxiedImage(thumb(b.cover_url), 384) : null,
      href: null,
      at: status === 'read' ? timeOf(b.date_finished ?? b.date_added) : null,
      size: b.page_count ? log01(b.page_count, maxPages) : 0.35,
      amber: fav.has(b.id),
      quote: fav.has(b.id) ? b.personal_notes : null,
      home: status === 'read' ? undefined : status === 'reading' ? 'live' : 'queued',
    };
  });
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

const coverOf = (t: SpotifyTrack) =>
  // Spotify 的封面有三種大小（640、300、64）：接收畫面用中間那張
  (t.album.images.length > 1 ? t.album.images[1] : t.album.images.at(0))?.url ?? null;

/**
 * 歌：最近播過的每一首在播的那一刻發出（同一首播了幾次只留最近那次），正在播的還在地球上。
 * 最常聽的越前面越大，第一名是琥珀色
 */
export function musicSignals(recent: RecentPlayItem[], top: SpotifyTrack[], playing: SpotifyTrack | null): Signal[] {
  const rank = new Map(top.map((t, i) => [t.id, i]));
  const sizeOf = (id: string) => {
    const r = rank.get(id);
    return r === undefined ? 0.25 : 1 - (0.6 * r) / Math.max(1, top.length);
  };
  const seen = new Set<string>();
  const list: Signal[] = [];
  const push = (t: SpotifyTrack, at: number | null) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    list.push({
      id: `s${t.id}`,
      kind: 'music',
      title: t.name,
      meta: `${artistsOf(t)} · ${t.album.name}`,
      cover: coverOf(t),
      href: t.external_urls.spotify,
      at,
      size: sizeOf(t.id),
      amber: rank.get(t.id) === 0,
      home: at === null ? 'live' : undefined,
      on: at === null,
    });
  };
  if (playing) push(playing, null);
  for (const r of [...recent].sort((a, b) => b.played_at.localeCompare(a.played_at)))
    push(r.track, timeOf(r.played_at));
  return list;
}
