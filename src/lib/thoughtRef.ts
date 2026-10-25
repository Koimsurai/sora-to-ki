// 碎念附上的東西要怎麼畫：前台（blog/MomentPost）與後台的預覽共用同一份判斷。
// 純函式，不碰 React 也不碰 i18n——種類與動詞的字交給呼叫端翻。

import type { ThoughtOut } from '@koimsurai/api-types';

export const THOUGHT_VERBS = ['watched', 'read', 'listened', 'played', 'shared'] as const;
export type ThoughtVerb = (typeof THOUGHT_VERBS)[number];

const MEDIA_KINDS = ['film', 'tv', 'anime', 'book', 'track'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const isThoughtVerb = (v: unknown): v is ThoughtVerb =>
  typeof v === 'string' && (THOUGHT_VERBS as readonly string[]).includes(v);

const isMediaKind = (v: unknown): v is MediaKind =>
  typeof v === 'string' && (MEDIA_KINDS as readonly string[]).includes(v);

/** 附上某種東西時預設的動詞（後台可以改） */
export function defaultVerb(kind: MediaKind | 'link'): ThoughtVerb {
  if (kind === 'link') return 'shared';
  if (kind === 'book') return 'read';
  if (kind === 'track') return 'listened';
  return 'watched';
}

/** 只放行 http(s)：ref 是後台寫的，但連結與圖片最後是畫在公開頁上 */
export function safeHttp(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : undefined;
}

export interface ThoughtCard {
  type: 'link' | 'media';
  /** media 才有；認不得的種類是 null（舊資料） */
  kind: MediaKind | null;
  title: string;
  href: string | undefined;
  poster: string | undefined;
  /** 第二行的小字：連結是站名；作品是年份、評分、類型、歌手、進度 */
  facts: string[];
}

const text = (v: unknown): string | null => {
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
};

/**
 * 這一則用一行字代表的時候寫什麼（列表、選單、分享標題）：內容的第一行；
 * 只附了作品、沒寫字的那種用作品名
 */
export function thoughtLine(th: Pick<ThoughtOut, 'content' | 'ref' | 'ref_type' | 'ref_url'>): string {
  const first = th.content.trim().split('\n')[0] ?? '';
  return first || (thoughtCard(th)?.title ?? '');
}

/** 一則碎念附的東西整理成卡片；沒附或認不得的回 null */
export function thoughtCard(th: Pick<ThoughtOut, 'ref' | 'ref_type' | 'ref_url'>): ThoughtCard | null {
  const ref = th.ref;
  if (!ref || (th.ref_type !== 'link' && th.ref_type !== 'media')) return null;
  if (th.ref_type === 'link') {
    return {
      type: 'link',
      kind: null,
      // 沒抓到標題就寫網址本身（去掉協定）
      title: text(ref.title) ?? th.ref_url?.replace(/^https?:\/\//, '') ?? '',
      href: safeHttp(th.ref_url),
      poster: undefined,
      facts: [text(ref.site)].filter((v): v is string => v !== null),
    };
  }
  const kind = isMediaKind(ref.kind) ? ref.kind : null;
  const rating = text(ref.rating);
  const facts = [
    text(ref.year),
    text(ref.creator),
    rating ? `★ ${rating}` : null,
    // 類型只留前兩個：「劇情, 犯罪, 驚悚, 懸疑」在一行小字裡太長
    text(ref.genres)?.split(/,\s*/).slice(0, 2).join(' / ') ?? null,
    text(ref.progress),
  ].filter((v): v is string => v !== null);
  return {
    type: 'media',
    kind,
    title: text(ref.title) ?? '',
    href: safeHttp(ref.url ?? th.ref_url),
    poster: safeHttp(ref.poster ?? ref.image),
    facts,
  };
}
