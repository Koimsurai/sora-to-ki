// 碎念後台右邊「最近的紀錄」：把同步進來的看、讀、聽整理成可以附上的候選。
// 不會自己發——按「寫」才帶進左邊的撰寫框（2026-10 後台提案的「碎念」頁）。

import type { AdminTrackItem, AdminWatchItem, BookRow } from '@koimsurai/api-types';

import type { MediaKind } from '@/lib/thoughtRef';
import { parseDbTime } from './adminFormat';

export interface Candidate {
  /** 跟碎念 ref 的 key 對得上（`anime:<sn>`、`track:<id>`…），用來標「已寫」 */
  key: string;
  kind: MediaKind;
  title: string;
  cover: string | null;
  /** 排序用的時間（看、讀完、播放的那一刻） */
  when: string | null;
  /** 後台那一列的小字 */
  facts: string[];
  /** 送給 POST /api/admin/thoughts 的 ref */
  ref: { type: 'media'; url?: string; json: Record<string, unknown> };
}

const SOURCE_LABEL: Record<string, string> = { bahamut: '巴哈', simkl: 'Simkl', trakt: 'Trakt' };
const KIND_LABEL: Record<MediaKind, string> = { anime: '動畫', film: '電影', tv: '影集', book: '書', track: '歌' };

/**
 * 巴哈的集數是原樣的字（「[03]」「特別篇」）。前台原樣顯示 progress、而且不分語系，
 * 所以抓得到數字就寫成 `EP 3`，抓不到才照原樣
 */
export function episodeProgress(detail: string | null): string | null {
  if (!detail) return null;
  const n = /\d+/.exec(detail)?.[0];
  return n ? `EP ${Number(n)}` : detail.trim() || null;
}

export function fromWatch(w: AdminWatchItem): Candidate | null {
  // 設成不公開的不列：站長已經決定它不出現在前台
  if (w.hidden || (w.kind !== 'anime' && w.kind !== 'film' && w.kind !== 'tv')) return null;
  const kind = w.kind;
  const progress = kind === 'anime' ? episodeProgress(w.detail) : null;
  const json: Record<string, unknown> = { kind, title: w.title, key: `${kind}:${w.key}` };
  if (w.cover) json.poster = w.cover;
  if (progress) json.progress = progress;
  // 對上 TMDb 的，後端會去補簡介、評分、類型與年份
  if (w.tmdb_id != null) {
    json.tmdbId = w.tmdb_id;
    json.mediaType = kind === 'film' ? 'movie' : 'tv';
  }
  return {
    key: `${kind}:${w.key}`,
    kind,
    title: w.title,
    cover: w.cover,
    when: w.watched_at,
    facts: [
      KIND_LABEL[kind],
      kind === 'anime' && w.detail ? `看到 ${w.detail}` : w.detail,
      w.source ? (SOURCE_LABEL[w.source] ?? w.source) : null,
    ].filter((v): v is string => !!v),
    ref: { type: 'media', json },
  };
}

export function fromTrack(t: AdminTrackItem): Candidate | null {
  if (t.hidden) return null;
  const json: Record<string, unknown> = { kind: 'track', title: t.name, creator: t.artists, key: `track:${t.id}` };
  if (t.cover) json.poster = t.cover;
  const url = `https://open.spotify.com/track/${encodeURIComponent(t.id)}`;
  json.url = url;
  return {
    key: `track:${t.id}`,
    kind: 'track',
    title: t.name,
    cover: t.cover,
    when: t.played_at,
    facts: [KIND_LABEL.track, t.artists, 'Spotify'].filter(Boolean),
    ref: { type: 'media', url, json },
  };
}

export function fromBook(b: BookRow): Candidate | null {
  // 想讀的還沒讀，沒什麼好說「讀了」
  if (b.reading_status !== 'reading' && b.reading_status !== 'read') return null;
  const json: Record<string, unknown> = { kind: 'book', title: b.title, key: `book:${b.id}` };
  if (b.authors) json.creator = b.authors;
  if (b.cover_url) json.poster = b.cover_url;
  const year = b.published_date?.slice(0, 4);
  if (year && /^\d{4}$/.test(year)) json.year = year;
  return {
    key: `book:${b.id}`,
    kind: 'book',
    title: b.title,
    cover: b.cover_url,
    when: b.date_finished ?? b.date_started ?? b.date_updated ?? b.date_added,
    facts: [KIND_LABEL.book, b.reading_status === 'read' ? '讀完' : '在讀', b.authors].filter((v): v is string => !!v),
    ref: { type: 'media', json },
  };
}

/** 三種紀錄混在一起照時間新到舊；同一首歌只留最近那次播放 */
export function candidates(
  watch: AdminWatchItem[],
  tracks: AdminTrackItem[],
  books: BookRow[],
  limit = 40,
): Candidate[] {
  const seen = new Set<string>();
  const all = [...watch.map(fromWatch), ...tracks.map(fromTrack), ...books.map(fromBook)].filter(
    (c): c is Candidate => {
      if (!c || seen.has(c.key)) return false;
      seen.add(c.key);
      return true;
    },
  );
  // 時間的格式不一（DB 的 'YYYY-MM-DD HH:MM:SS'、Spotify 的 ISO、書架的日期），
  // 字串比較在同一天裡會排錯（'T' 比空白大），所以轉成時間再比；沒有時間或壞掉的排最後
  const at = (c: Candidate) => {
    const t = c.when ? parseDbTime(c.when).getTime() : Number.NaN;
    return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
  };
  // 兩個都沒有時間時 -∞ − -∞ 是 NaN，sort 遇到 NaN 的結果沒有定義，要當成相等
  return all.sort((a, b) => at(b) - at(a) || 0).slice(0, limit);
}
